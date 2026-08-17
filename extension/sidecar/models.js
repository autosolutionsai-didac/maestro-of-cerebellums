/**
 * Concrete models each local CLI can run.
 * Fusion panels store { id: worker, model, effort }, not just "claude".
 */

export const PROVIDER_LABELS = {
  claude: "Claude",
  openai: "OpenAI",
  grok: "Grok",
  kimi: "Kimi",
  zai: "Zai",
};

export const MODEL_CATALOG = {
  claude: [
    { id: "claude-opus-5", label: "Opus 5", aliases: ["opus", "opus-5", "opus5"] },
    { id: "claude-sonnet-5", label: "Sonnet 5", aliases: ["sonnet", "sonnet-5", "sonnet5"] },
    { id: "claude-fable-5", label: "Fable 5", aliases: ["fable", "fable-5", "fable5"] },
    { id: "claude-haiku-4-5", label: "Haiku 4.5", aliases: ["haiku", "haiku-4-5"] },
  ],
  openai: [
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", aliases: ["sol"] },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", aliases: ["terra"] },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", aliases: ["luna"] },
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark", aliases: ["spark"] },
  ],
  grok: [
    { id: "grok-4.6", label: "Grok 4.6" },
    { id: "grok-4.5", label: "Grok 4.5" },
  ],
  kimi: [
    { id: "kimi-code/k3", label: "Kimi K3", aliases: ["k3"] },
    { id: "kimi-code/k3-256k", label: "Kimi K3 256k", aliases: ["k3-256k"] },
    { id: "kimi-code/kimi-for-coding", label: "Kimi K2.7 Coding" },
    { id: "kimi-code/kimi-for-coding-highspeed", label: "Kimi K2.7 Highspeed" },
  ],
  zai: [
    { id: "zai/GLM-5.3", label: "GLM-5.3", aliases: ["GLM-5.3", "glm-5.3"] },
    { id: "zai/GLM-5.2", label: "GLM-5.2", aliases: ["GLM-5.2", "glm-5.2"] },
    { id: "zai/GLM-5-Turbo", label: "GLM-5 Turbo", aliases: ["GLM-5-Turbo", "glm-5-turbo"] },
  ],
};

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

export function publicCatalog() {
  const modelsByWorker = {};
  for (const [id, models] of Object.entries(MODEL_CATALOG)) {
    modelsByWorker[id] = models.map((m) => ({ id: m.id, label: m.label }));
  }
  return modelsByWorker;
}
