const vscode = acquireVsCodeApi();
const thread = document.getElementById("thread");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const workersEl = document.getElementById("workers");
const modeEl = document.getElementById("mode");
const agentModeEl = document.getElementById("agentMode");
const errorEl = document.getElementById("error");
const contextBtn = document.getElementById("contextBtn");

let busy = false;
let currentAssistant = null;
let currentStatus = null;
const emptyHtml = document.getElementById("empty")?.innerHTML || "";

const FALLBACK_CATALOG = {
  claude: [
    { id: "claude-opus-5", label: "Opus 5" },
    { id: "claude-sonnet-5", label: "Sonnet 5" },
    { id: "claude-fable-5", label: "Fable 5" },
    { id: "claude-haiku-4-5", label: "Haiku 4.5" },
  ],
  openai: [
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" },
  ],
  grok: [
    { id: "grok-4.6", label: "Grok 4.6" },
    { id: "grok-4.5", label: "Grok 4.5" },
  ],
  kimi: [
    { id: "kimi-code/k3", label: "Kimi K3" },
    { id: "kimi-code/k3-256k", label: "Kimi K3 256k" },
    { id: "kimi-code/kimi-for-coding", label: "Kimi K2.7 Coding" },
    { id: "kimi-code/kimi-for-coding-highspeed", label: "Kimi K2.7 Highspeed" },
  ],
  zai: [
    { id: "zai/GLM-5.3", label: "GLM-5.3" },
    { id: "zai/GLM-5.2", label: "GLM-5.2" },
    { id: "zai/GLM-5-Turbo", label: "GLM-5 Turbo" },
  ],
  openrouter: [
    { id: "openrouter/auto", label: "OpenRouter Auto" },
    { id: "openrouter/fusion", label: "OpenRouter Fusion" },
    { id: "anthropic/claude-opus-5", label: "Claude Opus 5" },
    { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol" },
    { id: "google/gemini-3.7-flash", label: "Gemini 3.7 Flash" },
    { id: "x-ai/grok-4.6", label: "Grok 4.6" },
    { id: "deepseek/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro" },
    { id: "moonshotai/kimi-k3", label: "Kimi K3" },
    { id: "qwen/qwen3.8-max", label: "Qwen3.8 Max" },
  ],
};

function setBusy(next) {
  busy = next;
  sendBtn.disabled = next;
  sendBtn.classList.toggle("busy", next);
}

function hideEmpty() {
  document.getElementById("empty")?.remove();
}

function addMessage(role, text) {
  hideEmpty();
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  if (role === "assistant") {
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = "AutoSolutions.ai";
    el.appendChild(who);
  }
  const body = document.createElement("div");
  body.className = "body";
  body.textContent = text;
  el.appendChild(body);
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return { el, body };
}

function setStatus(text) {
  if (!currentStatus) {
    currentStatus = document.createElement("div");
    currentStatus.className = "msg status";
    thread.appendChild(currentStatus);
  }
  currentStatus.textContent = text;
  thread.scrollTop = thread.scrollHeight;
}

function clearStatus() {
  if (currentStatus) {
    currentStatus.remove();
    currentStatus = null;
  }
}

function renderWorkers(workers) {
  workersEl.innerHTML = "";
  for (const w of workers || []) {
    const chip = document.createElement("span");
    chip.className = `chip ${w.ok ? "ok" : "bad"}`;
    chip.textContent = w.id;
    chip.title = w.ok ? w.version || "ready" : w.error || "unavailable";
    workersEl.appendChild(chip);
  }
}

function updateHint() {
  if (!contextBtn) return;
  contextBtn.title =
    agentModeEl.value === "agent"
      ? "Agent mode · workers may edit this workspace. Workspace context is sent automatically."
      : "Ask mode · no file edits. Workspace context is sent automatically.";
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}

function bindEmptyActions(root) {
  root?.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      modeEl.value = btn.getAttribute("data-mode");
    });
  });
  root?.querySelectorAll("[data-agent]").forEach((btn) => {
    btn.addEventListener("click", () => {
      agentModeEl.value = btn.getAttribute("data-agent");
      updateHint();
    });
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  errorEl.textContent = "";
  addMessage("user", text);
  currentAssistant = addMessage("assistant", "");
  setBusy(true);
  vscode.postMessage({
    type: "send",
    text,
    mode: modeEl.value,
    agentMode: agentModeEl.value,
  });
  input.value = "";
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
input.addEventListener("input", resizeInput);

const help = document.getElementById("help");
const configEl = document.getElementById("config");
const presetEditor = document.getElementById("presetEditor");
const configStatus = document.getElementById("configStatus");
let configState = null;

function setHelpOpen(open) {
  help.hidden = !open;
  if (open) configEl.hidden = true;
}
function setConfigOpen(open) {
  configEl.hidden = !open;
  if (open) {
    help.hidden = true;
    vscode.postMessage({ type: "loadConfig" });
  }
}
document.getElementById("helpClose").addEventListener("click", () => setHelpOpen(false));
document.getElementById("configClose").addEventListener("click", () => setConfigOpen(false));

function effortSelect(name, value, efforts, slot) {
  const list = efforts && efforts.length ? efforts : ["default", "low", "medium", "high", "max"];
  const current = list.includes(value) ? value : list[0];
  const slotAttr = slot ? ` data-slot="${slot}"` : "";
  return `<select data-field="${name}"${slotAttr}>${list
    .map((e) => `<option value="${e}" ${e === current ? "selected" : ""}>${e}</option>`)
    .join("")}</select>`;
}

function installedSet(state) {
  const ids = state.detected || (state.workers || []).filter((w) => w.ok).map((w) => w.id);
  const set = new Set(ids);
  if (state.openrouter?.hasKey) set.add("openrouter");
  return set;
}

function renderOpenRouterStatus(state) {
  const status = document.getElementById("orStatus");
  const input = document.getElementById("orKey");
  if (!status) return;
  const info = state.openrouter || {};
  if (info.hasKey) {
    const count = (info.models || []).length;
    status.textContent = info.fromEnv
      ? `Using OPENROUTER_API_KEY from the environment${count ? ` · ${count} models` : ""}.`
      : `Key saved (${info.last4 || "••••"})${count ? ` · ${count} models` : ""}.`;
    if (input && !input.value) input.placeholder = info.last4 || "sk-or-…";
  } else {
    status.textContent = "No key yet. Panels can still use local CLIs.";
  }
}

function providerName(state, id) {
  return (state.providerLabels && state.providerLabels[id]) || id;
}

function encodeSlot(id, model) {
  return `${id}::${model || "default"}`;
}

function decodeSlot(value) {
  const raw = String(value || "");
  const idx = raw.indexOf("::");
  if (idx === -1) return { id: raw, model: "default" };
  return { id: raw.slice(0, idx), model: raw.slice(idx + 2) };
}

function effortsFor(state, workerId) {
  const byWorker = state.effortsByWorker || {};
  return byWorker[workerId] || state.efforts || ["default", "low", "medium", "high", "max"];
}

function modelSelectHtml(state, selectedValue, slotName = "model") {
  const installed = installedSet(state);
  const catalog = Object.keys(state.modelsByWorker || {}).length ? state.modelsByWorker : FALLBACK_CATALOG;
  const ids = state.workerIds || Object.keys(catalog);
  const groups = ids.map((id) => {
    const missing = !installed.has(id);
    const models = [...(catalog[id] || [])];
    const selected = decodeSlot(selectedValue);
    if (selected.id === id && selected.model && selected.model !== "default" && !models.some((m) => m.id === selected.model)) {
      models.push({ id: selected.model, label: selected.model });
    }
    const opts = [
      `<option value="${encodeSlot(id, "default")}" ${selectedValue === encodeSlot(id, "default") ? "selected" : ""}>${providerName(state, id)} · CLI default${missing ? " (not installed)" : ""}</option>`,
      ...models.map((m) => {
        const val = encodeSlot(id, m.id);
        return `<option value="${val}" ${val === selectedValue ? "selected" : ""}>${m.label}${missing ? " (not installed)" : ""}</option>`;
      }),
    ];
    return `<optgroup label="${providerName(state, id)}">${opts.join("")}</optgroup>`;
  });
  return `<select data-slot="${slotName}">${groups.join("")}</select>`;
}

function memberRowHtml(state, pid, member, index) {
  const id = member.id || "claude";
  const model = member.model || "default";
  const installed = installedSet(state);
  const missing = !installed.has(id);
  const value = encodeSlot(id, model);
  return `<div class="member-row${missing ? " missing" : ""}" data-index="${index}">
    ${modelSelectHtml(state, value)}
    ${effortSelect(`${pid}:${index}`, member.effort || "default", effortsFor(state, id), "effort")}
    <button type="button" class="ghost icon-btn" data-remove title="Remove model">×</button>
  </div>`;
}

function firstUnusedSlot(state, used) {
  const installed = installedSet(state);
  const catalog = Object.keys(state.modelsByWorker || {}).length ? state.modelsByWorker : FALLBACK_CATALOG;
  const ids = [...installed, ...(state.workerIds || [])];
  for (const id of ids) {
    for (const model of catalog[id] || []) {
      const val = encodeSlot(id, model.id);
      if (!used.has(val)) return { id, model: model.id, effort: "default" };
    }
  }
  return { id: "claude", model: "claude-opus-5", effort: "default" };
}

function bindPresetEditor(state) {
  for (const card of presetEditor.querySelectorAll(".preset-card")) {
    const pid = card.getAttribute("data-preset");
    card.querySelector("[data-add]")?.addEventListener("click", () => {
      const used = new Set(
        [...card.querySelectorAll('select[data-slot="model"]')].map((el) => el.value)
      );
      const next = firstUnusedSlot(state, used);
      const wrap = card.querySelector(".member-list");
      wrap.insertAdjacentHTML("beforeend", memberRowHtml(state, pid, next, wrap.children.length));
      bindRow(state, wrap.lastElementChild);
    });
    for (const row of card.querySelectorAll(".member-row")) bindRow(state, row);
    const judgeModel = card.querySelector('select[data-slot="judge-model"]');
    judgeModel?.addEventListener("change", () => {
      const { id } = decodeSlot(judgeModel.value);
      const current = card.querySelector('select[data-slot="judge-effort"]');
      const prev = current?.value || "default";
      if (current) {
        current.outerHTML = effortSelect(`judge-effort:${pid}`, prev, effortsFor(state, id), "judge-effort");
      }
    });
  }
}

function bindRow(state, row) {
  const modelSel = row.querySelector('select[data-slot="model"]');
  const effortSel = row.querySelector('select[data-slot="effort"]');
  row.querySelector("[data-remove]")?.addEventListener("click", () => row.remove());
  modelSel?.addEventListener("change", () => {
    const { id } = decodeSlot(modelSel.value);
    const prev = effortSel.value;
    const replacement = effortSelect(effortSel.getAttribute("data-field") || "effort", prev, effortsFor(state, id), "effort");
    effortSel.outerHTML = replacement;
    row.classList.toggle("missing", !installedSet(state).has(id));
  });
}

function renderPresetEditor(state) {
  if (!state) return;
  configState = state;
  const installed = installedSet(state);
  const title = document.getElementById("configTitle");
  const intro = document.getElementById("configIntro");
  const detected = document.getElementById("configDetected");
  const acceptBtn = document.getElementById("configAccept");
  if (state.setupNeeded) {
    title.textContent = "Recommended setup";
    intro.textContent =
      "These panels are suggested from the models your CLIs can run. Accept them, or switch Opus 5 for Sonnet 5 (or any other model) first.";
    acceptBtn.hidden = false;
  } else {
    title.textContent = "Configure Fusion panels";
    intro.innerHTML =
      "Pick specific models (Opus 5, Sonnet 5, GPT-5.6 Sol…) and thinking effort for each category. Saved to <code>~/.maestro-of-cerebellums/config.json</code>.";
    acceptBtn.hidden = false;
  }
  renderOpenRouterStatus(state);
  detected.textContent = installed.size
    ? `Detected: ${[...installed].map((id) => providerName(state, id)).join(", ")}.`
    : "No coding CLIs detected. Install Claude, Codex, Grok, Kimi, or ZCode, or add an OpenRouter key.";
  const order = ["quality", "value", "speed", "cheap"];
  presetEditor.innerHTML = order
    .map((pid) => {
      const preset = state.presets[pid] || {};
      const panel = preset.panel && preset.panel.length ? preset.panel : [{ id: "claude", model: "claude-opus-5", effort: "default" }];
      const rows = panel.map((member, index) => memberRowHtml(state, pid, member, index)).join("");
      const judge = preset.judge || { id: "claude", model: "claude-opus-5", effort: "high" };
      const judgeValue = encodeSlot(judge.id, judge.model || "default");
      return `<section class="preset-card" data-preset="${pid}">
        <h3>${preset.label || pid}</h3>
        ${preset.fit ? `<p class="fit">${preset.fit}</p>` : ""}
        <div class="preset-judge">
          <span>Judge</span>
          ${modelSelectHtml(state, judgeValue, "judge-model")}
          ${effortSelect(`judge-effort:${pid}`, judge.effort || "default", effortsFor(state, judge.id), "judge-effort")}
        </div>
        <div class="member-list">${rows}</div>
        <button type="button" class="ghost add-model" data-add>+ Add model</button>
      </section>`;
    })
    .join("");
  bindPresetEditor(state);
}

function collectPresets() {
  const next = {};
  for (const card of presetEditor.querySelectorAll(".preset-card")) {
    const pid = card.getAttribute("data-preset");
    const panel = [];
    for (const row of card.querySelectorAll(".member-row")) {
      const parsed = decodeSlot(row.querySelector('select[data-slot="model"]').value);
      const effort = row.querySelector('select[data-slot="effort"]').value;
      panel.push({ id: parsed.id, model: parsed.model, effort });
    }
    const judgeParsed = decodeSlot(card.querySelector('select[data-slot="judge-model"]').value);
    const judgeEffort = card.querySelector('select[data-slot="judge-effort"]').value;
    next[pid] = {
      panel,
      judge: { id: judgeParsed.id, model: judgeParsed.model, effort: judgeEffort },
    };
  }
  return next;
}

document.getElementById("orSave")?.addEventListener("click", () => {
  const apiKey = document.getElementById("orKey")?.value || "";
  if (!apiKey.trim()) {
    document.getElementById("orStatus").textContent = "Paste an OpenRouter key first.";
    return;
  }
  document.getElementById("orStatus").textContent = "Saving key…";
  vscode.postMessage({ type: "saveOpenRouter", apiKey: apiKey.trim(), refresh: true });
});
document.getElementById("orRefresh")?.addEventListener("click", () => {
  document.getElementById("orStatus").textContent = "Refreshing OpenRouter catalog…";
  const apiKey = document.getElementById("orKey")?.value || "";
  vscode.postMessage({ type: "saveOpenRouter", apiKey: apiKey.trim() || undefined, refresh: true });
});

document.getElementById("configSave").addEventListener("click", () => {
  configStatus.textContent = "Saving…";
  vscode.postMessage({ type: "saveConfig", presets: collectPresets() });
});
document.getElementById("configReset").addEventListener("click", () => {
  const source = configState?.recommended || configState?.defaults;
  if (!source) return;
  const rebuilt = {};
  for (const id of ["quality", "value", "speed", "cheap"]) {
    rebuilt[id] = {
      id,
      label: source[id].label || id,
      panel: source[id].panel,
      judge: source[id].judge,
      fit: source[id].fit,
    };
  }
  configState.presets = rebuilt;
  renderPresetEditor(configState);
  configStatus.textContent = "Recommendations restored — click Accept or Save.";
});
document.getElementById("configAccept").addEventListener("click", () => {
  if (configState?.recommended && configState.setupNeeded) {
    configState.presets = configState.recommended;
    renderPresetEditor(configState);
  }
  configStatus.textContent = "Saving recommendations…";
  vscode.postMessage({ type: "saveConfig", presets: collectPresets() });
});

agentModeEl.addEventListener("change", updateHint);

window.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "status") {
    renderWorkers(msg.workers);
  } else if (msg.type === "openConfig") {
    setConfigOpen(true);
  } else if (msg.type === "openHelp") {
    setHelpOpen(true);
  } else if (msg.type === "config") {
    renderPresetEditor(msg);
    if (msg.saved) {
      configStatus.textContent = "Saved. You can close this panel and start chatting.";
    } else if (msg.setupNeeded) {
      configEl.hidden = false;
      help.hidden = true;
      configStatus.textContent = "First-time setup — accept these or change them.";
    }
  } else if (msg.type === "route" || msg.type === "progress") {
    setStatus(msg.text || `Consulting ${msg.name || msg.worker}…`);
  } else if (msg.type === "token") {
    clearStatus();
    if (currentAssistant) currentAssistant.body.textContent += msg.text || "";
    thread.scrollTop = thread.scrollHeight;
  } else if (msg.type === "done") {
    clearStatus();
    if (currentAssistant) {
      currentAssistant.body.textContent = msg.text || currentAssistant.body.textContent;
      if (msg.route && msg.route.length) {
        const meta = document.createElement("div");
        meta.className = "meta";
        for (const step of msg.route) {
          const chip = document.createElement("span");
          chip.className = "chip ok";
          const effort = step.effort && step.effort !== "default" ? ` ${step.effort}` : "";
          const who = step.modelLabel || step.name || step.model || step.worker;
          chip.textContent = `${step.role}: ${who}${effort}${step.verdict ? ` ${step.verdict}` : ""}`;
          meta.appendChild(chip);
        }
        currentAssistant.el.appendChild(meta);
      }
    }
    currentAssistant = null;
    setBusy(false);
  } else if (msg.type === "error") {
    clearStatus();
    errorEl.textContent = msg.message || "Something went wrong.";
    if (currentAssistant && !currentAssistant.body.textContent) {
      currentAssistant.body.textContent = msg.message || "Failed.";
    }
    currentAssistant = null;
    setBusy(false);
  } else if (msg.type === "reset") {
    thread.innerHTML = "";
    const next = document.createElement("div");
    next.className = "empty";
    next.id = "empty";
    next.innerHTML = emptyHtml;
    thread.appendChild(next);
    bindEmptyActions(next);
    currentAssistant = null;
    currentStatus = null;
    setBusy(false);
    errorEl.textContent = "";
  }
});

updateHint();
bindEmptyActions(document.getElementById("empty"));
resizeInput();
vscode.postMessage({ type: "ready" });
