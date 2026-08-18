/**
 * Concrete models each local CLI can run.
 * Fusion panels store { id: worker, model, effort }, not just "claude".
 * Effort names are provider-native (xhigh, none, minimal) — never remapped in the UI.
 */

export const PROVIDER_LABELS = {
  claude: "Claude",
  openai: "OpenAI",
  grok: "Grok",
  kimi: "Kimi",
  zai: "Zai",
  openrouter: "OpenRouter",
};

/** Provider tokens we accept in config / the picker. `default` means omit the flag. */
export const KNOWN_EFFORTS = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"];

const EFFORT_RANK = {
  default: -1,
  none: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
  max: 6,
};

export const EFFORT_SETS = {
  claude5: ["low", "medium", "high", "xhigh", "max"],
  gpt56: ["none", "low", "medium", "high", "xhigh", "max"],
  gpt55: ["none", "low", "medium", "high", "xhigh"],
  grok46: ["low", "medium", "high", "xhigh"],
  grok45: ["low", "medium", "high"],
  kimiK3: ["low", "high", "max"],
  none: [],
};

const KNOWN_SET = new Set(KNOWN_EFFORTS);

export function sortEfforts(list) {
  return [...new Set((list || []).map((e) => String(e).toLowerCase()).filter((e) => KNOWN_SET.has(e)))].sort(
    (a, b) => (EFFORT_RANK[a] ?? 99) - (EFFORT_RANK[b] ?? 99)
  );
}

export function pickerFromNative(native) {
  const levels = sortEfforts((native || []).filter((e) => e && e !== "default"));
  return levels.length ? ["default", ...levels] : ["default"];
}

export function inferOpenRouterNative(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (!id || id === "default" || id.includes("openrouter/auto") || id.includes("openrouter/fusion")) return [];
  if (id.includes("claude-haiku")) return [];
  if (id.includes("kimi-k2.7") || id.includes("kimi-for-coding")) return [];
  if (id.includes("claude-opus") || id.includes("claude-sonnet") || id.includes("claude-fable") || id.includes("claude-mythos")) {
    return [...EFFORT_SETS.claude5];
  }
  if (id.includes("gpt-5.6")) return [...EFFORT_SETS.gpt56];
  if (id.includes("gpt-5.5") || id.includes("gpt-5.4") || id.includes("gpt-5.3")) return [...EFFORT_SETS.gpt55];
  if (id.includes("grok-4.6")) return [...EFFORT_SETS.grok46];
  if (id.includes("grok-4.5") || id.includes("grok-4")) return [...EFFORT_SETS.grok45];
  if (id.includes("kimi-k3") || id.includes("kimi/k3")) return [...EFFORT_SETS.kimiK3];
  if (id.includes("gemini")) return ["low", "medium", "high"];
  if (id.includes("deepseek")) return ["low", "high", "max"];
  if (id.includes("qwen3.8-max") || id.includes("muse-spark")) return ["minimal", "low", "medium", "high", "xhigh"];
  if (id.includes("qwen3.8-27b")) return ["low", "medium", "xhigh"];
  if (id.includes("seed-2.0")) return ["low", "medium", "high"];
  return null;
}

export function inferNativeEfforts(workerId, modelId) {
  const id = String(modelId || "").toLowerCase();
  if (workerId === "claude") {
    if (id.includes("haiku")) return [];
    return [...EFFORT_SETS.claude5];
  }
  if (workerId === "openai") {
    if (!id || id === "default" || id.includes("5.6")) return [...EFFORT_SETS.gpt56];
    return [...EFFORT_SETS.gpt55];
  }
  if (workerId === "grok") {
    if (id.includes("4.5") && !id.includes("4.6")) return [...EFFORT_SETS.grok45];
    return [...EFFORT_SETS.grok46];
  }
  if (workerId === "kimi") {
    if (id.includes("kimi-for-coding") || id.includes("k2.7")) return [];
    return [...EFFORT_SETS.kimiK3];
  }
  if (workerId === "zai") return [];
  if (workerId === "openrouter") return inferOpenRouterNative(id) || [];
  return [];
}

export const MODEL_CATALOG = {
  claude: [
    { id: "claude-opus-5", label: "Opus 5", aliases: ["opus", "opus-5", "opus5"], efforts: EFFORT_SETS.claude5 },
    { id: "claude-sonnet-5", label: "Sonnet 5", aliases: ["sonnet", "sonnet-5", "sonnet5"], efforts: EFFORT_SETS.claude5 },
    { id: "claude-fable-5", label: "Fable 5", aliases: ["fable", "fable-5", "fable5"], efforts: EFFORT_SETS.claude5 },
    { id: "claude-haiku-4-5", label: "Haiku 4.5", aliases: ["haiku", "haiku-4-5"], efforts: EFFORT_SETS.none },
  ],
  openai: [
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", aliases: ["sol"], efforts: EFFORT_SETS.gpt56 },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", aliases: ["terra"], efforts: EFFORT_SETS.gpt56 },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", aliases: ["luna"], efforts: EFFORT_SETS.gpt56 },
    { id: "gpt-5.5", label: "GPT-5.5", efforts: EFFORT_SETS.gpt55 },
    { id: "gpt-5.4", label: "GPT-5.4", efforts: EFFORT_SETS.gpt55 },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", efforts: EFFORT_SETS.gpt55 },
    { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark", aliases: ["spark"], efforts: EFFORT_SETS.gpt55 },
  ],
  grok: [
    { id: "grok-4.6", label: "Grok 4.6", efforts: EFFORT_SETS.grok46 },
    { id: "grok-4.5", label: "Grok 4.5", efforts: EFFORT_SETS.grok45 },
  ],
  kimi: [
    { id: "kimi-code/k3", label: "Kimi K3", aliases: ["k3"], efforts: EFFORT_SETS.kimiK3 },
    { id: "kimi-code/k3-256k", label: "Kimi K3 256k", aliases: ["k3-256k"], efforts: EFFORT_SETS.kimiK3 },
    { id: "kimi-code/kimi-for-coding", label: "Kimi K2.7 Coding", efforts: EFFORT_SETS.none },
    { id: "kimi-code/kimi-for-coding-highspeed", label: "Kimi K2.7 Highspeed", efforts: EFFORT_SETS.none },
  ],
  zai: [
    { id: "zai/GLM-5.3", label: "GLM-5.3", aliases: ["GLM-5.3", "glm-5.3"], efforts: EFFORT_SETS.none },
    { id: "zai/GLM-5.2", label: "GLM-5.2", aliases: ["GLM-5.2", "glm-5.2"], efforts: EFFORT_SETS.none },
    { id: "zai/GLM-5-Turbo", label: "GLM-5 Turbo", aliases: ["GLM-5-Turbo", "glm-5-turbo"], efforts: EFFORT_SETS.none },
  ],
  openrouter: [
    { id: "openrouter/auto", label: "OpenRouter Auto", efforts: EFFORT_SETS.none },
    { id: "openrouter/fusion", label: "OpenRouter Fusion", efforts: EFFORT_SETS.none },
    { id: "anthropic/claude-opus-5", label: "Claude Opus 5", efforts: EFFORT_SETS.claude5 },
    { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", efforts: EFFORT_SETS.claude5 },
    { id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol", efforts: EFFORT_SETS.gpt56 },
    { id: "google/gemini-3.7-flash", label: "Gemini 3.7 Flash", efforts: ["low", "medium", "high"] },
    { id: "x-ai/grok-4.6", label: "Grok 4.6", efforts: EFFORT_SETS.grok46 },
    { id: "deepseek/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro", efforts: ["low", "high", "max"] },
    { id: "moonshotai/kimi-k3", label: "Kimi K3", efforts: EFFORT_SETS.kimiK3 },
    { id: "qwen/qwen3.8-max", label: "Qwen3.8 Max", efforts: ["minimal", "low", "medium", "high", "xhigh"] },
  ],
};

export function nativeEfforts(workerId, modelId) {
  const found = findCatalogModel(workerId, modelId);
  if (found && Array.isArray(found.efforts)) return sortEfforts(found.efforts.filter((e) => e !== "default"));
  return sortEfforts(inferNativeEfforts(workerId, modelId) || []);
}

export function pickerEfforts(workerId, modelId) {
  return pickerFromNative(nativeEfforts(workerId, modelId));
}

/**
 * Map a UI/config value to the token the provider actually accepts.
 * Returns null when the flag should be omitted (`default`, or no effort control).
 */
export function resolveNativeEffort(workerId, modelId, effort) {
  const value = String(effort || "default").toLowerCase().trim();
  if (!value || value === "default") return null;
  const allowed = nativeEfforts(workerId, modelId);
  if (!allowed.length) return null;
  if (allowed.includes(value)) return value;

  const aliases = {
    extra_high: "xhigh",
    "extra-high": "xhigh",
    extrahigh: "xhigh",
    "x-high": "xhigh",
    ultra: "max",
    ultracode: "xhigh",
    off: "none",
    disable: "none",
    disabled: "none",
  };
  const aliased = aliases[value] || value;
  if (allowed.includes(aliased)) return aliased;

  // Legacy configs used a single generic ladder for every CLI.
  if (value === "max" && allowed.includes("xhigh")) return "xhigh";
  if (value === "xhigh" && allowed.includes("max")) return "max";
  if ((value === "max" || value === "xhigh") && allowed.includes("high")) return "high";
  if (value === "medium" && !allowed.includes("medium")) {
    if (allowed.includes("high")) return "high";
    if (allowed.includes("low")) return "low";
  }
  if (value === "minimal" && allowed.includes("low")) return "low";
  if (value === "none") return null;
  return null;
}

export function clampStoredEffort(workerId, modelId, effort) {
  const value = String(effort || "default").toLowerCase().trim();
  if (!value || value === "default") return "default";
  const picker = pickerEfforts(workerId, modelId);
  if (picker.includes(value)) return value;
  return resolveNativeEffort(workerId, modelId, value) || "default";
}

export function effortsByWorker() {
  return {
    claude: pickerEfforts("claude", "default"),
    openai: pickerEfforts("openai", "default"),
    grok: pickerEfforts("grok", "default"),
    kimi: pickerEfforts("kimi", "default"),
    zai: pickerEfforts("zai", "default"),
    openrouter: pickerEfforts("openrouter", "default"),
  };
}

const ALIAS_INDEX = new Map();
for (const [workerId, models] of Object.entries(MODEL_CATALOG)) {
  for (const model of models) {
    ALIAS_INDEX.set(`${workerId}::${model.id.toLowerCase()}`, { workerId, model });
    ALIAS_INDEX.set(model.id.toLowerCase(), { workerId, model });
    for (const alias of model.aliases || []) {
      ALIAS_INDEX.set(`${workerId}::${alias.toLowerCase()}`, { workerId, model });
      ALIAS_INDEX.set(alias.toLowerCase(), { workerId, model });
    }
  }
}

export function isCliDefault(model) {
  const value = String(model || "").trim().toLowerCase();
  return !value || value === "default" || value === "auto";
}

export function findCatalogModel(workerId, modelId) {
  if (!modelId || isCliDefault(modelId)) return null;
  const keyed = ALIAS_INDEX.get(`${workerId}::${String(modelId).toLowerCase()}`);
  if (keyed) return keyed.model;
  const loose = ALIAS_INDEX.get(String(modelId).toLowerCase());
  if (loose && (!workerId || loose.workerId === workerId)) return loose.model;
  return (MODEL_CATALOG[workerId] || []).find((m) => m.id === modelId) || null;
}

export function canonicalModelId(workerId, modelId) {
  if (isCliDefault(modelId)) return "default";
  const found = findCatalogModel(workerId, modelId);
  return found ? found.id : String(modelId);
}

export function modelLabel(workerId, modelId) {
  if (isCliDefault(modelId)) return `${PROVIDER_LABELS[workerId] || workerId} default`;
  const found = findCatalogModel(workerId, modelId);
  if (found) return found.label;
  return String(modelId);
}

export function memberKey(member) {
  const id = member?.id || "claude";
  return `${id}::${canonicalModelId(id, member?.model)}`;
}

export function encodeSlot(workerId, modelId) {
  return `${workerId}::${canonicalModelId(workerId, modelId)}`;
}

export function decodeSlot(value) {
  const raw = String(value || "");
  const idx = raw.indexOf("::");
  if (idx === -1) {
    const hit = ALIAS_INDEX.get(raw.toLowerCase());
    if (hit) return { id: hit.workerId, model: hit.model.id };
    return { id: raw, model: "default" };
  }
  const id = raw.slice(0, idx);
  const model = raw.slice(idx + 2);
  return { id, model: canonicalModelId(id, model) };
}

function publicModel(workerId, item) {
  const native = Array.isArray(item.efforts) ? item.efforts : inferNativeEfforts(workerId, item.id);
  return {
    id: item.id,
    label: item.label || item.id,
    efforts: pickerFromNative(native || []),
  };
}

export function publicCatalog(extraByWorker = {}) {
  const modelsByWorker = {};
  for (const [id, models] of Object.entries(MODEL_CATALOG)) {
    modelsByWorker[id] = models.map((m) => publicModel(id, m));
  }
  for (const [id, extras] of Object.entries(extraByWorker || {})) {
    const next = [...(modelsByWorker[id] || [])];
    const index = new Map(next.map((m, i) => [m.id, i]));
    for (const item of extras || []) {
      if (!item?.id) continue;
      const pub = publicModel(id, item);
      if (index.has(item.id)) {
        const existing = next[index.get(item.id)];
        if (pub.efforts.length > existing.efforts.length || (Array.isArray(item.efforts) && item.efforts.length)) {
          existing.efforts = pub.efforts;
        }
        if (item.label && item.label !== item.id) existing.label = item.label;
        continue;
      }
      index.set(item.id, next.length);
      next.push(pub);
    }
    modelsByWorker[id] = next;
  }
  return modelsByWorker;
}
