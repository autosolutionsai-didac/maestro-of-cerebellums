import { loadUserConfig } from "./config.js";
import { resolveFusionPreset } from "./presets.js";

const FUSION_MODES = new Set(["quality", "value", "speed", "cheap"]);

const REVIEW = /\b(review|audit|security|vulnerabilit|owasp|pull request|\bpr\b|code smell)\b/i;
const DEBUG = /\b(debug|crash|stack trace|exception|repro|not working|doesn't work|fails?|regression|hangs?)\b/i;
const PLAN = /\b(architect|architecture|system design|design a|migrate|migration|roadmap|trade-?off)\b/i;
const CODE =
  /\b(code|function|implement|refactor|typescript|javascript|python|rust|golang|react|api|endpoint|class |unit test|fix the|patch|module|component)\b/i;
const WRITE = /\b(write|draft|email|rewrite|summarize|translate|explain|what is|how do i)\b/i;
const SIMPLE_CHAT = /^\s*(hi|hello|hey|thanks|thank you|thx|yo|ok|okay|sup)\b/i;

export function classify(text) {
  const t = String(text || "").trim();
  const lower = t.toLowerCase();
  const len = t.length;

  let kind = "chat";
  let difficulty = 0.25;
  let confidence = 0.62;

  if (REVIEW.test(lower)) {
    kind = "review";
    difficulty = 0.78;
    confidence = 0.84;
  } else if (DEBUG.test(lower)) {
    kind = "debug";
    difficulty = 0.64;
    confidence = 0.8;
  } else if (PLAN.test(lower)) {
    kind = "plan";
    difficulty = 0.8;
    confidence = 0.82;
  } else if (CODE.test(lower)) {
    kind = "code";
    difficulty = 0.55;
    confidence = 0.78;
  } else if (WRITE.test(lower)) {
    kind = "write";
    difficulty = 0.32;
    confidence = 0.7;
  }

  if (SIMPLE_CHAT.test(t) && len < 48) {
    kind = "chat";
    difficulty = 0.05;
    confidence = 0.9;
  }

  if (len > 4000) difficulty = Math.min(1, difficulty + 0.12);
  if (len > 12000) difficulty = Math.min(1, difficulty + 0.1);
  if ((t.match(/```/g) || []).length >= 2) difficulty = Math.min(1, difficulty + 0.08);
  if (/\b(file|repo|codebase|workspace|src\/)/i.test(t)) difficulty = Math.min(1, difficulty + 0.04);

  const needsWorkspace =
    kind === "code" ||
    kind === "debug" ||
    kind === "review" ||
    /\b(file|repo|codebase|src\/|this (function|class|module))\b/i.test(lower);

  return { kind, difficulty, needsWorkspace, confidence, chars: len };
}

function scoreWorker(worker, cls, preferCheap) {
  const hasStrength = worker.strengths.includes(cls.kind) ? 1 : 0.55;
  const quality = worker.quality / 5;
  const speed = worker.speed / 5;
  const cheap = (4 - worker.cost) / 3;
  const base = preferCheap
    ? cheap * 0.55 + speed * 0.25 + quality * 0.2
    : quality * 0.5 + speed * 0.2 + cheap * 0.15 + hasStrength * 0.15;
  return base * (0.7 + 0.3 * hasStrength);
}

export function pickWorker(cls, workers, { preferCheap = false, exclude = [] } = {}) {
  const pool = workers.filter((w) => w.ok && !exclude.includes(w.id));
  if (!pool.length) return null;
  return [...pool].sort((a, b) => scoreWorker(b, cls, preferCheap) - scoreWorker(a, cls, preferCheap))[0];
}

export function planRoute(cls, workers, mode = "auto") {
  const available = workers.filter((w) => w.ok);
  if (!available.length) {
    return { error: "No local coding CLIs found. Install and log into claude, grok, codex, kimi, or zcode." };
  }

  if (FUSION_MODES.has(mode)) {
    return resolveFusionPreset(mode, workers, loadUserConfig().presets);
  }

  if (mode === "fast") {
    const worker = pickWorker(cls, available, { preferCheap: true });
    return {
      mode,
      steps: [{ role: "answer", worker: worker.id }],
      reason: `Fast path: cheapest capable worker for ${cls.kind}.`,
    };
  }

  if (mode === "ultra" && cls.difficulty >= 0.4 && available.length >= 2) {
    const a = pickWorker(cls, available, { preferCheap: false });
    const b = pickWorker(cls, available, { preferCheap: true, exclude: [a.id] });
    const synth = pickWorker({ ...cls, kind: "write" }, available, {
      preferCheap: false,
      exclude: available.length > 2 ? [] : [],
    });
    const steps = [
      { role: "draft", worker: a.id },
      { role: "draft", worker: b.id, parallel: true },
    ];
    if (synth) steps.push({ role: "synthesize", worker: synth.id });
    return {
      mode,
      steps,
      reason: "Ultra: two workers draft in parallel, then one answer is synthesized.",
    };
  }

  const preferCheap = cls.difficulty < 0.35 || cls.kind === "chat" || cls.kind === "write";
  const primary = pickWorker(cls, available, { preferCheap });
  const steps = [{ role: "answer", worker: primary.id }];
  const shouldVerify = cls.difficulty >= 0.6 || cls.kind === "review" || cls.kind === "plan" || cls.kind === "debug";
  if (shouldVerify && available.length >= 2) {
    const verifier = pickWorker(
      { ...cls, kind: cls.kind === "code" ? "review" : cls.kind },
      available,
      { preferCheap: false, exclude: [primary.id] }
    );
    if (verifier) {
      steps.push({ role: "verify", worker: verifier.id });
      const stronger = pickWorker(cls, available, {
        preferCheap: false,
        exclude: [primary.id],
      });
      if (stronger && stronger.quality > primary.quality) {
        steps.push({ role: "escalate", worker: stronger.id, onlyIf: "REVISE" });
      }
    }
  }

  return {
    mode: "auto",
    steps,
    reason: preferCheap
      ? `Auto: ${cls.kind} looks cheap enough for ${primary.name}.`
      : `Auto: ${primary.name} first for ${cls.kind} (difficulty ${cls.difficulty.toFixed(2)}).`,
  };
}

export function parseVerdict(text) {
  const first = String(text || "")
    .trim()
    .split(/\n/)[0]
    .toUpperCase();
  if (/\bREVISE\b/.test(first) || /\bREVISE\b/.test(String(text).toUpperCase())) return "REVISE";
  return "ACCEPT";
}

export function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === "user") return messageText(m);
  }
  return "";
}

export function messageText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.text) return part.text;
        if (part?.type === "text" && part.text) return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function formatTranscript(messages, limit = 12) {
  const slice = messages.slice(-limit);
  return slice
    .map((m) => `${(m.role || "user").toUpperCase()}:\n${messageText(m)}`)
    .join("\n\n");
}

export function parseModel(model) {
  const raw = String(model || "maestro-auto").toLowerCase();
  if (raw.includes("quality") || raw.includes("best") || raw === "ultra" || raw.includes("ultra")) {
    return { mode: "quality", pin: null };
  }
  if (raw.includes("value") || raw.includes("balanced")) return { mode: "value", pin: null };
  if (raw.includes("cheap") || raw.includes("bargain")) return { mode: "cheap", pin: null };
  if (raw.includes("speed")) return { mode: "speed", pin: null };
  if (raw.includes("fast")) return { mode: "fast", pin: null };
  const pins = {
    claude: "claude",
    grok: "grok",
    openai: "openai",
    kimi: "kimi",
    zai: "zai",
    glm: "zai",
    zcode: "zai",
    codex: "openai",
    openrouter: "openrouter",
    or: "openrouter",
  };
  const hit = Object.keys(pins).find(
    (id) => raw === `maestro-${id}` || raw === `fugu-${id}` || raw.endsWith(`/${id}`)
  );
  return { mode: "auto", pin: hit ? pins[hit] : null };
}
