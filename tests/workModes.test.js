import test from "node:test";
import assert from "node:assert/strict";
import { planRoute } from "../extension/sidecar/engine.js";
import {
  allowsEdits,
  applyWorkMode,
  claudePermissionMode,
  codexSandbox,
  isYolo,
  normalizeWorkMode,
  workModePrompt,
} from "../extension/sidecar/workModes.js";

const fake = (id, extra = {}) => ({
  id,
  name: id,
  ok: true,
  strengths: extra.strengths || ["chat", "code", "review", "debug", "plan", "write"],
  cost: extra.cost ?? 2,
  quality: extra.quality ?? 3,
  speed: extra.speed ?? 3,
});

const workers = [
  fake("claude", { cost: 3, quality: 5 }),
  fake("kimi", { cost: 1, quality: 3 }),
  fake("grok", { cost: 2, quality: 4 }),
];

const cls = { kind: "code", difficulty: 0.7, needsWorkspace: true, confidence: 0.8, chars: 80 };

test("normalizes aliases and unknown work modes", () => {
  assert.equal(normalizeWorkMode("act"), "agent");
  assert.equal(normalizeWorkMode("edit"), "agent");
  assert.equal(normalizeWorkMode("yolo"), "yolo");
  assert.equal(normalizeWorkMode("bypass"), "yolo");
  assert.equal(normalizeWorkMode("PLAN"), "plan");
  assert.equal(normalizeWorkMode("nope"), "ask");
  assert.equal(allowsEdits("agent"), true);
  assert.equal(allowsEdits("yolo"), true);
  assert.equal(allowsEdits("plan"), false);
  assert.equal(allowsEdits("architect"), false);
  assert.equal(isYolo("yolo"), true);
  assert.equal(isYolo("agent"), false);
});

test("Yolo maps to native bypass flags; Agent still asks for riskier tools", () => {
  assert.equal(claudePermissionMode("agent"), "acceptEdits");
  assert.equal(claudePermissionMode("yolo"), "bypassPermissions");
  assert.equal(claudePermissionMode("ask"), "plan");
  assert.equal(codexSandbox("agent"), "workspace-write");
  assert.equal(codexSandbox("yolo"), "danger-full-access");
  assert.equal(codexSandbox("review"), "read-only");
  assert.match(workModePrompt("yolo"), /already approved/);
});

test("Ask strips verify and stays a single answer", () => {
  const planned = planRoute(cls, workers, "auto");
  assert.ok(planned.steps.some((s) => s.role === "verify"));
  const next = applyWorkMode(planned, cls, workers, "ask");
  assert.deepEqual(
    next.steps.map((s) => s.role),
    ["answer"]
  );
  assert.match(next.reason, /Ask/);
});

test("Plan uses one planner and no verifier", () => {
  const planned = planRoute(cls, workers, "auto");
  const next = applyWorkMode(planned, cls, workers, "plan");
  assert.equal(next.steps.length, 1);
  assert.equal(next.steps[0].role, "answer");
  assert.match(workModePrompt("plan"), /Stop before implementing/);
});

test("Architect fans out two designs plus a judge", () => {
  const planned = planRoute(cls, workers, "auto");
  const next = applyWorkMode(planned, cls, workers, "architect");
  assert.deepEqual(
    next.steps.map((s) => s.role),
    ["draft", "draft", "synthesize"]
  );
  assert.equal(allowsEdits("architect"), false);
});

test("Review always adds a verifier when two CLIs exist", () => {
  const planned = planRoute({ ...cls, kind: "review", difficulty: 0.2 }, workers, "auto");
  const next = applyWorkMode(planned, cls, workers, "review");
  assert.equal(next.steps[0].role, "answer");
  assert.ok(next.steps.some((s) => s.role === "verify"));
});

test("Fusion panels keep their members under any work mode", () => {
  const planned = {
    mode: "quality",
    steps: [
      { role: "draft", worker: "claude" },
      { role: "draft", worker: "grok" },
      { role: "synthesize", worker: "claude" },
    ],
    reason: "fusion",
  };
  const next = applyWorkMode(planned, cls, workers, "plan");
  assert.equal(next.mode, "quality");
  assert.equal(next.steps.filter((s) => s.role === "draft").length, 2);
});
