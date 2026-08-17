#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/extension"
npx --yes @vscode/vsce package --no-update-package-json
echo "VSIX is in $ROOT/extension/"
echo
echo "Install locally:"
echo "  code --install-extension $ROOT/extension/maestro-of-cerebellums-*.vsix --force"
echo "  cursor --install-extension $ROOT/extension/maestro-of-cerebellums-*.vsix --force"
echo
echo "Publish (needs tokens you create):"
echo "  VS Code Marketplace:  npx @vscode/vsce publish -p \$VSCE_PAT"
echo "  Open VSX (Cursor + Antigravity): npx ovsx publish *.vsix -p \$OVSX_PAT"
