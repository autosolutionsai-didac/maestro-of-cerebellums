const vscode = require("vscode");
const { spawn, execSync } = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");

const DEFAULT_PORT = 8788;
const API_KEY = "shoal-local";

let sidecar = null;
let sidecarPort = DEFAULT_PORT;
let statusBar = null;
let currentPanel = null;
let sidebarView = null;
let messages = [];
let abortController = null;

function extraPath() {
  const home = os.homedir();
  return [
    path.join(home, ".local", "bin"),
    path.join(home, ".grok", "bin"),
    path.join(home, ".kimi-code", "bin"),
    "/Applications/ZCode.app/Contents/Resources/glm",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.PATH || "",
  ].join(path.delimiter);
}

function request(pathname, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1",
        port: sidecarPort,
        path: pathname,
        method,
        headers: {
          authorization: `Bearer ${API_KEY}`,
          "content-type": "application/json",
          ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if (res.headers["content-type"]?.includes("text/event-stream")) {
            resolve({ status: res.statusCode, raw, stream: true });
            return;
          }
          try {
            resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : {}, raw });
          } catch {
            resolve({ status: res.statusCode, raw });
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function health(port = sidecarPort) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/healthz", timeout: 800 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function sidecarIsCurrent(info) {
  return Boolean(info?.ok && info.name === "maestro-of-cerebellums");
}

function killListener(port) {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: "utf8" });
    for (const pid of out.trim().split(/\s+/).filter(Boolean)) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        // already gone
      }
    }
  } catch {
    // nothing listening
  }
}

async function ensureSidecar(context) {
  for (let i = 0; i < 8; i += 1) {
    const existing = await health(DEFAULT_PORT);
    if (sidecarIsCurrent(existing)) {
      sidecarPort = DEFAULT_PORT;
      return existing;
    }
    if (existing?.ok) {
      console.log(`[maestro] replacing stale sidecar (${existing.name || "unknown"}) on ${DEFAULT_PORT}`);
      killListener(DEFAULT_PORT);
      await new Promise((r) => setTimeout(r, 200));
      break;
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  const script = path.join(context.extensionPath, "sidecar", "server.js");
  sidecar = spawn(process.execPath, [script], {
    cwd: context.extensionPath,
    env: {
      ...process.env,
      PATH: extraPath(),
      MAESTRO_PORT: String(DEFAULT_PORT),
      MAESTRO_API_KEY: API_KEY,
      FUGU_PORT: String(DEFAULT_PORT),
      FUGU_API_KEY: API_KEY,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  sidecar.stdout.on("data", (d) => console.log(`[maestro] ${d}`));
  sidecar.stderr.on("data", (d) => console.error(`[maestro] ${d}`));
  sidecar.on("exit", (code) => {
    sidecar = null;
    if (statusBar) statusBar.text = "$(warning) Maestro offline";
    if (code && code !== 0) {
      console.error(`Maestro sidecar exited ${code}`);
    }
  });

  for (let i = 0; i < 25; i += 1) {
    await new Promise((r) => setTimeout(r, 150));
    const ok = await health(DEFAULT_PORT);
    if (ok?.ok) {
      sidecarPort = DEFAULT_PORT;
      return ok;
    }
  }
  throw new Error("Maestro sidecar failed to start. Run Maestro: Doctor.");
}

function updateStatus(info) {
  if (!statusBar) return;
  const ready = (info?.workers || []).filter((w) => w.ok);
  statusBar.text = ready.length ? `$(organization) Maestro · ${ready.map((w) => w.id).join(" · ")}` : "$(organization) Maestro · no CLIs";
  statusBar.tooltip = "Open Maestro of Cerebellums chat";
}

function htmlForWebview(webview, context) {
  const media = path.join(context.extensionPath, "media");
  const html = require("fs")
    .readFileSync(path.join(media, "chat.html"), "utf8")
    .replace(/\{\{csp\}\}/g, webview.cspSource)
    .replace("{{css}}", webview.asWebviewUri(vscode.Uri.file(path.join(media, "chat.css"))).toString())
    .replace("{{js}}", webview.asWebviewUri(vscode.Uri.file(path.join(media, "chat.js"))).toString());
  return html;
}

function workspaceContext() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  const editor = vscode.window.activeTextEditor;
  return {
    cwd: folder,
    activeFile: editor ? editor.document.uri.fsPath : null,
    selection: editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : "",
  };
}

function streamChat(body, onEvent) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port: sidecarPort,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          authorization: `Bearer ${API_KEY}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let buffer = "";
        let text = "";
        let route = [];
        res.setEncoding("utf8");
        const handleBlock = (block) => {
          const line = block
            .split("\n")
            .filter((l) => l.startsWith("data: "))
            .map((l) => l.slice(6))
            .join("");
          if (!line || line === "[DONE]") return;
          let parsed;
          try {
            parsed = JSON.parse(line);
          } catch {
            return;
          }
          if (parsed.error?.message) throw new Error(parsed.error.message);
          if (parsed.object === "maestro.event" || parsed.object === "fugu.event") {
            const ev = parsed.event || {};
            if (ev.type === "status" || ev.type === "route") {
              onEvent({
                type: "progress",
                text: ev.text || `Consulting ${ev.name || ev.worker}…`,
                worker: ev.worker,
                name: ev.name,
              });
            }
            if (ev.type === "done") {
              text = ev.text || text;
              route = ev.shoal?.route || route;
            }
          } else if (parsed.choices?.[0]?.delta?.content) {
            const chunk = parsed.choices[0].delta.content;
            text += chunk;
            onEvent({ type: "token", text: chunk });
          } else if (parsed.shoal?.route) {
            route = parsed.shoal.route;
          }
        };
        res.on("data", (chunk) => {
          buffer += chunk;
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          try {
            for (const part of parts) handleBlock(part);
          } catch (err) {
            reject(err);
          }
        });
        res.on("end", () => {
          try {
            if (buffer.trim()) handleBlock(buffer);
            resolve({ text, route });
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function loadConfigTo(webview) {
  try {
    const result = await request("/v1/presets");
    webview.postMessage({ type: "config", ...(result.json || {}) });
  } catch (err) {
    webview.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

async function saveConfigFrom(webview, presets) {
  try {
    const result = await request("/v1/presets", { method: "POST", body: { presets } });
    webview.postMessage({ type: "config", saved: true, ...(result.json || {}) });
  } catch (err) {
    webview.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

async function onWebviewMessage(webview, msg) {
  if (msg.type === "ready") {
    const info = await health();
    webview.postMessage({ type: "status", workers: info?.workers || [] });
    await loadConfigTo(webview);
  } else if (msg.type === "send") {
    await runPrompt(webview, msg);
  } else if (msg.type === "newChat") {
    messages = [];
    webview.postMessage({ type: "reset" });
  } else if (msg.type === "loadConfig") {
    await loadConfigTo(webview);
  } else if (msg.type === "saveConfig") {
    await saveConfigFrom(webview, msg.presets);
  }
}

async function runPrompt(webview, payload) {
  const modelMap = {
    quality: "maestro-quality",
    value: "maestro-value",
    speed: "maestro-speed",
    cheap: "maestro-cheap",
    ultra: "maestro-quality",
    fast: "maestro-fast",
    auto: "maestro-auto",
  };
  const model = modelMap[payload.mode] || "maestro-auto";
  messages.push({ role: "user", content: payload.text });
  try {
    const result = await streamChat(
      {
        model,
        stream: true,
        agentMode: payload.agentMode,
        context: workspaceContext(),
        messages,
      },
      (event) => webview.postMessage(event)
    );
    messages.push({ role: "assistant", content: result.text });
    webview.postMessage({ type: "done", text: result.text, route: result.route });
  } catch (err) {
    webview.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

async function openChat(context) {
  try {
    await vscode.commands.executeCommand("workbench.action.focusAuxiliaryBar");
    await vscode.commands.executeCommand("maestro.sidebar.focus");
    if (sidebarView) return sidebarView;
  } catch {
    // Older editors without an auxiliary bar fall through to a panel.
  }
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    return currentPanel;
  }
  const panel = vscode.window.createWebviewPanel(
    "maestro.chat",
    "Maestro of Cerebellums",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "media"))],
    }
  );
  currentPanel = panel;
  panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, "images", "icon.png"));
  panel.webview.html = htmlForWebview(panel.webview, context);
  panel.onDidDispose(() => {
    if (currentPanel === panel) currentPanel = null;
  });
  panel.webview.onDidReceiveMessage((msg) => onWebviewMessage(panel.webview, msg));
  return panel;
}

function postToViews(msg) {
  if (currentPanel) currentPanel.webview.postMessage(msg);
  if (sidebarView) sidebarView.webview.postMessage(msg);
}

function activeWebview() {
  if (sidebarView?.visible) return sidebarView.webview;
  if (currentPanel) return currentPanel.webview;
  return sidebarView?.webview || null;
}

class MaestroViewProvider {
  constructor(context) {
    this.context = context;
  }
  resolveWebviewView(webviewView) {
    sidebarView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, "media"))],
    };
    webviewView.webview.html = htmlForWebview(webviewView.webview, this.context);
    webviewView.webview.onDidReceiveMessage((msg) => onWebviewMessage(webviewView.webview, msg));
    webviewView.onDidDispose(() => {
      if (sidebarView === webviewView) sidebarView = null;
    });
  }
}

function showHowItWorks(context) {
  const uri = vscode.Uri.file(path.join(context.extensionPath, "HOW_IT_WORKS.md"));
  return vscode.commands.executeCommand("markdown.showPreview", uri);
}

async function showDoctor() {
  const info = await health();
  if (!info) {
    vscode.window.showErrorMessage("Maestro sidecar is not running.");
    return;
  }
  const lines = info.workers.map((w) => `${w.ok ? "OK " : "NO "} ${w.id.padEnd(7)} ${w.version || w.error || ""}`);
  vscode.window.showInformationMessage(`Maestro workers:\n${lines.join("\n")}`, { modal: true });
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
  statusBar.command = "maestro.openChat";
  statusBar.text = "$(organization) Maestro starting";
  statusBar.show();
  context.subscriptions.push(statusBar);

  try {
    const info = await ensureSidecar(context);
    updateStatus(info);
    const setup = await request("/v1/presets").catch(() => ({ json: {} }));
    const setupNeeded = Boolean(setup.json?.setupNeeded);
    if (setupNeeded) {
      const target = activeWebview();
      if (target) target.postMessage({ type: "openConfig" });
      else {
        const opened = await openChat(context);
        setTimeout(() => {
          const wv = opened?.webview || activeWebview();
          if (wv) wv.postMessage({ type: "openConfig" });
        }, 250);
      }
      vscode.window.showInformationMessage(
        "Maestro found your installed CLIs and built recommended Fusion panels. Accept or edit them to finish setup."
      );
    } else if (!context.globalState.get("maestro.welcomed")) {
      await context.globalState.update("maestro.welcomed", true);
      const pick = await vscode.window.showInformationMessage(
        "Maestro of Cerebellums is ready. One chat, routed across your installed CLIs.",
        "Open Chat",
        "How it works"
      );
      if (pick === "Open Chat") openChat(context);
      if (pick === "How it works") showHowItWorks(context);
    }
  } catch (err) {
    statusBar.text = "$(warning) Maestro offline";
    vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("maestro.sidebar", new MaestroViewProvider(context), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("maestro.openChat", () => openChat(context)),
    vscode.commands.registerCommand("maestro.newChat", () => {
      messages = [];
      postToViews({ type: "reset" });
    }),
    vscode.commands.registerCommand("maestro.howItWorks", () => {
      const wv = activeWebview();
      if (wv) wv.postMessage({ type: "openHelp" });
      else showHowItWorks(context);
    }),
    vscode.commands.registerCommand("maestro.configure", async () => {
      const wv = activeWebview();
      if (wv) {
        wv.postMessage({ type: "openConfig" });
        return;
      }
      const opened = await openChat(context);
      setTimeout(() => {
        const next = opened?.webview || activeWebview();
        if (next) next.postMessage({ type: "openConfig" });
      }, 200);
    }),
    vscode.commands.registerCommand("maestro.doctor", () => showDoctor()),
    vscode.commands.registerCommand("maestro.restart", async () => {
      if (sidecar) sidecar.kill();
      sidecar = null;
      killListener(DEFAULT_PORT);
      await new Promise((r) => setTimeout(r, 200));
      const info = await ensureSidecar(context);
      updateStatus(info);
      vscode.window.showInformationMessage("Maestro sidecar restarted.");
    })
  );

  const participant = vscode.chat.createChatParticipant("maestro.local", async (request, _chatContext, stream, _token) => {
    stream.progress("Maestro is routing across your local CLIs…");
    try {
      const result = await streamChat(
        {
          model: "maestro-auto",
          stream: true,
          agentMode: "ask",
          context: workspaceContext(),
          messages: [{ role: "user", content: request.prompt }],
        },
        (event) => {
          if (event.type === "progress") stream.progress(event.text);
          if (event.type === "token") stream.markdown(event.text);
        }
      );
      if (result.route?.length) {
        const chips = result.route.map((s) => `\`${s.role}: ${s.worker}\``).join(" · ");
        stream.markdown(`\n\n${chips}`);
      }
    } catch (err) {
      stream.markdown(err instanceof Error ? err.message : String(err));
    }
  });
  participant.iconPath = vscode.Uri.file(path.join(context.extensionPath, "images", "icon.png"));
  context.subscriptions.push(participant);
}

function deactivate() {
  if (sidecar) sidecar.kill();
}

module.exports = { activate, deactivate };
