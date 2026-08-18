import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FUSION_PRESETS } from "./presets.js";
import {
  MODEL_CATALOG,
  PROVIDER_LABELS,
  KNOWN_EFFORTS,
  canonicalModelId,
  clampStoredEffort,
  effortsByWorker,
  memberKey,
  modelLabel,
  publicCatalog,
} from "./models.js";
import { getOpenRouterKey, maskKey, mergeOpenRouterCatalog, readStoredOpenRouter } from "./openrouter.js";

export const WORKER_IDS = ["claude", "openai", "grok", "kimi", "zai", "openrouter"];
export const EFFORTS = KNOWN_EFFORTS;
export const EFFORTS_BY_WORKER = effortsByWorker();
export const PRESET_IDS = ["quality", "value", "speed", "cheap"];

const DEFAULT_PRESET_MEMBERS = {
  quality: {
    panel: [
      { id: "claude", model: "claude-opus-5", effort: "max" },
      { id: "openai", model: "gpt-5.6-sol", effort: "high" },
      { id: "grok", model: "grok-4.6", effort: "high" },
    ],
    judge: { id: "claude", model: "claude-opus-5", effort: "high" },
  },
  value: {
    panel: [
      { id: "claude", model: "claude-sonnet-5", effort: "high" },
      { id: "openai", model: "gpt-5.6-terra", effort: "high" },
    ],
    judge: { id: "claude", model: "claude-sonnet-5", effort: "high" },
  },
  speed: {
    panel: [
      { id: "grok", model: "grok-4.6", effort: "low" },
      { id: "kimi", model: "kimi-code/kimi-for-coding-highspeed", effort: "default" },
      { id: "zai", model: "zai/GLM-5-Turbo", effort: "default" },
    ],
    judge: { id: "grok", model: "grok-4.6", effort: "low" },
  },
  cheap: {
    panel: [
      { id: "kimi", model: "kimi-code/k3", effort: "low" },
      { id: "zai", model: "zai/GLM-5.3", effort: "default" },
    ],
    judge: { id: "grok", model: "grok-4.5", effort: "medium" },
  },
};

const QUALITY_FALLBACKS = [
  { id: "claude", model: "claude-opus-5", effort: "max" },
  { id: "openai", model: "gpt-5.6-sol", effort: "high" },
  { id: "grok", model: "grok-4.6", effort: "high" },
  { id: "claude", model: "claude-fable-5", effort: "high" },
  { id: "openai", model: "gpt-5.5", effort: "high" },
  { id: "claude", model: "claude-sonnet-5", effort: "high" },
  { id: "kimi", model: "kimi-code/k3", effort: "max" },
  { id: "zai", model: "zai/GLM-5.3", effort: "default" },
];

const VALUE_FALLBACKS = [
  { id: "claude", model: "claude-sonnet-5", effort: "high" },
  { id: "openai", model: "gpt-5.6-terra", effort: "high" },
  { id: "grok", model: "grok-4.6", effort: "medium" },
  { id: "openai", model: "gpt-5.6-luna", effort: "medium" },
  { id: "kimi", model: "kimi-code/k3", effort: "high" },
  { id: "zai", model: "zai/GLM-5.3", effort: "default" },
];

const SPEED_FALLBACKS = [
  { id: "grok", model: "grok-4.6", effort: "low" },
  { id: "kimi", model: "kimi-code/kimi-for-coding-highspeed", effort: "default" },
  { id: "zai", model: "zai/GLM-5-Turbo", effort: "default" },
  { id: "openai", model: "gpt-5.3-codex-spark", effort: "low" },
  { id: "openai", model: "gpt-5.6-luna", effort: "low" },
  { id: "claude", model: "claude-haiku-4-5", effort: "low" },
  { id: "kimi", model: "kimi-code/k3-256k", effort: "low" },
];

const CHEAP_FALLBACKS = [
  { id: "kimi", model: "kimi-code/k3", effort: "low" },
  { id: "zai", model: "zai/GLM-5.3", effort: "default" },
  { id: "grok", model: "grok-4.5", effort: "medium" },
  { id: "kimi", model: "kimi-code/kimi-for-coding", effort: "low" },
  { id: "zai", model: "zai/GLM-5.2", effort: "default" },
  { id: "openai", model: "gpt-5.4-mini", effort: "low" },
];

export function preferredConfigPath() {
  return (
    process.env.MAESTRO_CONFIG ||
    process.env.FUGU_CONFIG ||
    path.join(os.homedir(), ".maestro-of-cerebellums", "config.json")
  );
}

export function configPath() {
  const preferred = preferredConfigPath();
  if (fs.existsSync(preferred)) return preferred;
  const legacy = path.join(os.homedir(), ".fugu-local", "config.json");
  if (fs.existsSync(legacy) && !process.env.MAESTRO_CONFIG && !process.env.FUGU_CONFIG) return legacy;
  return preferred;
}

export function member(id, model, effort) {
  const worker = id || "claude";
  const resolved = canonicalModelId(worker, model);
  return {
    id: worker,
    model: resolved,
    effort: clampStoredEffort(worker, resolved, effort),
  };
}

function slot(raw, fallback) {
  if (typeof raw === "string") {
    if (WORKER_IDS.includes(raw)) return member(raw, "default", "default");
    const fromCatalog = Object.entries(MODEL_CATALOG).find(([, models]) =>
      models.some((m) => m.id === raw || (m.aliases || []).includes(raw))
    );
    if (fromCatalog) return member(fromCatalog[0], raw, "default");
    return member(raw, "default", "default");
  }
  if (raw && typeof raw === "object" && raw.id) {
    return member(String(raw.id), raw.model, raw.effort);
  }
  return fallback ? member(fallback.id, fallback.model, fallback.effort) : null;
}

export function defaultPresetMembers() {
  return structuredClone(DEFAULT_PRESET_MEMBERS);
}

function pickMembers(wanted, available, max) {
  const out = [];
  const seen = new Set();
  const usedWorkers = new Set();

  const take = (item, requireNewWorker) => {
    if (!available.has(item.id)) return;
    if (requireNewWorker && usedWorkers.has(item.id)) return;
    const next = member(item.id, item.model, item.effort);
    const key = memberKey(next);
    if (seen.has(key)) return;
    seen.add(key);
    usedWorkers.add(next.id);
    out.push(next);
  };

  for (const item of wanted) {
    take(item, true);
    if (out.length >= max) return out;
  }
  for (const item of wanted) {
    take(item, false);
    if (out.length >= max) return out;
  }
  for (const id of WORKER_IDS) {
    if (!available.has(id) || usedWorkers.has(id)) continue;
    const first = (MODEL_CATALOG[id] || [])[0];
    take({ id, model: first?.id || "default", effort: "default" }, true);
    if (out.length >= max) break;
  }
  return out;
}

function firstAvailable(order, available, fallbacks) {
  for (const item of order) {
    if (available.has(item.id)) return member(item.id, item.model, item.effort);
  }
  return fallbacks[0] ? member(fallbacks[0].id, fallbacks[0].model, fallbacks[0].effort) : member("claude");
}

function labelsFor(members) {
  return members.map((m) => modelLabel(m.id, m.model)).join(" + ");
}

export function recommendPresets(workers) {
  const available = new Set((workers || []).filter((w) => w.ok).map((w) => w.id));
  const qualityPanel = pickMembers(QUALITY_FALLBACKS, available, 3);
  const valuePanel = pickMembers(VALUE_FALLBACKS, available, 2);
  const speedPanel = pickMembers(SPEED_FALLBACKS, available, 3);
  const cheapPanel = pickMembers(CHEAP_FALLBACKS, available, 2);

  const qualityJudge = firstAvailable(
    [
      { id: "claude", model: "claude-opus-5", effort: "high" },
      { id: "claude", model: "claude-fable-5", effort: "high" },
      { id: "openai", model: "gpt-5.6-sol", effort: "high" },
      { id: "grok", model: "grok-4.6", effort: "high" },
    ],
    available,
    qualityPanel
  );
  const valueJudge = firstAvailable(
    [
      { id: "claude", model: "claude-sonnet-5", effort: "high" },
      { id: "openai", model: "gpt-5.6-terra", effort: "high" },
      { id: "claude", model: "claude-opus-5", effort: "high" },
    ],
    available,
    valuePanel
  );
  const speedJudge = firstAvailable(
    [
      { id: "grok", model: "grok-4.6", effort: "low" },
      { id: "openai", model: "gpt-5.6-luna", effort: "low" },
      { id: "kimi", model: "kimi-code/kimi-for-coding-highspeed", effort: "default" },
    ],
    available,
    speedPanel
  );
  const cheapJudge = firstAvailable(
    [
      { id: "grok", model: "grok-4.5", effort: "medium" },
      { id: "grok", model: "grok-4.6", effort: "medium" },
      { id: "kimi", model: "kimi-code/k3", effort: "high" },
    ],
    available,
    cheapPanel
  );

  const detected = [...available];
  return {
    quality: {
      ...FUSION_PRESETS.quality,
      panel: qualityPanel,
      judge: qualityJudge,
      fit: qualityPanel.length
        ? `Detected strongest: ${labelsFor(qualityPanel)}.`
        : "No CLIs detected yet.",
    },
    value: {
      ...FUSION_PRESETS.value,
      panel: valuePanel,
      judge: valueJudge,
      fit: valuePanel.length
        ? `Second-best pair from what is installed: ${labelsFor(valuePanel)}.`
        : "No CLIs detected yet.",
    },
    speed: {
      ...FUSION_PRESETS.speed,
      panel: speedPanel,
      judge: speedJudge,
      fit: speedPanel.length ? `Fastest installed: ${labelsFor(speedPanel)}.` : "No CLIs detected yet.",
    },
    cheap: {
      ...FUSION_PRESETS.cheap,
      panel: cheapPanel,
      judge: cheapJudge,
      fit: cheapPanel.length ? `Cheapest installed pair: ${labelsFor(cheapPanel)}.` : "No CLIs detected yet.",
    },
    detected,
  };
}

export function hasAcceptedSetup() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    if (raw.accepted === true || raw.setupComplete === true) return true;
    return Boolean(raw.presets);
  } catch {
    return false;
  }
}

export function normalizePresets(input) {
  const defaults = defaultPresetMembers();
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  for (const id of PRESET_IDS) {
    const base = defaults[id];
    const raw = src[id] || {};
    const panel = Array.isArray(raw.panel)
      ? raw.panel.map((item) => slot(item)).filter(Boolean)
      : base.panel.map((item) => ({ ...item }));
    const seen = new Set();
    const unique = [];
    for (const item of panel) {
      if (!WORKER_IDS.includes(item.id)) continue;
      const key = memberKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    const judge = slot(raw.judge, base.judge);
    out[id] = {
      ...FUSION_PRESETS[id],
      panel: unique.length ? unique : base.panel.map((item) => ({ ...item })),
      judge: judge && WORKER_IDS.includes(judge.id) ? judge : { ...base.judge },
    };
  }
  return out;
}

export function loadUserConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    return { presets: normalizePresets(raw.presets || raw), openrouter: raw.openrouter || {} };
  } catch {
    return { presets: normalizePresets(), openrouter: {} };
  }
}

function readRawConfig() {
  try {
    return JSON.parse(fs.readFileSync(preferredConfigPath(), "utf8"));
  } catch {
    try {
      return JSON.parse(fs.readFileSync(configPath(), "utf8"));
    } catch {
      return {};
    }
  }
}

export function saveUserConfig(presets) {
  const file = preferredConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const prev = readRawConfig();
  const next = {
    ...prev,
    accepted: true,
    setupComplete: true,
    presets: normalizePresets(presets),
  };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function saveOpenRouterSettings({ apiKey, models, clear = false } = {}) {
  const file = preferredConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const prev = readRawConfig();
  const current = prev.openrouter && typeof prev.openrouter === "object" ? prev.openrouter : {};
  let nextOr = { ...current };
  if (clear) {
    nextOr = { models: [] };
  } else {
    if (typeof apiKey === "string" && apiKey.trim()) nextOr.apiKey = apiKey.trim();
    if (Array.isArray(models)) nextOr.models = models;
  }
  const next = { ...prev, openrouter: nextOr };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return publicOpenRouter();
}

export function publicOpenRouter() {
  const stored = readStoredOpenRouter();
  const envKey = Boolean((process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_TOKEN || "").trim());
  const key = getOpenRouterKey();
  return {
    hasKey: Boolean(key),
    fromEnv: envKey,
    last4: maskKey(key),
    models: mergeOpenRouterCatalog(stored.models || []),
  };
}

export function publicPresets(workers = []) {
  const setupNeeded = !hasAcceptedSetup();
  const recommended = recommendPresets(workers);
  const current = setupNeeded ? recommended : loadUserConfig().presets;
  return {
    path: configPath(),
    efforts: EFFORTS,
    effortsByWorker: EFFORTS_BY_WORKER,
    workerIds: WORKER_IDS,
    providerLabels: PROVIDER_LABELS,
    modelsByWorker: publicCatalog({ openrouter: publicOpenRouter().models }),
    openrouter: publicOpenRouter(),
    workers: workers.map((w) => ({ id: w.id, name: w.name, ok: w.ok })),
    defaults: defaultPresetMembers(),
    recommended: {
      quality: recommended.quality,
      value: recommended.value,
      speed: recommended.speed,
      cheap: recommended.cheap,
    },
    detected: recommended.detected,
    setupNeeded,
    presets: {
      quality: current.quality,
      value: current.value,
      speed: current.speed,
      cheap: current.cheap,
    },
  };
}

export { modelLabel };
