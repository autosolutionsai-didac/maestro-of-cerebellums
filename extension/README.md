# Maestro of Cerebellums

One chat. Multiple local coding CLIs behind it. Published by [AutoSolutions.ai](https://autosolutions.ai).

Maestro of Cerebellums is a local multi-model orchestrator for Cursor and VS Code. You talk to a single agent. A local sidecar classifies the request, routes it to Claude, Grok, OpenAI (Codex), Kimi, or Zai/GLM (whichever you already have installed), verifies hard work, and returns one answer.

## Open the chat

1. `Cmd+Shift+P` → **Developer: Reload Window** (once, after install)
2. Click the infinity icon in the activity bar, **or** run **Maestro: Open Chat**
3. Optional: in VS Code Chat, ask **@maestro**

Bottom-left status bar shows live workers, for example `Maestro · claude · grok · kimi`.

## Quick start

1. Leave **Ask** and **Auto (Maestro)** selected.
2. Type a question. Example: `Review the auth module for security issues.`
3. Wait for the first CLI cold start (often 10–30s).
4. Read the answer, then the chips under it (`answer: claude · verify: kimi`).

Keep **Ask** unless you want workers to edit the workspace.

## Modes

**Routing**

| Auto | Classify, pick one CLI, verify/escalate when the task is hard |
| Quality | Fusion: Opus 5 + GPT-5.6 Sol + Grok 4.6 → Opus 5 |
| Value | Fusion: Sonnet 5 + GPT-5.6 Terra → Sonnet 5 |
| Speed | Fusion: Grok 4.6 + Kimi K2.7 Highspeed + GLM-5 Turbo → Grok 4.6 |
| Cheap | Fusion: Kimi K3 + GLM-5.3 → Grok 4.5 |
| Fast single | Cheapest capable CLI only |

**Permissions**

| Ask | Read-only. Default. |
| Agent | Workers may edit the current workspace. |

## Commands

- **Maestro: Open Chat**
- **Maestro: How It Works** — full guide
- **Maestro: Doctor** — which CLIs were found
- **Maestro: Restart Sidecar** — restart `127.0.0.1:8788`

## How a request is routed

You → extension → local sidecar → classify → plan → run CLI → optional verify → one reply.

Maestro never reads API keys. It launches `claude`, `grok`, `codex`, `kimi`, or `zcode` with the login you already completed.

Details: open **Maestro: How It Works**.
