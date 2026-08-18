import test from "node:test";
import assert from "node:assert/strict";
import {
  clampStoredEffort,
  pickerEfforts,
  publicCatalog,
  resolveNativeEffort,
} from "../extension/sidecar/models.js";
import { member } from "../extension/sidecar/config.js";

test("Claude 5 family exposes xhigh and max, Haiku has no effort", () => {
  assert.deepEqual(pickerEfforts("claude", "claude-opus-5"), [
    "default",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  assert.deepEqual(pickerEfforts("claude", "claude-sonnet-5"), pickerEfforts("claude", "claude-opus-5"));
  assert.deepEqual(pickerEfforts("claude", "claude-fable-5"), pickerEfforts("claude", "claude-opus-5"));
  assert.deepEqual(pickerEfforts("claude", "claude-haiku-4-5"), ["default"]);
  assert.equal(resolveNativeEffort("claude", "claude-opus-5", "xhigh"), "xhigh");
  assert.equal(resolveNativeEffort("claude", "claude-opus-5", "max"), "max");
  assert.equal(resolveNativeEffort("claude", "claude-haiku-4-5", "high"), null);
});

test("GPT-5.6 includes none/xhigh/max; 5.5 stops at xhigh", () => {
  assert.deepEqual(pickerEfforts("openai", "gpt-5.6-sol"), [
    "default",
    "none",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  assert.deepEqual(pickerEfforts("openai", "gpt-5.5"), [
    "default",
    "none",
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
  assert.equal(resolveNativeEffort("openai", "gpt-5.6-sol", "max"), "max");
  assert.equal(resolveNativeEffort("openai", "gpt-5.6-sol", "none"), "none");
  assert.equal(resolveNativeEffort("openai", "gpt-5.5", "max"), "xhigh");
});

test("Grok 4.6 has xhigh and no max; 4.5 has no xhigh", () => {
  assert.deepEqual(pickerEfforts("grok", "grok-4.6"), ["default", "low", "medium", "high", "xhigh"]);
  assert.deepEqual(pickerEfforts("grok", "grok-4.5"), ["default", "low", "medium", "high"]);
  assert.equal(resolveNativeEffort("grok", "grok-4.6", "xhigh"), "xhigh");
  assert.equal(resolveNativeEffort("grok", "grok-4.6", "max"), "xhigh");
  assert.equal(resolveNativeEffort("grok", "grok-4.5", "max"), "high");
  assert.equal(resolveNativeEffort("grok", "grok-4.5", "xhigh"), "high");
});

test("Kimi K3 is low/high/max with no medium; K2.7 has no scale", () => {
  assert.deepEqual(pickerEfforts("kimi", "kimi-code/k3"), ["default", "low", "high", "max"]);
  assert.deepEqual(pickerEfforts("kimi", "kimi-code/k3-256k"), ["default", "low", "high", "max"]);
  assert.deepEqual(pickerEfforts("kimi", "kimi-code/kimi-for-coding"), ["default"]);
  assert.equal(resolveNativeEffort("kimi", "kimi-code/k3", "medium"), "high");
  assert.equal(resolveNativeEffort("kimi", "kimi-code/k3", "max"), "max");
  assert.equal(resolveNativeEffort("kimi", "kimi-code/kimi-for-coding-highspeed", "low"), null);
});

test("Zai and OpenRouter Auto have no effort control", () => {
  assert.deepEqual(pickerEfforts("zai", "zai/GLM-5.3"), ["default"]);
  assert.deepEqual(pickerEfforts("openrouter", "openrouter/auto"), ["default"]);
  assert.equal(resolveNativeEffort("openrouter", "openrouter/fusion", "high"), null);
});

test("OpenRouter featured models keep provider-native names", () => {
  assert.ok(pickerEfforts("openrouter", "anthropic/claude-opus-5").includes("xhigh"));
  assert.ok(pickerEfforts("openrouter", "openai/gpt-5.6-sol").includes("none"));
  assert.deepEqual(pickerEfforts("openrouter", "x-ai/grok-4.6"), ["default", "low", "medium", "high", "xhigh"]);
  assert.deepEqual(pickerEfforts("openrouter", "moonshotai/kimi-k3"), ["default", "low", "high", "max"]);
  assert.ok(pickerEfforts("openrouter", "qwen/qwen3.8-max").includes("minimal"));
  assert.equal(resolveNativeEffort("openrouter", "openai/gpt-5.6-sol", "max"), "max");
  assert.equal(resolveNativeEffort("openrouter", "google/gemini-3.7-flash", "max"), "high");
});

test("legacy generic max/xhigh is clamped to what the model accepts", () => {
  assert.equal(clampStoredEffort("grok", "grok-4.6", "max"), "xhigh");
  assert.equal(clampStoredEffort("kimi", "kimi-code/k3", "medium"), "high");
  assert.equal(clampStoredEffort("claude", "claude-opus-5", "xhigh"), "xhigh");
  assert.equal(member("openai", "gpt-5.6-sol", "xhigh").effort, "xhigh");
  assert.equal(member("kimi", "kimi-code/k3", "medium").effort, "high");
});

test("public catalog includes per-model effort lists", () => {
  const catalog = publicCatalog();
  assert.ok(catalog.claude.find((m) => m.id === "claude-opus-5").efforts.includes("xhigh"));
  assert.deepEqual(catalog.kimi.find((m) => m.id === "kimi-code/k3").efforts, [
    "default",
    "low",
    "high",
    "max",
  ]);
  assert.deepEqual(catalog.zai[0].efforts, ["default"]);
});
