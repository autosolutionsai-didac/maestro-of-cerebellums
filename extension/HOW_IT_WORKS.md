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

On first install, Maestro detects which CLIs are on this machine and **recommends** a Quality, Value, Speed, and Cheap panel. A setup panel opens so you can accept that mix or change models and thinking effort. Edits turn the button into **Save**. After a save it becomes **Accept**, which closes the panel and returns you to chat.

## Configure models and thinking effort

Click **Configure** in the Maestro chat, or run **Maestro: Configure Fusion Panels**.

For each category you can:

- Add specific models (Opus 5, Sonnet 5, Fable 5, GPT-5.6 Sol/Terra/Luna, Grok 4.6, Kimi K3, GLM-5.3…)
- Put more than one model from the same CLI on a panel (Opus 5 **and** Sonnet 5)
- Set thinking effort per model using **that provider’s names** (the list changes when you switch models)
- Pick the judge **model** and its effort

Each local pick is passed to the CLI (`claude --model claude-opus-5`, `codex -m gpt-5.6-sol`). OpenRouter picks call `https://openrouter.ai/api/v1` with your saved key (`OPENROUTER_API_KEY` also works).

Effort is passed through with the provider’s own tokens (`default` omits the flag):

| Model | Flag | Levels |
|---|---|---|
| Claude Opus 5 / Sonnet 5 / Fable 5 | `--effort` | `low` `medium` `high` `xhigh` `max` |
| Claude Haiku 4.5 | — | no effort control |
| GPT-5.6 Sol / Terra / Luna | `model_reasoning_effort` | `none` `low` `medium` `high` `xhigh` `max` |
| GPT-5.5 / 5.4 / 5.3 Codex Spark | `model_reasoning_effort` | `none` `low` `medium` `high` `xhigh` |
| Grok 4.6 | `--reasoning-effort` | `low` `medium` `high` `xhigh` (cannot disable) |
| Grok 4.5 | `--reasoning-effort` | `low` `medium` `high` |
| Kimi K3 / K3 256k | `KIMI_MODEL_THINKING_EFFORT` | `low` `high` `max` (no `medium`; `default` uses `~/.kimi-code/config.toml`) |
| Kimi K2.7 Coding | — | always thinking |
| Zai / GLM | — | ZCode has no effort flag |
| OpenRouter | `reasoning.effort` | per model from `supported_efforts` (`none`, `minimal`, `xhigh`, …) |

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

## Work modes (Ask / Plan / Architect / Agent / Yolo / Review)

Other coding agents split this the same way: Claude Code has **Plan**, Cline is **Plan vs Act**, Roo has **Architect**, Codex uses **read-only** vs **workspace-write**. Ask vs Agent was only the permission bit. Maestro now has six work modes that change **orchestration** and **permissions**.

| Mode | Orchestra | Edits | Permissions | Closest analog |
|---|---|---|---|---|
| **Ask** (default) | One CLI answers. No verify, no fan-out. | No | Read-only | Cursor Ask, Aider ask |
| **Plan** | One planner writes numbered steps and stops. | No | Read-only | Claude Plan, Cline Plan |
| **Architect** | Two CLIs design in parallel; a judge unifies. | No | Read-only | Roo Architect |
| **Agent** | Auto route. Hard work can verify / escalate. | Yes | File edits accepted; shell/network may still prompt | Cursor Agent, Claude `acceptEdits`, Codex `workspace-write` |
| **Yolo** | Same routing as Agent. | Yes | Everything pre-approved. Nothing prompts. | Claude `--dangerously-skip-permissions`, Codex `--dangerously-bypass-approvals-and-sandbox`, Kimi `--yolo --auto` |
| **Review** | Review-strong CLI, always a second opinion when possible. | No | Read-only | dedicated review pass |

Fusion panels still run. Only **Agent** and **Yolo** let those workers write files.

| CLI | Ask / Plan / Architect / Review | Agent | Yolo |
|---|---|---|---|
| Claude | `--permission-mode plan` | `acceptEdits` | `bypassPermissions` + `--dangerously-skip-permissions` |
| Grok | `--permission-mode plan` | `acceptEdits` | `bypassPermissions` |
| Codex | `-s read-only` | `workspace-write` | `danger-full-access` + `--dangerously-bypass-approvals-and-sandbox` |
| Kimi | no auto | `--auto` | `--yolo --auto` |
| ZCode | `--mode plan` | `edit` | `edit` |

Use Yolo only in a repo you can revert. It will not stop to ask.

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
