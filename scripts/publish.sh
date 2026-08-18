#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/extension"
VERSION="$(node -p "require('./package.json').version")"
VSIX="maestro-of-cerebellums-${VERSION}.vsix"

if [[ ! -f "$VSIX" ]]; then
  echo "→ Building $VSIX"
  npx --yes @vscode/vsce package --no-update-package-json
fi

if [[ -z "${VSCE_PAT:-}" ]]; then
  echo "VSCE_PAT is not set. Create an Azure DevOps PAT (Marketplace: Acquire + Manage) and export it."
  echo "See PUBLISH.md"
  exit 1
fi
if [[ -z "${OVSX_PAT:-}" ]]; then
  echo "OVSX_PAT is not set. Create an Open VSX token and export it."
  echo "See PUBLISH.md"
  exit 1
fi

echo "→ VS Code Marketplace $VERSION"
npx --yes @vscode/vsce publish -p "$VSCE_PAT" --packagePath "$VSIX"

echo "→ Open VSX $VERSION (Cursor + Antigravity)"
npx --yes ovsx publish "$VSIX" -p "$OVSX_PAT"

echo
echo "VS Code:  https://marketplace.visualstudio.com/items?itemName=autosolutionsai.maestro-of-cerebellums"
echo "Open VSX: https://open-vsx.org/extension/autosolutionsai/maestro-of-cerebellums"
