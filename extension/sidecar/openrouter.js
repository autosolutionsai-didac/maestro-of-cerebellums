import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = "https://openrouter.ai/api/v1";

export const FEATURED_OPENROUTER = [
  { id: "openrouter/auto", label: "OpenRouter Auto" },
  { id: "openrouter/fusion", label: "OpenRouter Fusion" },
  { id: "anthropic/claude-opus-5", label: "Claude Opus 5" },
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "anthropic/claude-opus-5-fast", label: "Claude Opus 5 Fast" },
  { id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { id: "google/gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
  { id: "x-ai/grok-4.6", label: "Grok 4.6" },
  { id: "deepseek/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro" },
  { id: "deepseek/deepseek-v4-flash-0731", label: "DeepSeek V4 Flash" },
  { id: "moonshotai/kimi-k3", label: "Kimi K3" },
  { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code" },
  { id: "qwen/qwen3.8-max", label: "Qwen3.8 Max" },
  { id: "qwen/qwen3.8-27b", label: "Qwen3.8 27B" },
  { id: "meta/muse-spark-1.2", label: "Muse Spark 1.2" },
  { id: "bytedance-seed/seed-2.0-code", label: "Seed 2.0 Code" },
];

function configCandidates() {
  const home = os.homedir();
  return [
    process.env.MAESTRO_CONFIG,
    process.env.FUGU_CONFIG,
    path.join(home, ".maestro-of-cerebellums", "config.json"),
    path.join(home, ".fugu-local", "config.json"),
  ].filter(Boolean);
}

export function readStoredOpenRouter() {
  for (const file of configCandidates()) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (raw.openrouter && typeof raw.openrouter === "object") return raw.openrouter;
    } catch {
      // try next
    }
  }
  return {};
}

export function getOpenRouterKey() {
  const env = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_TOKEN;
  if (env && env.trim()) return env.trim();
  const stored = readStoredOpenRouter().apiKey;
  return stored && String(stored).trim() ? String(stored).trim() : "";
}

export function maskKey(key) {
  const value = String(key || "");
  if (value.length < 8) return value ? "••••" : "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function cleanLabel(name, id) {
  const raw = String(name || id || "").trim();
  return raw.replace(/^(Anthropic|OpenAI|Google|SpaceXAI|MoonshotAI|Qwen|DeepSeek|Meta):\s*/i, "") || id;
}

export function mergeOpenRouterCatalog(cached = []) {
  const seen = new Set();
  const out = [];
  for (const item of [...FEATURED_OPENROUTER, ...cached]) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({ id: item.id, label: item.label || cleanLabel(item.name, item.id) });
  }
  return out;
}

export async function fetchOpenRouterModels(apiKey) {
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${BASE}/models`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 240) || `OpenRouter models failed (${res.status})`);
  }
  const body = await res.json();
  const rows = Array.isArray(body.data) ? body.data : [];
  const mapped = [];
  for (const item of rows) {
    const id = item?.id;
    if (!id || id.startsWith("~") || id.includes(":batch") || id.includes("-image")) continue;
    const outs = item.architecture?.output_modalities || ["text"];
    if (!outs.includes("text")) continue;
    mapped.push({ id, label: cleanLabel(item.name, id) });
  }
  mapped.sort((a, b) => a.label.localeCompare(b.label));
  return mergeOpenRouterCatalog(mapped.slice(0, 120));
}

function mapEffort(effort) {
  const value = String(effort || "default").toLowerCase();
  if (!value || value === "default") return null;
  if (value === "max") return "high";
  return value;
}

export async function chatOpenRouter({ apiKey, model, prompt, effort, signal, timeoutMs }) {
  const key = apiKey || getOpenRouterKey();
  if (!key) throw new Error("OpenRouter API key is not set. Add it in Configure.");
  const slug = model && model !== "default" ? model : "openrouter/auto";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 180_000);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const payload = {
    model: slug,
    messages: [{ role: "user", content: prompt }],
  };
  const mapped = mapEffort(effort);
  if (mapped) payload.reasoning = { effort: mapped };
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://autosolutions.ai",
        "X-Title": "Maestro of Cerebellums",
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = body?.error?.message || body?.error || `OpenRouter ${res.status}`;
      throw new Error(String(message).slice(0, 400));
    }
    const text =
      body?.choices?.[0]?.message?.content ||
      body?.choices?.[0]?.text ||
      "";
    if (Array.isArray(text)) {
      return text.map((part) => part.text || part.content || "").join("");
    }
    return String(text || "").trim();
  } finally {
    clearTimeout(timer);
  }
}
