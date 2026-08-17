# Maestro of Cerebellums

A local multi-model agent from [AutoSolutions.ai](https://autosolutions.ai).

You get **one chat**. Behind it, a local sidecar classifies the request, routes it to the coding CLIs you already have (`claude`, `grok`, `codex` / OpenAI, `kimi`, `zcode` / Zai GLM), verifies hard work with a second model, and returns a single answer.

One chat. Behind it, a local conductor routes work across the coding CLIs you already have installed.

## What you install

1. A **sidecar** on `http://127.0.0.1:8788` (OpenAI-compatible).
2. A **Cursor / VS Code extension** with a single-agent chat panel.

The extension starts the sidecar automatically.

## Install (Cursor)

You are on Cursor, which is the VS Code-compatible editor already on this Mac.

```bash
cd ~/maestro-of-cerebellums
./scripts/install.sh
```

Then reload Cursor (`Cmd+Shift+P` → **Developer: Reload Window**).

Open the infinity icon in the activity bar, or run **Maestro: Open Chat**.

Full in-editor guide: **Maestro: How It Works** (`extension/HOW_IT_WORKS.md`). After reload, Cursor/VS Code also shows a **Get started with Maestro of Cerebellums** walkthrough.

## Modes

| Mode | What it does |
|---|---|
| **Ask** | Read-only. Workers explain or propose diffs. Default. |
| **Agent** | Workers may edit the current workspace. |
| **Auto** | Classify → pick one CLI → verify/escalate if hard. |
| **Quality** | Fusion: Opus 5 + GPT-5.6 Sol + Grok 4.6 → Opus 5 |
| **Value** | Fusion: Sonnet 5 + GPT-5.6 Terra → Sonnet 5 |
| **Speed** | Fusion: Grok 4.6 + Kimi K2.7 Highspeed + GLM-5 Turbo → Grok 4.6 |
| **Cheap** | Fusion: Kimi K3 + GLM-5.3 → Grok 4.5 |
| **Fast single** | Cheapest capable CLI only. |

## Talk to it like an API

```bash
curl http://127.0.0.1:8788/v1/chat/completions \
  -H 'Authorization: Bearer shoal-local' \
  -H 'Content-Type: application/json' \
  -d '{"model":"maestro-auto","messages":[{"role":"user","content":"Explain this repo in 5 bullets"}]}'
```

Models: `maestro-auto`, `maestro-fast`, `maestro-ultra`, plus pins like `maestro-claude` / `maestro-grok`.

Continue.dev is patched by the installer so **Maestro Auto** appears as a model.

## Doctor

```bash
node ~/maestro-of-cerebellums/extension/sidecar/server.js doctor
```

Or in Cursor: **Maestro: Doctor**.

## Honest limits

- The conductor is heuristic, not a trained router.
- Workers are full CLIs, so the first reply can take a while. Cold starts are slower than a raw API.
- Cursor's built-in Agent cannot use Maestro as its hidden model well: those CLIs do not emit OpenAI `tool_calls`. Use the **Maestro chat** as the agent.
- Agent mode can edit files. Keep Ask mode on unless you want that.

## Layout

```
maestro-of-cerebellums/
  extension/          Cursor / VS Code extension
    sidecar/          local orchestrator
    media/            chat UI
  scripts/install.sh
  tests/
```
