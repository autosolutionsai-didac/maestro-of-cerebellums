#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/extension"
PUBLISHER_DIR="autosolutionsai.maestro-of-cerebellums-0.1.10"

echo "→ Checking local CLIs"
if ! node "$EXT/sidecar/server.js" doctor; then
  echo "No coding CLIs detected. Install at least one of: claude, grok, codex, kimi, zcode"
  exit 1
fi

install_unpacked() {
  local dest_root="$1"
  mkdir -p "$dest_root"
  local dest="$dest_root/$PUBLISHER_DIR"
  ln -sfn "$EXT" "$dest"
  echo "  linked $dest"
}

echo "→ Installing unpacked extension"
for dest_root in "$HOME/.cursor/extensions" "$HOME/.vscode/extensions"; do
  if [[ -d "$dest_root" || ( "$dest_root" == "$HOME/.cursor/extensions" && -d "$HOME/.cursor" ) ]]; then
    rm -f "$dest_root/fugu-local.fugu-local-0.1.0"
    install_unpacked "$dest_root"
    # Keep the previous publisher folder so editors do not look for a missing path.
    ln -sfn "$EXT" "$dest_root/maestro.maestro-of-cerebellums-0.1.0"
  fi
done

CONTINUE_CFG="$HOME/.continue/config.yaml"
if [[ -f "$CONTINUE_CFG" ]]; then
  echo "→ Checking Continue config"
  python3 - <<'PY'
from pathlib import Path
p = Path.home() / ".continue" / "config.yaml"
text = p.read_text()
if "maestro-auto" in text:
    print("  already present")
    raise SystemExit(0)
block = """  - name: Maestro Auto
    provider: openai
    model: maestro-auto
    apiBase: http://127.0.0.1:8788/v1
    apiKey: shoal-local
    roles:
      - chat
      - edit
      - apply
"""
if "mcpServers:" in text:
    text = text.replace("mcpServers:", block + "mcpServers:", 1)
else:
    text = text.rstrip() + "\n" + block
p.write_text(text)
print("  added Maestro Auto")
PY
fi

if command -v cursor >/dev/null 2>&1; then
  echo "→ Cursor is installed. Reload the window to load Maestro of Cerebellums."
  echo "   Command Palette → Developer: Reload Window"
  echo "   Then: Maestro: Open Chat"
else
  echo "→ Extension files are in place. Open Cursor or VS Code and reload."
fi

echo "Done."
