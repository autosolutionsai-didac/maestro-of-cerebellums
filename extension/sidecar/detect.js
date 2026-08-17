import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getOpenRouterKey } from "./openrouter.js";

export const EXTRA_PATHS = [
  path.join(os.homedir(), ".local", "bin"),
  path.join(os.homedir(), ".grok", "bin"),
  path.join(os.homedir(), ".kimi-code", "bin"),
  path.join(os.homedir(), ".codex", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/Applications/ZCode.app/Contents/Resources/glm",
];

const ZCODE_CJS = "/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs";

export function pathWithBins(base = process.env.PATH || "") {
  return [...EXTRA_PATHS, base].filter(Boolean).join(path.delimiter);
}

export const WORKER_SPECS = [
  {
    id: "claude",
    name: "Claude",
    binName: "claude",
    strengths: ["review", "plan", "debug", "code", "chat", "write"],
    cost: 3,
    quality: 5,
    speed: 3,
  },
  {
    id: "grok",
    name: "Grok",
    binName: "grok",
    strengths: ["code", "debug", "chat", "write", "plan"],
    cost: 2,
    quality: 4,
    speed: 5,
  },
  {
    id: "openai",
    name: "OpenAI",
    binName: "codex",
    aliases: ["codex"],
    strengths: ["code", "debug", "review"],
    cost: 3,
    quality: 4,
    speed: 3,
  },
  {
    id: "kimi",
    name: "Kimi",
    binName: "kimi",
    strengths: ["code", "chat", "write", "review"],
    cost: 1,
    quality: 3,
    speed: 5,
  },
  {
    id: "zai",
    name: "Zai",
    binName: "zcode",
    aliases: ["glm", "zcode"],
    fallbacks: [ZCODE_CJS],
    strengths: ["code", "chat", "write", "review", "debug"],
    cost: 1,
    quality: 4,
    speed: 4,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    binName: null,
    kind: "api",
    aliases: ["or"],
    strengths: ["review", "plan", "debug", "code", "chat", "write"],
    cost: 2,
    quality: 4,
    speed: 4,
  },
];

const ALIASES = {
  glm: "zai",
  zcode: "zai",
  codex: "openai",
  or: "openrouter",
};

function resolveBin(spec, envPath) {
  const names = [spec.binName, ...(spec.binAliases || [])];
  for (const binName of names) {
    const which = spawnSync("which", [binName], {
      encoding: "utf8",
      env: { ...process.env, PATH: envPath },
    });
    const found = (which.stdout || "").trim();
    if (which.status === 0 && found && fs.existsSync(found)) return found;
    for (const dir of EXTRA_PATHS) {
      const candidate = path.join(dir, binName);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  for (const fb of spec.fallbacks || []) {
    if (fs.existsSync(fb)) return fb;
  }
  return null;
}

function versionOf(binPath, spec, envPath) {
  const args = spec.id === "zai" ? ["version"] : ["--version"];
  const r = spawnSync(binPath, args, {
    encoding: "utf8",
    timeout: 8000,
    env: { ...process.env, PATH: envPath },
  });
  const text = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
  return text.split("\n")[0].slice(0, 120) || "installed";
}

export function detectWorkers(enabledIds = null) {
  const envPath = pathWithBins();
  const allowed = enabledIds
    ? enabledIds.map((id) => ALIASES[id] || id)
    : null;
  return WORKER_SPECS.map((spec) => {
    const enabled = !allowed || allowed.includes(spec.id);
    let bin = null;
    let version = null;
    let error = null;
    if (!enabled) error = "disabled";
    else if (spec.id === "openrouter") {
      const key = getOpenRouterKey();
      if (key) {
        version = "OpenRouter API";
        bin = "openrouter";
      } else error = "API key not set";
    } else {
      bin = resolveBin(spec, envPath);
      if (!bin) error = "not installed";
      else {
        try {
          version = versionOf(bin, spec, envPath);
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
      }
    }
    return {
      ...spec,
      bin,
      version,
      ok: Boolean(bin) && !error,
      error,
    };
  });
}

export function workerById(workers, id) {
  const resolved = ALIASES[id] || id;
  return workers.find((w) => w.id === resolved || (w.aliases || []).includes(id)) || null;
}
