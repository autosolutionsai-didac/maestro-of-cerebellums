# Changelog

## 0.1.10

- Add **Yolo** work mode: every CLI permission is pre-approved (Agent still asks before shell or network)

## 0.1.9

- Work modes are now Ask, Plan, Architect, Agent, and Review — each changes routing and whether CLIs may edit

## 0.1.8

- Fusion setup uses one action: **Save** while you have unsaved edits, **Accept** to close and return to chat

## 0.1.7

- Editor title-bar icon opens a Maestro chat tab in the middle editor instead of only focusing the right sidebar

## 0.1.6

- Per-model reasoning effort names now match each provider: Claude `xhigh`/`max`, GPT-5.6 `none`/`xhigh`/`max`, Grok 4.6 `xhigh` (no `max`), Kimi K3 `low`/`high`/`max` (no `medium`)

## 0.1.5

- Add OpenRouter as a model source: save an API key, refresh the catalog, and drop OpenRouter models onto Fusion panels

## 0.1.4

- Show Maestro as a right-sidebar tab beside Chat / Claude Code / Codex / Grok

## 0.1.3

- Theme the infinity logo: white in dark mode, black in light mode

## 0.1.2

- Replace a leftover fugu-local sidecar so Fusion setup lists real models (Opus 5, Sonnet 5, Sol…) instead of providers

## 0.1.1

- Live on the right secondary sidebar (next to Chat / Grok / Claude Code / Codex)
- Infinity icon in the editor title bar
- Removed the left activity-bar entry

## 0.1.0

- First public release of Maestro of Cerebellums by AutoSolutions.ai
- One chat that routes across local Claude, Grok, OpenAI/Codex, Kimi, and Zai CLIs
- Fusion panels (Quality / Value / Speed / Cheap) with per-model thinking effort
- Native VS Code sidebar chat and activity-bar icon
