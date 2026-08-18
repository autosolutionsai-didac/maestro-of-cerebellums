# Publish Maestro of Cerebellums

The product is a VS Code extension (`publisher`: **autosolutionsai**, `name`: **maestro-of-cerebellums**).

You publish **once to each store**:

| Store | Who installs from it |
|---|---|
| [VS Code Marketplace](https://marketplace.visualstudio.com/) | Visual Studio Code |
| [Open VSX](https://open-vsx.org/) | Cursor and Antigravity |

Both stores take the same `.vsix`. Local VSIX files are gitignored; build them when you publish.

Current version: see `extension/package.json` (`0.1.10` as of this note).

## 0. One-time accounts

### A. Azure / VS Code Marketplace

1. Sign in at [https://marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) with the Microsoft account that should own **AutoSolutions.ai**.
2. Create a publisher whose **ID is exactly** `autosolutionsai` (must match `extension/package.json` → `publisher`). Display name can be `AutoSolutions.ai`.
3. In Azure DevOps, create a Personal Access Token:
   - [https://dev.azure.com](https://dev.azure.com) → User settings → Personal access tokens
   - Organization: **All accessible organizations**
   - Scopes: **Marketplace** → **Acquire** and **Manage** (or **Publish**)
4. Save the token somewhere you will not commit it. Export it when you publish:

```bash
export VSCE_PAT='…azure-devops-token…'
```

### B. Open VSX (Cursor + Antigravity)

1. Sign in at [https://open-vsx.org](https://open-vsx.org) (Eclipse account).
2. Create / claim the namespace **`autosolutionsai`** (must match the publisher id).
3. Create an access token in your Open VSX profile.
4. Export it:

```bash
export OVSX_PAT='…open-vsx-token…'
```

Do **not** put either token in the repo, in `package.json`, or in a screenshot.

## 1. Push the source (already done if you followed the wrap-up)

```bash
cd ~/fugu-local   # local folder name; remote is maestro-of-cerebellums
git push origin main
```

Repo: [https://github.com/autosolutionsai-didac/maestro-of-cerebellums](https://github.com/autosolutionsai-didac/maestro-of-cerebellums)

The marketplace listing can stay private on GitHub, but a **public** repo looks better on the store page. To switch:

```bash
gh repo edit autosolutionsai-didac/maestro-of-cerebellums --visibility public --accept-visibility-change-consequences
```

## 2. Build the VSIX

```bash
cd ~/fugu-local
bash scripts/package.sh
```

That writes `extension/maestro-of-cerebellums-0.1.10.vsix` (version comes from `extension/package.json`).

## 3. Publish to VS Code Marketplace

From the **extension** folder, with `VSCE_PAT` set:

```bash
cd ~/fugu-local/extension
npx --yes @vscode/vsce publish -p "$VSCE_PAT"
```

Or publish a VSIX you already built:

```bash
npx --yes @vscode/vsce publish -p "$VSCE_PAT" --packagePath maestro-of-cerebellums-0.1.10.vsix
```

First publish of publisher `autosolutionsai` can take a short review. After it is live:

[https://marketplace.visualstudio.com/items?itemName=autosolutionsai.maestro-of-cerebellums](https://marketplace.visualstudio.com/items?itemName=autosolutionsai.maestro-of-cerebellums)

Users install with:

```
ext install autosolutionsai.maestro-of-cerebellums
```

or from the Extensions view: search **Maestro of Cerebellums**.

## 4. Publish to Open VSX (Cursor + Antigravity)

```bash
cd ~/fugu-local/extension
npx --yes ovsx publish maestro-of-cerebellums-0.1.10.vsix -p "$OVSX_PAT"
```

Listing:

[https://open-vsx.org/extension/autosolutionsai/maestro-of-cerebellums](https://open-vsx.org/extension/autosolutionsai/maestro-of-cerebellums)

Cursor and Antigravity read Open VSX. After it is live, users search **Maestro of Cerebellums** in those editors’ Extensions view.

There is a helper that runs both once the tokens exist:

```bash
cd ~/fugu-local
bash scripts/publish.sh
```

## 5. Later versions

1. Bump `version` in `extension/package.json` and add a line to `extension/CHANGELOG.md`.
2. Commit, push, then run `scripts/package.sh` and `scripts/publish.sh` again.

VS Marketplace and Open VSX both reject a version that is already published. Always bump first.

## What users see after install

1. `Cmd+Shift+P` → **Developer: Reload Window**
2. Infinity icon in the editor title bar, or the **Maestro** tab on the right
3. **Maestro: Open Chat** / **Maestro: How It Works**
