#!/usr/bin/env node
import http from "node:http";
import { orchestrate, publicStatus } from "./orchestrate.js";
import { lastUserText, parseModel } from "./engine.js";

const DEFAULT_PORT = Number(process.env.MAESTRO_PORT || process.env.FUGU_PORT || 8788);
const HOST = process.env.MAESTRO_HOST || process.env.FUGU_HOST || "127.0.0.1";
const API_KEY = process.env.MAESTRO_API_KEY || process.env.FUGU_API_KEY || "shoal-local";

const inflight = new Map();

function send(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    ...extraHeaders,
  });
  res.end(json);
}

function unauthorized(req) {
  const header = req.headers.authorization || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const alt = req.headers["x-api-key"];
  if (!API_KEY) return false;
  return token !== API_KEY && alt !== API_KEY && token !== "unused";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function completionId() {
  return `chatcmpl-maestro-${Date.now().toString(36)}`;
}

function asCompletion(id, model, text, shoal) {
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    shoal,
  };
}

function writeSse(res, payload) {
  res.write(`data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`);
}

function modelsList() {
  const status = publicStatus();
  const core = [
    { id: "maestro-auto", name: "Maestro Auto" },
    { id: "maestro-fast", name: "Maestro Fast" },
    { id: "maestro-quality", name: "Maestro Quality" },
    { id: "maestro-value", name: "Maestro Value" },
    { id: "maestro-speed", name: "Maestro Speed" },
    { id: "maestro-cheap", name: "Maestro Cheap" },
  ];
  for (const w of status.workers.filter((x) => x.ok)) {
    core.push({ id: `maestro-${w.id}`, name: `Maestro · ${w.name}` });
  }
  return {
    object: "list",
    data: core.map((m) => ({
      id: m.id,
      object: "model",
      created: 0,
      owned_by: "maestro-of-cerebellums",
      name: m.name,
    })),
  };
}

async function handleChat(req, res, body, { stream }) {
  const model = body.model || "maestro-auto";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const agentMode = body.agentMode || body.agent_mode || (body.tools ? "ask" : "ask");
  const context = body.context || {};
  const id = completionId();
  const controller = new AbortController();
  inflight.set(id, controller);
  req.on("close", () => controller.abort());

  if (stream) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    writeSse(res, {
      id,
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    });
  }

  try {
    const result = await orchestrate({
      messages,
      model,
      agentMode,
      context: { cwd: body.cwd || context.cwd, ...context },
      enabledWorkers: body.enabledWorkers || null,
      signal: controller.signal,
      onEvent: (event) => {
        if (!stream) return;
        if (event.type === "token" && event.text) {
          writeSse(res, {
            id,
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: { content: event.text }, finish_reason: null }],
          });
        } else if (event.type !== "done") {
          writeSse(res, { id, object: "maestro.event", event });
        }
      },
    });

    if (stream) {
      writeSse(res, {
        id,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        shoal: result.shoal,
      });
      writeSse(res, "[DONE]");
      res.end();
    } else {
      send(res, 200, asCompletion(id, model, result.text, result.shoal));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (stream) {
      writeSse(res, { error: { message } });
      writeSse(res, "[DONE]");
      res.end();
    } else {
      send(res, 500, { error: { message } });
    }
  } finally {
    inflight.delete(id);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/healthz") {
    send(res, 200, { ok: true, name: "maestro-of-cerebellums", ...publicStatus() });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/v1/status")) {
    if (unauthorized(req) && url.pathname === "/v1/models") {
      // Continue / some clients probe models without a key after setting unused
    }
    if (url.pathname === "/v1/status") send(res, 200, publicStatus());
    else send(res, 200, modelsList());
    return;
  }

  if (url.pathname === "/v1/presets") {
    const { publicPresets, saveUserConfig } = await import("./config.js");
    if (req.method === "GET") {
      send(res, 200, publicPresets(publicStatus().workers));
      return;
    }
    if (req.method === "POST") {
      if (unauthorized(req)) {
        send(res, 401, { error: { message: "Unauthorized" } });
        return;
      }
      try {
        const body = await readBody(req);
        const saved = saveUserConfig(body.presets || body);
        send(res, 200, { ok: true, ...publicPresets(publicStatus().workers), presets: saved.presets });
      } catch (err) {
        send(res, 400, { error: { message: err instanceof Error ? err.message : String(err) } });
      }
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/route") {
    try {
      const body = await readBody(req);
      const { classify, planRoute } = await import("./engine.js");
      const { detectWorkers } = await import("./detect.js");
      const prompt = body.prompt || lastUserText(body.messages || []);
      const cls = classify(prompt);
      const parsed = parseModel(body.model);
      send(res, 200, { classify: cls, plan: planRoute(cls, detectWorkers(), parsed.mode) });
    } catch (err) {
      send(res, 400, { error: { message: err instanceof Error ? err.message : String(err) } });
    }
    return;
  }

  if (req.method === "POST" && (url.pathname === "/v1/chat/completions" || url.pathname === "/v1/shoal/run")) {
    if (unauthorized(req)) {
      send(res, 401, { error: { message: "Unauthorized. Use Authorization: Bearer shoal-local" } });
      return;
    }
    try {
      const body = await readBody(req);
      const stream = Boolean(body.stream) || url.pathname === "/v1/shoal/run";
      await handleChat(req, res, body, { stream: url.pathname === "/v1/shoal/run" ? true : stream });
    } catch (err) {
      send(res, 400, { error: { message: err instanceof Error ? err.message : String(err) } });
    }
    return;
  }

  send(res, 404, { error: { message: `Not found: ${url.pathname}` } });
});

function listen(port) {
  server.once("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      process.stdout.write(`maestro-of-cerebellums: ${HOST}:${port} already in use, assuming an existing sidecar\n`);
      process.exit(0);
    }
    console.error(err);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    process.stdout.write(`maestro-of-cerebellums sidecar on http://${HOST}:${port}\n`);
  });
}

if (process.argv[2] === "doctor") {
  const status = publicStatus();
  console.log(JSON.stringify(status, null, 2));
  process.exit(status.ok ? 0 : 1);
} else {
  listen(DEFAULT_PORT);
}
