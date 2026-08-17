import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathWithBins } from "./detect.js";
import { canonicalModelId, isCliDefault } from "./models.js";
import { chatOpenRouter } from "./openrouter.js";

const DEFAULT_TIMEOUT_MS = 180_000;

function tmpPromptFile(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-"));
  const file = path.join(dir, "prompt.txt");
  fs.writeFileSync(file, text, "utf8");
  return { dir, file };
}

function cleanupTmp(tmp) {
  try {
    fs.rmSync(tmp.dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function runProcess({ bin, args, cwd, env, timeoutMs, signal, onLine, stdinText }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, PATH: pathWithBins(), ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (err, code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve({ stdout, stderr, code });
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500);
      finish(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs || DEFAULT_TIMEOUT_MS);

    if (signal) {
      if (signal.aborted) {
        child.kill("SIGTERM");
        finish(Object.assign(new Error("Aborted"), { aborted: true }));
        return;
      }
      signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
        finish(Object.assign(new Error("Aborted"), { aborted: true }));
      });
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (onLine) {
        const lines = stdout.split(/\r?\n/);
        stdout = lines.pop() || "";
        for (const line of lines) onLine(line, "stdout");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => finish(err));
    child.on("close", (code) => {
      if (onLine && stdout) onLine(stdout, "stdout");
      finish(null, code);
    });

    if (stdinText) child.stdin.write(stdinText);
    child.stdin.end();
  });
}

function extractClaudeJson(text) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    return parsed.result || parsed.message || parsed.text || parsed.content || trimmed;
  } catch {
    const lines = trimmed.split(/\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed.type === "result" && (parsed.result || parsed.subtype === "success")) {
          return parsed.result || "";
        }
        if (parsed.result) return parsed.result;
      } catch {
        // keep scanning
      }
    }
    return trimmed;
  }
}

function extractGrokJson(text) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    return (
      parsed.result ||
      parsed.text ||
      parsed.output ||
      parsed.message ||
      parsed.response ||
      parsed.content ||
      trimmed
    );
  } catch {
    const lines = trimmed.split(/\n/).filter(Boolean);
    let acc = "";
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "assistant" && parsed.message?.content) {
          const parts = parsed.message.content;
          if (Array.isArray(parts)) acc += parts.map((p) => p.text || "").join("");
        }
        if (parsed.delta?.text) acc += parsed.delta.text;
        if (parsed.type === "result" && parsed.result) acc = parsed.result;
      } catch {
        // ignore
      }
    }
    return acc || trimmed;
  }
}

function maybeToken(onToken, text) {
  if (onToken && text) onToken(text);
}

function normalizeEffort(effort) {
  const value = String(effort || "default").toLowerCase();
  if (!value || value === "default") return null;
  if (value === "xhigh") return "max";
  return value;
}

function applyEffort(workerId, args, effort) {
  const level = normalizeEffort(effort);
  if (!level) return args;
  if (workerId === "claude") {
    const mapped = level === "max" ? "max" : level;
    args.push("--effort", mapped);
  } else if (workerId === "grok") {
    const mapped = level === "max" ? "high" : level;
    args.push("--reasoning-effort", mapped);
  } else if (workerId === "openai") {
    const mapped = level === "max" ? "xhigh" : level;
    args.push("-c", `model_reasoning_effort=${mapped}`);
  }
  return args;
}

function kimiEffortEnv(effort) {
  const level = normalizeEffort(effort);
  if (!level || level === "off") return {};
  const mapped = level === "xhigh" ? "max" : level;
  return { KIMI_MODEL_THINKING_EFFORT: mapped };
}

function resolvedModel(workerId, model) {
  const id = canonicalModelId(workerId, model);
  return isCliDefault(id) ? null : id;
}

function applyModel(workerId, args, model) {
  const id = resolvedModel(workerId, model);
  if (!id) return args;
  if (workerId === "claude") args.push("--model", id);
  else if (workerId === "grok" || workerId === "openai") args.push("-m", id);
  return args;
}

function writeZaiSettings(model) {
  const src = path.join(os.homedir(), ".zcode", "cli", "config.json");
  let base = {};
  try {
    base = JSON.parse(fs.readFileSync(src, "utf8"));
  } catch {
    // start from empty if the user has never opened ZCode CLI settings
  }
  const next = { ...base, model: { ...(base.model || {}), main: model } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-zai-"));
  const file = path.join(dir, "settings.json");
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return { dir, file };
}

export async function runClaude(worker, { prompt, cwd, agentMode, signal, onToken, timeoutMs, effort, model }) {
  const args = applyModel(worker.id, applyEffort(worker.id, [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--permission-mode",
    agentMode === "agent" ? "acceptEdits" : "plan",
    "--no-session-persistence",
  ], effort), model);
  const result = await runProcess({
    bin: worker.bin,
    args,
    cwd,
    signal,
    timeoutMs,
  });
  if (result.code !== 0 && !result.stdout.trim()) {
    throw new Error(result.stderr.trim() || `claude exited ${result.code}`);
  }
  const text = String(extractClaudeJson(result.stdout) || "").trim();
  maybeToken(onToken, text);
  return { text, raw: result.stdout, stderr: result.stderr };
}

export async function runGrok(worker, { prompt, cwd, agentMode, signal, onToken, timeoutMs, effort, model }) {
  const tmp = prompt.length > 6000 ? tmpPromptFile(prompt) : null;
  try {
    const args = applyModel(worker.id, applyEffort(worker.id, [
      "--output-format",
      "json",
      "--permission-mode",
      agentMode === "agent" ? "acceptEdits" : "plan",
    ], effort), model);
    if (tmp) args.push("--prompt-file", tmp.file);
    else args.push("-p", prompt);
    const result = await runProcess({
      bin: worker.bin,
      args,
      cwd,
      signal,
      timeoutMs,
    });
    if (result.code !== 0 && !result.stdout.trim()) {
      throw new Error(result.stderr.trim() || `grok exited ${result.code}`);
    }
    const text = String(extractGrokJson(result.stdout) || result.stdout).trim();
    maybeToken(onToken, text);
    return { text, raw: result.stdout, stderr: result.stderr };
  } finally {
    if (tmp) cleanupTmp(tmp);
  }
}

export async function runCodex(worker, { prompt, cwd, agentMode, signal, onToken, timeoutMs, effort, model }) {
  const tmp = tmpPromptFile(prompt);
  const outFile = path.join(tmp.dir, "last.txt");
  try {
    const args = applyModel(worker.id, applyEffort(worker.id, [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "-s",
      agentMode === "agent" ? "workspace-write" : "read-only",
      "-o",
      outFile,
      "-",
    ], effort), model);
    const result = await runProcess({
      bin: worker.bin,
      args,
      cwd,
      signal,
      timeoutMs,
      stdinText: prompt,
    });
    let text = "";
    if (fs.existsSync(outFile)) text = fs.readFileSync(outFile, "utf8").trim();
    if (!text) text = result.stdout.trim();
    if (!text && result.code !== 0) {
      throw new Error(result.stderr.trim() || `codex exited ${result.code}`);
    }
    maybeToken(onToken, text);
    return { text, raw: result.stdout, stderr: result.stderr };
  } finally {
    cleanupTmp(tmp);
  }
}

export async function runKimi(worker, { prompt, cwd, agentMode, signal, onToken, timeoutMs, effort, model }) {
  const kimiModel = resolvedModel(worker.id, model) || "kimi-code/k3";
  const args = ["-m", kimiModel, "-p", prompt, "--output-format", "text"];
  if (agentMode === "agent") args.unshift("--auto");
  const result = await runProcess({
    bin: worker.bin,
    args,
    cwd,
    env: kimiEffortEnv(effort),
    signal,
    timeoutMs,
  });
  const text = result.stdout.trim();
  if (!text && result.code !== 0) {
    throw new Error(result.stderr.trim() || `kimi exited ${result.code}`);
  }
  maybeToken(onToken, text);
  return { text, raw: result.stdout, stderr: result.stderr };
}

function zaiEnv() {
  const env = {};
  const fromEnv = process.env.ZAI_API_KEY || process.env.ZCODE_API_KEY || process.env.GLM_API_KEY;
  if (fromEnv) {
    env.ZAI_API_KEY = fromEnv;
    env.ZCODE_API_KEY = fromEnv;
    return env;
  }
  try {
    const v2 = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".zcode", "v2", "config.json"), "utf8"));
    const providers = v2.provider || {};
    for (const id of ["builtin:zai-coding-plan", "builtin:zai"]) {
      const key = providers[id]?.options?.apiKey;
      if (key) {
        env.ZAI_API_KEY = key;
        env.ZCODE_API_KEY = key;
        return env;
      }
    }
  } catch {
    // GUI config may be absent; zcode can still use its own login
  }
  return env;
}

export async function runZai(worker, { prompt, cwd, agentMode, signal, onToken, timeoutMs, model }) {
  const args = ["--prompt", prompt, "--mode", agentMode === "agent" ? "edit" : "plan"];
  const zaiModel = resolvedModel(worker.id, model);
  const settings = zaiModel ? writeZaiSettings(zaiModel) : null;
  if (settings) args.push("--settings", settings.file);
  try {
    const result = await runProcess({
      bin: worker.bin,
      args,
      cwd,
      env: zaiEnv(),
      signal,
      timeoutMs,
    });
    const text = result.stdout.trim();
    if (!text && result.code !== 0) {
      throw new Error(result.stderr.trim() || `zcode exited ${result.code}`);
    }
    maybeToken(onToken, text);
    return { text, raw: result.stdout, stderr: result.stderr };
  } finally {
    if (settings) cleanupTmp(settings);
  }
}

export async function runOpenRouter(worker, { prompt, onToken, timeoutMs, effort, model, signal }) {
  const text = await chatOpenRouter({
    model: resolvedModel(worker.id, model) || "openrouter/auto",
    prompt,
    effort,
    signal,
    timeoutMs,
  });
  maybeToken(onToken, text);
  return { text, raw: text, stderr: "" };
}

const RUNNERS = {
  claude: runClaude,
  grok: runGrok,
  openai: runCodex,
  kimi: runKimi,
  zai: runZai,
  openrouter: runOpenRouter,
};

export async function runWorker(worker, opts) {
  const runner = RUNNERS[worker.id];
  if (!runner) throw new Error(`No adapter for ${worker.id}`);
  return runner(worker, opts);
}
