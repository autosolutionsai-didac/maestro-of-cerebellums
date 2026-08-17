/**
 * Fusion-style panels, mapped onto the CLIs on this machine.
 *
 * OpenRouter Fusion (2026) runs a panel in parallel, then a judge synthesizes.
 * Quality default is latest Opus + latest GPT + latest Gemini, judged by Opus.
 * Budget (DRACO): Gemini Flash + Kimi + DeepSeek, judged by Opus — beat solo GPT-5.5 / Opus.
 * Fast: latency-homogeneous panel so no slow model gates the fan-out.
 *
 * This Mac has Claude, OpenAI/Codex, Grok, Kimi, Zai/GLM — no Gemini, no DeepSeek.
 * Panel members are concrete models (Opus 5, Sonnet 5, GPT-5.6 Sol…), not providers.
 */

import { modelLabel } from "./models.js";

export const FUSION_PRESETS = {
  quality: {
    id: "quality",
    label: "Quality",
    analog: "OpenRouter Fusion Quality / general-high",
    panel: ["claude", "openai", "grok"],
    judge: "claude",
    why: "Best-of-best. OpenRouter's quality panel is latest Opus + latest GPT + latest Gemini, judged by Opus. Default here: Opus 5 + GPT-5.6 Sol + Grok 4.6, judged by Opus 5.",
  },
  value: {
    id: "value",
    label: "Value",
    analog: "OpenRouter Fusion Opus+GPT (67.6% DRACO) / Fable+GPT (69%)",
    panel: ["openai", "grok"],
    judge: "claude",
    why: "Second-best. Default here: Sonnet 5 + GPT-5.6 Terra, judged by Sonnet 5. Two strong coding models; you skip a third full draft.",
  },
  speed: {
    id: "speed",
    label: "Speed",
    analog: "OpenRouter Fusion general-fast",
    panel: ["grok", "kimi", "zai"],
    judge: "grok",
    why: "Latency-homogeneous. Default here: Grok 4.6 + Kimi K2.7 Highspeed + GLM-5 Turbo, judged by Grok 4.6.",
  },
  cheap: {
    id: "cheap",
    label: "Cheap",
    analog: "OpenRouter budget panel (Gemini Flash + Kimi + DeepSeek, 64.7% DRACO) and the GLM+Kimi heavy-use stack",
    panel: ["kimi", "zai"],
    judge: "grok",
    why: "Cheap with strong results. Default here: Kimi K3 + GLM-5.3, judged by Grok 4.5.",
  },
};

const JUDGE_FALLBACK = ["claude", "grok", "openai", "kimi", "zai", "openrouter"];

function asMember(item) {
  if (typeof item === "string") return { id: item, model: "default", effort: "default" };
  return {
    id: item.id,
    model: item.model || "default",
    effort: item.effort || "default",
  };
}

export function resolveFusionPreset(presetId, workers, userPresets = null) {
  const spec = FUSION_PRESETS[presetId];
  if (!spec) return null;
  const configured = userPresets?.[presetId];
  const wantedPanel = (configured?.panel || spec.panel).map(asMember);
  const wantedJudge = asMember(configured?.judge || { id: spec.judge, effort: "default" });

  const ok = new Set(workers.filter((w) => w.ok).map((w) => w.id));
  const panel = wantedPanel.filter((m) => ok.has(m.id));
  if (panel.length < 2) {
    for (const w of workers) {
      if (w.ok && !panel.some((m) => m.id === w.id)) panel.push({ id: w.id, effort: "default" });
      if (panel.length >= 2) break;
    }
  }
  if (panel.length < 2) return { error: `Fusion ${spec.label} needs at least two ready CLIs.` };

  let judge = ok.has(wantedJudge.id) ? wantedJudge : null;
  if (!judge) {
    const fallbackId = JUDGE_FALLBACK.find((id) => ok.has(id)) || panel[0].id;
    judge = { id: fallbackId, effort: "default" };
  }

  const steps = [
    ...panel.map((m, i) => ({
      role: "draft",
      worker: m.id,
      model: m.model,
      effort: m.effort,
      parallel: i > 0,
    })),
    { role: "synthesize", worker: judge.id, model: judge.model, effort: judge.effort },
  ];
  const panelLabels = panel.map((m) => modelLabel(m.id, m.model));
  const judgeLabel = modelLabel(judge.id, judge.model);
  return {
    mode: spec.id,
    preset: spec.id,
    label: spec.label,
    analog: spec.analog,
    why: spec.why,
    steps,
    reason: `${spec.label}: ${panelLabels.join(" + ")} → ${judgeLabel} synthesizes.`,
  };
}
