import { runWorker } from "./adapters.js";
import { detectWorkers, workerById } from "./detect.js";
import {
  classify,
  formatTranscript,
  lastUserText,
  parseModel,
  parseVerdict,
  pickWorker,
  planRoute,
} from "./engine.js";
import { modelLabel } from "./models.js";
import { applyWorkMode, normalizeWorkMode, workModePrompt } from "./workModes.js";

function emit(onEvent, event) {
  if (onEvent) onEvent(event);
}

function workerTimeout(mode, agentMode) {
  const work = normalizeWorkMode(agentMode);
  if (work === "agent" || work === "yolo" || work === "architect") return 600_000;
  if (["quality", "value", "speed", "cheap", "ultra"].includes(mode)) return 360_000;
  if (mode === "fast") return 90_000;
  return 180_000;
}

function buildTaskPrompt({ messages, context, agentMode, extra }) {
  const parts = [];
  parts.push(
    "You are a specialist worker inside a local multi-model orchestra (multi-model).",
    "Answer the user completely. Do not mention routing, other models, or that you are a worker unless asked.",
    workModePrompt(agentMode)
  );
  if (context?.cwd) parts.push(`Workspace: ${context.cwd}`);
  if (context?.activeFile) parts.push(`Active file: ${context.activeFile}`);
  if (context?.selection) parts.push(`Selected text:\n${context.selection}`);
  if (extra) parts.push(extra);
  parts.push("", "Conversation:", formatTranscript(messages));
  return parts.join("\n");
}

function buildVerifyPrompt(question, answer) {
  return [
    "You are a strict verifier. Read the question and the draft answer.",
    "Reply with EXACTLY one first line: ACCEPT or REVISE.",
    "Then one short paragraph of why.",
    "REVISE if the draft is wrong, incomplete, hallucinated, or misses the asked work.",
    "",
    "QUESTION:",
    question,
    "",
    "DRAFT:",
    answer,
  ].join("\n");
}

function buildSynthPrompt(question, drafts) {
  const body = drafts
    .map((d, i) => `--- Draft ${i + 1} (${d.label || d.worker}) ---\n${d.text}`)
    .join("\n\n");
  return [
    "You are a Fusion analyst, then the writer of the final answer.",
    "Privately compare the drafts:",
    "- consensus (treat as higher confidence)",
    "- contradictions (pick the more correct or complete option)",
    "- unique insights worth keeping",
    "- blind spots none of them covered",
    "Then write ONE complete answer for the user.",
    "Do not mention drafts, models, or this analysis unless asked.",
    "",
    "QUESTION:",
    question,
    "",
    body,
  ].join("\n");
}

export async function orchestrate({
  messages,
  model = "maestro-auto",
  agentMode: rawWorkMode = "ask",
  context = {},
  enabledWorkers = null,
  signal,
  onEvent,
}) {
  const started = Date.now();
  const agentMode = normalizeWorkMode(rawWorkMode);
  const workers = detectWorkers(enabledWorkers);
  const question = lastUserText(messages);
  const parsed = parseModel(model);
  const cls = classify(question);
  let mode = parsed.mode;
  let planned;

  if (parsed.pin) {
    const pinned = workerById(workers, parsed.pin);
    if (!pinned?.ok) {
      throw new Error(`${parsed.pin} is not available on this machine.`);
    }
    planned = { mode: "pin", steps: [{ role: "answer", worker: parsed.pin }], reason: `Pinned to ${parsed.pin}.` };
    mode = "auto";
  } else {
    planned = planRoute(cls, workers, mode);
  }
  planned = applyWorkMode(planned, cls, workers, agentMode);

  if (planned.error) throw new Error(planned.error);

  emit(onEvent, { type: "classify", classify: cls, workers: workers.filter((w) => w.ok).map((w) => w.id) });
  emit(onEvent, { type: "plan", plan: planned });

  const timeoutMs = workerTimeout(mode, agentMode);
  const route = [];
  const drafts = [];
  let answer = "";

  const runNamed = async (workerId, extra, role, { stream = true, effort = "default", model = "default" } = {}) => {
    const worker = workerById(workers, workerId);
    if (!worker?.ok) throw new Error(`${workerId} is not available`);
    const label = modelLabel(worker.id, model);
    emit(onEvent, { type: "route", role, worker: worker.id, name: label, model, effort });
    const prompt = buildTaskPrompt({ messages, context, agentMode, extra });
    const stepStart = Date.now();
    const result = await runWorker(worker, {
      prompt,
      cwd: context.cwd,
      agentMode,
      effort,
      model,
      signal,
      timeoutMs,
      onToken: stream ? (text) => emit(onEvent, { type: "token", worker: worker.id, text }) : undefined,
    });
    route.push({
      role,
      worker: worker.id,
      name: label,
      model,
      modelLabel: label,
      effort,
      ms: Date.now() - stepStart,
      chars: (result.text || "").length,
    });
    return result.text || "";
  };

  const draftSteps = planned.steps.filter((s) => s.role === "draft");
  if (draftSteps.length >= 2) {
    emit(onEvent, {
      type: "status",
      text: `Consulting ${draftSteps.map((s) => modelLabel(s.worker, s.model)).join(" + ")}…`,
    });
    const results = await Promise.all(
      draftSteps.map(async (step) => {
        const text = await runNamed(step.worker, "Produce your best standalone answer.", "draft", {
          stream: false,
          effort: step.effort || "default",
          model: step.model || "default",
        });
        return { worker: step.worker, model: step.model, label: modelLabel(step.worker, step.model), text };
      })
    );
    drafts.push(...results);
    const synthStep = planned.steps.find((s) => s.role === "synthesize");
    if (synthStep) {
      const synthLabel = modelLabel(synthStep.worker, synthStep.model);
      emit(onEvent, { type: "status", text: `Synthesizing with ${synthLabel}…` });
      const worker = workerById(workers, synthStep.worker);
      const stepStart = Date.now();
      emit(onEvent, {
        type: "route",
        role: "synthesize",
        worker: worker.id,
        name: synthLabel,
        model: synthStep.model,
        effort: synthStep.effort,
      });
      const result = await runWorker(worker, {
        prompt: buildSynthPrompt(question, drafts),
        cwd: context.cwd,
        agentMode: "ask",
        effort: synthStep.effort || "default",
        model: synthStep.model || "default",
        signal,
        timeoutMs,
        onToken: (text) => emit(onEvent, { type: "token", worker: worker.id, text }),
      });
      answer = result.text || results.map((r) => r.text).join("\n\n");
      route.push({
        role: "synthesize",
        worker: worker.id,
        name: synthLabel,
        model: synthStep.model,
        modelLabel: synthLabel,
        effort: synthStep.effort || "default",
        ms: Date.now() - stepStart,
        chars: answer.length,
      });
    } else {
      answer = results[0]?.text || "";
    }
  } else {
    const answerStep = planned.steps.find((s) => s.role === "answer") || planned.steps[0];
    emit(onEvent, { type: "status", text: `Consulting ${modelLabel(answerStep.worker, answerStep.model)}…` });
    answer = await runNamed(answerStep.worker, null, "answer", {
      effort: answerStep.effort || "default",
      model: answerStep.model || "default",
    });

    const verifyStep = planned.steps.find((s) => s.role === "verify");
    if (verifyStep && answer) {
      emit(onEvent, { type: "status", text: `Verifying with ${verifyStep.worker}…` });
      const verifier = workerById(workers, verifyStep.worker);
      const stepStart = Date.now();
      emit(onEvent, { type: "route", role: "verify", worker: verifier.id, name: verifier.name });
      const verified = await runWorker(verifier, {
        prompt: buildVerifyPrompt(question, answer),
        cwd: context.cwd,
        agentMode: "ask",
        signal,
        timeoutMs: Math.min(timeoutMs, 120_000),
      });
      const verdict = parseVerdict(verified.text);
      route.push({
        role: "verify",
        worker: verifier.id,
        name: verifier.name,
        verdict,
        ms: Date.now() - stepStart,
      });
      emit(onEvent, { type: "verify", worker: verifier.id, verdict, reason: verified.text.slice(0, 400) });

      const escalate = planned.steps.find((s) => s.role === "escalate");
      if (verdict === "REVISE" && escalate) {
        emit(onEvent, { type: "status", text: `Escalating to ${escalate.worker}…` });
        answer = await runNamed(
          escalate.worker,
          `A verifier asked for a revision. Previous draft:\n${answer}\n\nWrite the improved final answer.`,
          "escalate"
        );
      }
    }
  }

  if (!answer.trim()) {
    const fallback = pickWorker(cls, workers.filter((w) => w.ok), {
      exclude: route.map((r) => r.worker),
    });
    if (!fallback) throw new Error("Workers returned empty answers.");
    emit(onEvent, { type: "status", text: `Fallback to ${fallback.id}…` });
    answer = await runNamed(fallback.id, "Previous workers returned nothing. Answer the user.", "fallback");
  }

  const meta = {
    classify: cls,
    plan: planned,
    route,
    mode,
    agentMode,
    ms: Date.now() - started,
  };
  emit(onEvent, { type: "done", text: answer, shoal: meta });
  return { text: answer, shoal: meta };
}

export function publicStatus(enabledWorkers = null) {
  const workers = detectWorkers(enabledWorkers);
  return {
    ok: workers.some((w) => w.ok),
    workers: workers.map((w) => ({
      id: w.id,
      name: w.name,
      ok: w.ok,
      version: w.version,
      error: w.error,
      bin: w.bin,
    })),
  };
}
