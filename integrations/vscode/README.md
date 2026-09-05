# LeakGuard for VS Code

Finds Python resource leaks while you type, offers verified fixes, and stops
leaking code reaching a commit.

A resource leak is a database connection, file handle or socket that gets
opened and never closed on some code path. LeakGuard builds a control-flow
graph of each function and checks every route out of it, including exception
paths — so it catches the close that an early `return` skips past, which a
text-matching linter cannot see.

---

## Requirements

The extension is a thin client over the `leakguard` CLI, which does all the
analysis locally. Install it first:

```powershell
cd "D:\IT HACK '26"
pip install -e .
```

Verify it is on PATH:

```powershell
leakguard --version
```

If VS Code cannot find it, set the full path in
**Settings → `leakguard.path`**. Get the path with:

```powershell
(Get-Command leakguard).Source
```

---

## Install the extension

### From a packaged VSIX

```powershell
code --install-extension "$HOME\Desktop\leakguard-vscode-0.2.0.vsix"
```

Then reload VS Code: `Ctrl+Shift+P` → **Developer: Reload Window**.

### Build it yourself

```powershell
cd "D:\IT HACK '26\integrations\vscode"
npm install
npm run compile
npx @vscode/vsce package
code --install-extension .\leakguard-vscode-0.2.0.vsix --force
```

Reload the window afterwards. Repeat this whole block after any change to the
extension source.

### Run from source instead

Open `integrations/vscode` in VS Code and press **F5**. That launches an
Extension Development Host with the extension attached. Use the
**Run Extension (open demo-repo)** launch configuration so a folder is already
open — several commands are no-ops without one.

---

## Using it

Open a Python project:

```powershell
code "D:\demo-repo"
```

Click the **shield** icon in the Activity Bar, then **Scan workspace**.

Findings are grouped by file and coloured by confidence. Clicking one jumps to
the line; hovering shows where the resource was acquired, the path that leaks,
and why the close is unreachable.

### Commands

All are available from `Ctrl+Shift+P` under **LeakGuard**, and as icons in the
panel's title bar.

| Command | What it does |
|---|---|
| Scan Current File | Re-analyse the active file |
| Scan Workspace | Analyse every Python file in the folder |
| Apply Verified Fix | Rewrite one finding, then re-check that it is gone |
| Suggest a Fix with AI | For leaks the deterministic rewriter declined |
| Fix Whole Project | Bulk fix, with a confirmation naming the blast radius |
| Enable Commit Protection | Install the git pre-commit hook |
| Disable Commit Protection | Remove it |
| Commit Changes | Run `git commit` so the hook fires |

### Settings

| Setting | Default | |
|---|---|---|
| `leakguard.path` | `leakguard` | Path to the CLI |
| `leakguard.failOn` | `likely` | Confidence that blocks a commit |
| `leakguard.scanOnOpen` | `true` | |
| `leakguard.scanOnSave` | `true` | |
| `leakguard.openai.enabled` | `false` | AI suggestions, opt-in |
| `leakguard.openai.apiKey` | — | Falls back to `OPENAI_API_KEY` |
| `leakguard.openai.model` | `gpt-4o-mini` | |

---

## Fixes

Two layers, and the fast one is always tried first.

**Deterministic.** The CLI rewrites shapes it can prove safe — hoisting into a
`with` block, or wrapping in `try`/`finally`. Instant, free, and correct by
construction. This is what the wand button uses.

**AI, as a fallback.** For findings the rewriter declined, the extension can
ask OpenAI. It is **off by default**, and when enabled it sends the enclosing
function — never the whole file.

Either way the rule is the same: **the fixer proposes, the analyzer judges.**
Every candidate is re-analysed before you see it, and discarded if the leak
survives. A hallucinated patch cannot reach your editor.

---

## Commit protection

**The extension does not cancel commits — git does.**

No editor can veto a commit; git owns that decision. What the extension does is
write `.git/hooks/pre-commit` once. From then on git runs it on every commit,
from the terminal or any git client, and cancels the commit when it fails. The
extension is not running at that moment.

The hook scans **staged files only**, and follows the CLI's exit-code contract:

| Exit | Meaning | Result |
|---|---|---|
| 0 | clean | commit proceeds |
| 1 | leak at or above the threshold | **commit cancelled** |
| 2 | analyzer error (unparseable file, bad config) | warns, commit proceeds |

That last row is deliberate. A gate that blocks on syntax it cannot read gets
uninstalled the same afternoon: fail closed on findings, fail open on
ourselves.

### Trying it

Write a file that leaks on one path:

```powershell
cd D:\demo-repo
$code = @'
import sqlite3

def get_user(user_id):
    conn = sqlite3.connect("app.db")
    if user_id is None:
        return None
    conn.close()
    return user_id
'@ -replace "`r`n", "`n"
[System.IO.File]::WriteAllText("$PWD\app\users.py", $code)
```

> Use `[System.IO.File]::WriteAllText`, not `Set-Content -Encoding utf8`.
> Windows PowerShell writes a UTF-8 BOM, which Python's parser rejects.

Try to commit — git refuses:

```powershell
git add app\users.py
git commit -m "add user lookup"
```

Nothing is lost: the file is untouched and still staged. Fix it and commit
again:

```powershell
leakguard fix app\users.py --write
git add app\users.py
git commit -m "add user lookup"
git push -u origin poorva
```

> Pass `leakguard fix` a **single file**. Given a directory it rewrites every
> fixable file in it, which will silently "fix" seeded test fixtures into
> passing.

### The bypass is intentional

```powershell
git commit --no-verify -m "..."
```

Local hooks are a convenience and are meant to be skippable — sometimes you
genuinely need to commit work in progress. Enforcement belongs in CI, where the
same analyzer runs as a GitHub Action that nobody can skip.

---

## Development

```powershell
cd "D:\IT HACK '26\integrations\vscode"
npm install
npm test
```

`src/report.ts` and `src/ai.ts` hold the pure logic and are unit tested;
`src/hook.ts` is tested against real temporary git repositories.
`src/extension.ts` and `src/panel.ts` need the VS Code API and are exercised by
hand.

---

## Troubleshooting

**Panel is empty and nothing happens.** The CLI is not on PATH in the
environment VS Code inherits. Run `leakguard --version` in VS Code's terminal;
if it fails, set `leakguard.path`.

**Buttons appear to do nothing.** Several commands need an open folder. Open
one — they now report this rather than failing silently.

**"could not parse … U+FEFF".** The file has a UTF-8 BOM. Rewrite it with
`[System.IO.File]::WriteAllText`.

**The hook installed into the wrong repository.** git searches upward for a
`.git` directory, so a repository in your home folder will be found from
anywhere. The extension warns when the repository it found is not the
workspace itself — read that prompt before accepting.
