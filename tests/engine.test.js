import test from "node:test";
import assert from "node:assert/strict";
import { classify, parseModel, parseVerdict, planRoute, pickWorker } from "../extension/sidecar/engine.js";
import { resolveFusionPreset } from "../extension/sidecar/presets.js";
import { recommendPresets } from "../extension/sidecar/config.js";

const fake = (id, extra = {}) => ({
  id,
  name: id,
  ok: true,
  strengths: extra.strengths || ["chat", "code", "review", "debug", "plan", "write"],
  cost: extra.cost ?? 2,
  quality: extra.quality ?? 3,
  speed: extra.speed ?? 3,
});

test("classifies a greeting as cheap chat", () => {
  const cls = classify("hey");
  assert.equal(cls.kind, "chat");
  assert.ok(cls.difficulty < 0.2);
});

test("classifies reviews as hard review work", () => {
  const cls = classify("Please review this PR for security vulnerabilities");
  assert.equal(cls.kind, "review");
  assert.ok(cls.difficulty > 0.7);
});

test("classifies debug requests", () => {
  const cls = classify("This crashes with a stack trace in auth.ts");
  assert.equal(cls.kind, "debug");
});

test("parseModel maps maestro modes and pins", () => {
  assert.deepEqual(parseModel("maestro-quality"), { mode: "quality", pin: null });
  assert.deepEqual(parseModel("maestro-ultra"), { mode: "quality", pin: null });
  assert.deepEqual(parseModel("maestro-value"), { mode: "value", pin: null });
  assert.deepEqual(parseModel("maestro-speed"), { mode: "speed", pin: null });
  assert.deepEqual(parseModel("maestro-cheap"), { mode: "cheap", pin: null });
  assert.deepEqual(parseModel("maestro-fast"), { mode: "fast", pin: null });
  assert.deepEqual(parseModel("maestro-claude"), { mode: "auto", pin: "claude" });
  assert.deepEqual(parseModel("maestro-zai"), { mode: "auto", pin: "zai" });
  assert.deepEqual(parseModel("maestro-glm"), { mode: "auto", pin: "zai" });
  assert.deepEqual(parseModel("maestro-openai"), { mode: "auto", pin: "openai" });
  assert.deepEqual(parseModel("maestro-codex"), { mode: "auto", pin: "openai" });
  assert.deepEqual(parseModel("fugu-quality"), { mode: "quality", pin: null });
  assert.deepEqual(parseModel("fugu-claude"), { mode: "auto", pin: "claude" });
});

test("parseVerdict reads ACCEPT / REVISE", () => {
  assert.equal(parseVerdict("ACCEPT\nlooks good"), "ACCEPT");
  assert.equal(parseVerdict("REVISE\nmissing tests"), "REVISE");
});

test("fast mode picks the cheapest capable worker", () => {
  const workers = [fake("claude", { cost: 3, quality: 5 }), fake("kimi", { cost: 1, quality: 3 })];
  const plan = planRoute(classify("summarize this paragraph"), workers, "fast");
  assert.equal(plan.steps[0].worker, "kimi");
});

test("hard review prefers a high-quality worker and verifies", () => {
  const workers = [
    fake("kimi", { cost: 1, quality: 3, strengths: ["chat", "write"] }),
    fake("claude", { cost: 3, quality: 5, strengths: ["review", "plan", "code"] }),
    fake("grok", { cost: 2, quality: 4, strengths: ["code", "debug"] }),
  ];
  const plan = planRoute(classify("Review this authentication module for security issues"), workers, "auto");
  assert.equal(plan.steps[0].worker, "claude");
  assert.ok(plan.steps.some((s) => s.role === "verify"));
});

test("quality fusion uses claude + openai + grok judged by claude", () => {
  const workers = ["claude", "openai", "grok", "kimi", "zai"].map((id) => fake(id));
  const plan = resolveFusionPreset("quality", workers);
  assert.equal(plan.preset, "quality");
  assert.deepEqual(
    plan.steps.filter((s) => s.role === "draft").map((s) => s.worker),
    ["claude", "openai", "grok"]
  );
  assert.equal(plan.steps.find((s) => s.role === "synthesize").worker, "claude");
});

test("recommends quality/value/speed/cheap from detected CLIs", () => {
  const all = ["claude", "openai", "grok", "kimi", "zai"].map((id) => fake(id));
  const rec = recommendPresets(all);
  assert.deepEqual(
    rec.quality.panel.map((m) => `${m.id}:${m.model}`),
    ["claude:claude-opus-5", "openai:gpt-5.6-sol", "grok:grok-4.6"]
  );
  assert.equal(rec.quality.judge.model, "claude-opus-5");
  assert.deepEqual(
    rec.value.panel.map((m) => `${m.id}:${m.model}`),
    ["claude:claude-sonnet-5", "openai:gpt-5.6-terra"]
  );
  assert.deepEqual(
    rec.speed.panel.map((m) => `${m.id}:${m.model}`),
    ["grok:grok-4.6", "kimi:kimi-code/kimi-for-coding-highspeed", "zai:zai/GLM-5-Turbo"]
  );
  assert.deepEqual(
    rec.cheap.panel.map((m) => `${m.id}:${m.model}`),
    ["kimi:kimi-code/k3", "zai:zai/GLM-5.3"]
  );
});

test("recommendations adapt when only cheap CLIs are installed", () => {
  const rec = recommendPresets([fake("kimi"), fake("zai")]);
  assert.deepEqual(rec.quality.panel.map((m) => m.id), ["kimi", "zai"]);
  assert.deepEqual(rec.cheap.panel.map((m) => m.id), ["kimi", "zai"]);
  assert.deepEqual(rec.detected, ["kimi", "zai"]);
});

test("custom user preset overrides panel and effort", () => {
  const workers = ["claude", "openai", "grok", "kimi", "zai"].map((id) => fake(id));
  const plan = resolveFusionPreset("quality", workers, {
    quality: {
      panel: [
        { id: "kimi", effort: "low" },
        { id: "zai", effort: "medium" },
      ],
      judge: { id: "openai", effort: "high" },
    },
  });
  assert.deepEqual(
    plan.steps.filter((s) => s.role === "draft").map((s) => `${s.worker}:${s.effort}`),
    ["kimi:low", "zai:medium"]
  );
  const synth = plan.steps.find((s) => s.role === "synthesize");
  assert.equal(synth.worker, "openai");
  assert.equal(synth.effort, "high");
});

test("fusion panel can include an OpenRouter model", () => {
  const workers = ["claude", "openrouter", "grok"].map((id) => fake(id));
  const plan = resolveFusionPreset("quality", workers, {
    quality: {
      panel: [
        { id: "claude", model: "claude-opus-5", effort: "max" },
        { id: "openrouter", model: "google/gemini-3.7-flash", effort: "low" },
      ],
      judge: { id: "openrouter", model: "openrouter/fusion", effort: "default" },
    },
  });
  assert.deepEqual(
    plan.steps.filter((s) => s.role === "draft").map((s) => `${s.worker}:${s.model}`),
    ["claude:claude-opus-5", "openrouter:google/gemini-3.7-flash"]
  );
  assert.equal(plan.steps.find((s) => s.role === "synthesize").model, "openrouter/fusion");
});

test("fusion panel can include two Claude models", () => {
  const workers = ["claude", "openai", "grok"].map((id) => fake(id));
  const plan = resolveFusionPreset("quality", workers, {
    quality: {
      panel: [
        { id: "claude", model: "claude-opus-5", effort: "max" },
        { id: "claude", model: "claude-sonnet-5", effort: "medium" },
      ],
      judge: { id: "claude", model: "claude-opus-5", effort: "high" },
    },
  });
  assert.deepEqual(
    plan.steps.filter((s) => s.role === "draft").map((s) => `${s.worker}:${s.model}:${s.effort}`),
    ["claude:claude-opus-5:max", "claude:claude-sonnet-5:medium"]
  );
  assert.match(plan.reason, /Opus 5 \+ Sonnet 5/);
});

test("cheap fusion uses kimi + zai judged by grok", () => {
  const workers = ["claude", "openai", "grok", "kimi", "zai"].map((id) => fake(id));
  const plan = resolveFusionPreset("cheap", workers);
  assert.deepEqual(
    plan.steps.filter((s) => s.role === "draft").map((s) => s.worker),
    ["kimi", "zai"]
  );
  assert.equal(plan.steps.find((s) => s.role === "synthesize").worker, "grok");
});

test("pickWorker can exclude a worker", () => {
  const workers = [fake("claude"), fake("grok")];
  const picked = pickWorker(classify("hello there friend"), workers, { exclude: ["claude"], preferCheap: true });
  assert.equal(picked.id, "grok");
});
