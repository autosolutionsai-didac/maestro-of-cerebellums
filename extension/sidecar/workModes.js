/**
 * Work modes (Ask / Plan / Architect / Agent / Review).
 * These are the industry pattern: Claude Plan, Cline Plan/Act, Roo Architect,
 * Codex read-only vs workspace-write. They change both CLI permissions and
 * how Maestro routes workers.
 */
import { pickWorker } from "./engine.js";

export const WORK_MODES = [
  {
    id: "ask",
    label: "Ask",
    hint: "One CLI answers. Read-only. No plan ceremony, no edits.",
    detail:
      "Same idea as Cursor Ask or Aider ask: a single worker reads the repo and replies. Maestro does not fan out, verify, or write files.",
  },
  {
    id: "plan",
    label: "Plan",
    hint: "One CLI explores and writes numbered steps. No edits.",
    detail:
      "Claude Code Plan / Cline Plan: a planner lists files, steps, and risks, then stops. Use this before Agent so you approve the approach first.",
  },
  {
    id: "architect",
    label: "Architect",
    hint: "Two CLIs design; a judge unifies. No edits.",
    detail:
      "Roo Architect style: two stronger workers draft a design in parallel, then a judge writes one architecture (options, interfaces, trade-offs). Not a patch list.",
  },
  {
    id: "agent",
    label: "Agent",
    hint: "CLIs may edit this workspace. Hard work gets a second opinion.",
    detail:
      "Cursor Agent / Claude acceptEdits / Codex workspace-write: Auto still classifies and can verify or escalate. File edits are accepted; CLIs may still ask before shell or network.",
  },
  {
    id: "yolo",
    label: "Yolo",
    hint: "Every permission is pre-approved. CLIs will not ask. Use only if you trust this workspace.",
    detail:
      "Claude --dangerously-skip-permissions / Codex --dangerously-bypass-approvals-and-sandbox / Kimi --yolo --auto. Same routing as Agent, but nothing prompts. Prefer a git repo you can revert.",
  },
  {
    id: "review",
    label: "Review",
    hint: "Review-strong CLI plus a verifier. Findings only — no edits.",
    detail:
      "Always routes to a review-capable worker and, when a second CLI exists, a verifier. Output is severity-ranked findings, not an implementation.",
  },
];

const ALLOWED = new Set(WORK_MODES.map((m) => m.id));

export function normalizeWorkMode(value) {
  const raw = String(value || "ask").toLowerCase().trim();
  if (raw === "act" || raw === "edit" || raw === "agent") return "agent";
  if (raw === "yolo" || raw === "bypass" || raw === "dangerously-skip-permissions") return "yolo";
  if (ALLOWED.has(raw)) return raw;
  return "ask";
}

export function isYolo(value) {
  return normalizeWorkMode(value) === "yolo";
}

export function allowsEdits(value) {
  const mode = normalizeWorkMode(value);
  return mode === "agent" || mode === "yolo";
}

export function claudePermissionMode(value) {
  const mode = normalizeWorkMode(value);
  if (mode === "yolo") return "bypassPermissions";
  if (mode === "agent") return "acceptEdits";
  return "plan";
}

export function grokPermissionMode(value) {
  return claudePermissionMode(value);
}

export function codexSandbox(value) {
  const mode = normalizeWorkMode(value);
  if (mode === "yolo") return "danger-full-access";
  if (mode === "agent") return "workspace-write";
  return "read-only";
}

export function workModeInfo(value) {
  const id = normalizeWorkMode(value);
  return WORK_MODES.find((m) => m.id === id) || WORK_MODES[0];
}

export function workModePrompt(value) {
  switch (normalizeWorkMode(value)) {
    case "plan":
      return [
        "Plan mode: do not modify files.",
        "Explore the workspace if needed, then reply with a concrete implementation plan:",
        "goal, assumptions, files to touch, numbered steps, risks, and what you would not do.",
        "Stop before implementing.",
      ].join(" ");
    case "architect":
      return [
        "Architect mode: do not modify files.",
        "Produce a system-design answer: current shape, options, recommended design,",
        "interfaces, data flow, trade-offs, and migration notes.",
        "Do not emit a file-by-file patch list unless it illustrates the design.",
      ].join(" ");
    case "review":
      return [
        "Review mode: do not modify files.",
        "Review the relevant code. List findings by severity (blocker / major / nit).",
        "Cite files and short reasons. Suggest fixes in prose; do not apply them.",
      ].join(" ");
    case "agent":
      return "Agent mode: you may edit files in the workspace. Prefer small, correct changes. The host may still ask before shell or network actions.";
    case "yolo":
      return "Yolo mode: every permission is already approved. Edit files and run commands as needed to finish the request. Do not wait for confirmation.";
    case "ask":
    default:
      return "Ask mode: answer the question. Do not modify files. Do not write a long implementation plan unless the user asked for one.";
  }
}

export function applyWorkMode(planned, cls, workers, workMode) {
  const mode = normalizeWorkMode(workMode);
  if (!planned || planned.error) return planned;
  const available = (workers || []).filter((w) => w.ok);
  const fusion = ["quality", "value", "speed", "cheap"].includes(planned.mode);
  if (fusion || planned.mode === "pin") {
    return { ...planned, workMode: mode };
  }

  const pick = (kind, extra = {}) => pickWorker({ ...cls, kind }, available, extra);

  if (mode === "ask") {
    const answer = planned.steps.find((s) => s.role === "answer") || planned.steps[0];
    return {
      ...planned,
      workMode: mode,
      steps: answer ? [{ ...answer, role: "answer" }] : planned.steps,
      reason: "Ask: one worker, read-only Q&A.",
    };
  }

  if (mode === "plan") {
    const planner = pick("plan", { preferCheap: false }) || pick(cls.kind);
    if (!planner) return { ...planned, workMode: mode };
    return {
      ...planned,
      workMode: mode,
      steps: [{ role: "answer", worker: planner.id }],
      reason: `Plan: ${planner.name} writes an implementation plan. No edits.`,
    };
  }

  if (mode === "architect") {
    if (available.length >= 2) {
      const a = pick("plan", { preferCheap: false });
      const b = pick("plan", { preferCheap: false, exclude: [a.id] });
      const synth = pick("write", { preferCheap: false }) || a;
      return {
        ...planned,
        workMode: mode,
        steps: [
          { role: "draft", worker: a.id },
          { role: "draft", worker: b.id, parallel: true },
          { role: "synthesize", worker: synth.id },
        ],
        reason: `Architect: ${a.name} + ${b.name} design, ${synth.name} unifies. No edits.`,
      };
    }
    const a = pick("plan", { preferCheap: false }) || pick(cls.kind);
    return {
      ...planned,
      workMode: mode,
      steps: a ? [{ role: "answer", worker: a.id }] : planned.steps,
      reason: `Architect: ${a?.name || "one worker"} designs. No edits.`,
    };
  }

  if (mode === "review") {
    const reviewer = pick("review", { preferCheap: false }) || pick(cls.kind);
    if (!reviewer) return { ...planned, workMode: mode };
    const steps = [{ role: "answer", worker: reviewer.id }];
    if (available.length >= 2) {
      const verifier = pick("review", { preferCheap: false, exclude: [reviewer.id] });
      if (verifier) steps.push({ role: "verify", worker: verifier.id });
    }
    return {
      ...planned,
      workMode: mode,
      steps,
      reason: `Review: ${reviewer.name} reviews${steps[1] ? " with a second opinion" : ""}. No edits.`,
    };
  }

  return { ...planned, workMode: mode === "yolo" ? "yolo" : "agent" };
}
