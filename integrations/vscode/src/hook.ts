import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Commit protection.
 *
 * The extension cannot cancel a commit - no editor can, because git owns that
 * decision. What it can do is write `.git/hooks/pre-commit` once. From then on
 * git runs that file on every commit, from any client, and cancels the commit
 * when it exits non-zero. The extension is not running at that moment.
 */

const MARKER = "# installed by the LeakGuard VS Code extension";

function hookBody(failOn: string): string {
  // Staged files only: a hook that scans the whole repo gets --no-verify'd
  // within a week.
  //
  // Exit 2 means the analyzer itself failed - an unparseable file, a bad
  // config. That must not cancel the commit: fail closed on findings, fail
  // open on ourselves. A gate that blocks on syntax it cannot read gets
  // uninstalled the same afternoon.
  return `#!/bin/sh
${MARKER}
files=$(git diff --cached --name-only --diff-filter=ACM | grep '\\.py$')
[ -z "$files" ] && exit 0
leakguard check $files --fail-on ${failOn}
code=$?
if [ "$code" -eq 2 ]; then
  echo "leakguard: tool error - commit allowed" >&2
  exit 0
fi
exit $code
`;
}

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, windowsHide: true }, (error, stdout, stderr) =>
      error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout.trim()),
    );
  });
}

/** Top level of the repository containing `workspace`, or null. */
export async function repoRoot(workspace: string): Promise<string | null> {
  try {
    return await git(["rev-parse", "--show-toplevel"], workspace);
  } catch {
    return null;
  }
}

/**
 * True when the repository we found is somewhere surprising.
 *
 * git walks up until it finds a `.git`, so a `git init` in the user's home
 * directory makes every folder look like a repository. Installing a hook into
 * that repo would be silently wrong, so callers confirm first.
 */
export async function repoIsOutsideWorkspace(workspace: string): Promise<boolean> {
  const root = await repoRoot(workspace);
  if (!root) return false;
  const normalise = (value: string) => path.resolve(value).replace(/[\\/]+$/, "").toLowerCase();
  return normalise(root) !== normalise(workspace);
}

/** Absolute path to this workspace's hooks directory, or null if not a repo. */
export async function hooksDir(workspace: string): Promise<string | null> {
  try {
    const gitDir = await git(["rev-parse", "--absolute-git-dir"], workspace);
    return path.join(gitDir, "hooks");
  } catch {
    return null;
  }
}

export async function isInstalled(workspace: string): Promise<boolean> {
  const dir = await hooksDir(workspace);
  if (!dir) return false;
  try {
    return (await fs.readFile(path.join(dir, "pre-commit"), "utf8")).includes("leakguard");
  } catch {
    return false;
  }
}

export type InstallResult =
  | { ok: true; path: string }
  | { ok: false; reason: "not-a-repo" | "exists" | "error"; detail?: string };

export async function install(workspace: string, failOn = "likely", force = false): Promise<InstallResult> {
  const dir = await hooksDir(workspace);
  if (!dir) return { ok: false, reason: "not-a-repo" };
  const target = path.join(dir, "pre-commit");

  try {
    const existing = await fs.readFile(target, "utf8");
    // Never clobber someone else's hook without being told to.
    if (!existing.includes(MARKER) && !force) return { ok: false, reason: "exists" };
  } catch {
    /* no hook yet - the normal case */
  }

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(target, hookBody(failOn), { mode: 0o755 });
    await fs.chmod(target, 0o755).catch(() => undefined); // no-op on Windows
    return { ok: true, path: target };
  } catch (error) {
    return { ok: false, reason: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function uninstall(workspace: string): Promise<boolean> {
  const dir = await hooksDir(workspace);
  if (!dir) return false;
  const target = path.join(dir, "pre-commit");
  try {
    if (!(await fs.readFile(target, "utf8")).includes(MARKER)) return false;
    await fs.unlink(target);
    return true;
  } catch {
    return false;
  }
}

export async function stagedPythonFiles(workspace: string): Promise<string[]> {
  try {
    const out = await git(["diff", "--cached", "--name-only", "--diff-filter=ACM"], workspace);
    return out.split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".py"));
  } catch {
    return [];
  }
}

/** Run the real `git commit`, so the hook we installed actually fires. */
export async function commit(workspace: string, message: string): Promise<{ ok: boolean; output: string }> {
  try {
    const out = await git(["commit", "-m", message], workspace);
    return { ok: true, output: out };
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  }
}
