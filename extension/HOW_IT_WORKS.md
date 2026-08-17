# How Maestro of Cerebellums works

Maestro of Cerebellums is one chat that behaves like a single agent. Behind that chat, a local conductor routes each request to the coding CLIs already installed on this machine: Claude, Grok, OpenAI (Codex), Kimi, and Zai (GLM / ZCode).

It is a local conductor over a worker pool of CLIs you already logged into.

## The path of one message

```
You type in Maestro chat
        │
        ▼
Cursor / VS Code extension
        │  workspace folder, active file, selection
        ▼
Local sidecar  http://127.0.0.1:8788
        │
        ├─ 1. Classify   kind + difficulty
        ├─ 2. Plan       which CLI, and whether to verify
        ├─ 3. Run        shell out to claude / grok / codex / kimi / zcode
        ├─ 4. Verify     second CLI says ACCEPT or REVISE (hard tasks)
        └─ 5. Escalate   stronger CLI if the verifier says REVISE
        │
        ▼
One answer in the chat
+ chips such as  answer: claude · verify: kimi
```

You stay logged into each CLI as usual. Maestro never reads API keys. It launches the binary and that CLI uses its own auth.

## Classify

The conductor is heuristic (rules, not a trained router). It tags the prompt as one of:

| Kind | Typical triggers |
|---|---|
| chat | greetings, short questions |
| write | summarize, explain, draft, translate |
| code | implement, refactor, function, tests |
| debug | crash, stack trace, fails, regression |
| review | review, security, PR, audit |
| plan | architecture, design, migrate |

Longer prompts and code fences raise difficulty. Hard review/plan/debug work is more likely to get a second opinion.

## Fusion panels (OpenRouter-style)

OpenRouter Fusion is not a router that picks one model. It fans the same prompt to a **panel** in parallel, then a **judge** writes one answer. Their Quality default is latest Opus + latest GPT + latest Gemini. Their published budget panel (Gemini Flash + Kimi + DeepSeek) beat solo GPT-5.5 and Opus 4.8 on DRACO.

This Mac has no Gemini CLI. The four presets below pick **specific models**, not just the provider:

| Preset | Panel | Judge | Why this mix |
|---|---|---|---|
| **Quality** | Opus 5 + GPT-5.6 Sol + Grok 4.6 | Opus 5 | Best-of-best. Stands in for latest Opus + GPT + Gemini. |
| **Value** | Sonnet 5 + GPT-5.6 Terra | Sonnet 5 | Second-best. Two strong coding models; you skip a third full draft. |
| **Speed** | Grok 4.6 + Kimi K2.7 Highspeed + GLM-5 Turbo | Grok 4.6 | Fast preset. Similar-latency models so one slow model does not gate the fan-out. |
| **Cheap** | Kimi K3 + GLM-5.3 | Grok 4.5 | Cheap with strong results. Volume pair; Grok 4.5 judges. |

Fusion modes always draft in parallel, then fuse. Auto still picks **one** CLI (and may verify).

## First-time setup

On first install, Maestro detects which CLIs are on this machine and **recommends** a Quality, Value, Speed, and Cheap panel. A setup panel opens so you can accept that mix or change models and thinking effort. Nothing is saved until you click **Accept recommendations** or **Save**.

## Configure models and thinking effort

Click **Configure** in the Maestro chat, or run **Maestro: Configure Fusion Panels**.

For each category you can:

- Add specific models (Opus 5, Sonnet 5, Fable 5, GPT-5.6 Sol/Terra/Luna, Grok 4.6, Kimi K3, GLM-5.3…)
- Put more than one model from the same CLI on a panel (Opus 5 **and** Sonnet 5)
- Set thinking effort per model: `default`, `low`, `medium`, `high`, `max`
- Pick the judge **model** and its effort

Each local pick is passed to the CLI (`claude --model claude-opus-5`, `codex -m gpt-5.6-sol`). OpenRouter picks call `https://openrouter.ai/api/v1` with your saved key (`OPENROUTER_API_KEY` also works).

Effort is passed through where the CLI supports it:

| CLI | Flag |
|---|---|
| Claude | `--effort` (`low` / `medium` / `high` / `max`) |
| Grok | `--reasoning-effort` (`max` becomes `high`) |
| OpenAI / Codex | `model_reasoning_effort` |
| Kimi K3 | `KIMI_MODEL_THINKING_EFFORT`: **low, medium, high, max** (K3 always thinks; `default` uses `~/.kimi-code/config.toml`) |
| Zai | stored; ZCode has no effort flag yet |

Saves to `~/.maestro-of-cerebellums/config.json`. The sidecar rereads it on every request.

## Route

**Auto (Maestro)** picks a worker from who is installed:

- Easy chat / write → cheaper, faster CLI (often Kimi or Grok)
- Review / plan → highest quality with that strength (often Claude)
- Code / debug → balance of quality and speed (often Grok, OpenAI, or Zai)

If the task is hard and at least two CLIs are available, Auto then:

1. Asks a different CLI to **verify** (`ACCEPT` or `REVISE`)
2. If `REVISE` and a stronger CLI exists, **escalates**

**Fast** skips verify. One cheapest capable CLI.

**Ultra** (harder prompts, two or more CLIs): two workers draft in parallel, then one synthesizes a single answer.

You can also pin a CLI from the API with `maestro-claude`, `maestro-grok`, `maestro-openai`, `maestro-kimi`, or `maestro-zai`. Fusion slugs: `maestro-quality`, `maestro-value`, `maestro-speed`, `maestro-cheap`.

## Ask vs Agent

| Mode | What workers may do |
|---|---|
| **Ask** (default) | Read / explain / propose. No file edits. |
| **Agent** | Edit files in the current workspace. |

Keep Ask on unless you want the CLIs to change the repo.

## How to open the chat

1. Reload the window once: `Cmd+Shift+P` → **Developer: Reload Window**
2. Click the infinity icon in the editor title bar, the Maestro tab on the right, or run **Maestro: Open Chat**
3. In VS Code Chat you can also talk to **@maestro**

Status bar (bottom left) shows which CLIs are online, for example `Maestro · claude · grok · kimi`.

## Commands

| Command | Purpose |
|---|---|
| **Maestro: Open Chat** | Full chat panel |
| **Maestro: How It Works** | This guide |
| **Maestro: Doctor** | Which CLIs were found |
| **Maestro: Restart Sidecar** | Restart the local conductor |

## Workers on this Mac

Maestro only uses binaries it can find on your `PATH` (plus `~/.local/bin`, `~/.grok/bin`, `~/.kimi-code/bin`).

| Chip | CLI | Typical job |
|---|---|---|
| claude | Claude Code | reviews, plans, hard reasoning |
| grok | Grok Build | fast coding and debug |
| openai | Codex CLI | OpenAI implementation |
| kimi | Kimi Code | cheap / fast first pass |
| zai | ZCode | Z.ai GLM coding models |

Green chip = detected. Red chip = not installed or disabled.

## What the route chips mean

After a reply:

- `answer: grok` — Grok wrote the reply
- `verify: claude ACCEPT` — Claude checked it and accepted
- `escalate: claude` — the first draft was revised by Claude
- `draft: grok` / `draft: claude` / `synthesize: kimi` — Ultra merged two drafts

## API (optional)

The same conductor is an OpenAI-compatible server:

```bash
curl http://127.0.0.1:8788/v1/chat/completions \
  -H 'Authorization: Bearer shoal-local' \
  -H 'Content-Type: application/json' \
  -d '{"model":"maestro-auto","messages":[{"role":"user","content":"Explain this repo in 5 bullets"}]}'
```

Models: `maestro-auto`, `maestro-fast`, `maestro-ultra`, plus pins. Continue.dev can use **Maestro Auto**.

Do not point Cursor's built-in Agent at this endpoint. These CLIs do not emit OpenAI `tool_calls`. Use **Maestro chat** as the agent.

## Limits

- First reply can take 10–30 seconds (CLI cold start).
- The conductor is rule-based, not a trained router.
- Agent mode can edit files.
- If a chip is red, install that CLI and log in, then run **Maestro: Doctor**.

## Troubleshooting

| Symptom | What to try |
|---|---|
| Status bar says Maestro offline | **Maestro: Restart Sidecar** |
| No CLIs / all chips red | Install and log into at least one of `claude`, `grok`, `codex`, `kimi`, `zcode` |
| Auth errors from a worker | Run that CLI once in a terminal and finish login |
| Chat does not appear | Reload window, then **Maestro: Open Chat** |
| Unexpected file edits | Switch back to **Ask** |
