import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { install, isInstalled, repoIsOutsideWorkspace, uninstall } from "../hook";

/**
 * The hook is the only thing standing between a leak and a commit, so the
 * install/uninstall cycle is worth testing against a real repository.
 */

async function tempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "leakguard-hook-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

test("installs a hook that git will run", async () => {
  const repo = await tempRepo();
  try {
    const result = await install(repo);
    assert.equal(result.ok, true);
    assert.equal(await isInstalled(repo), true);

    const body = await fs.readFile(path.join(repo, ".git", "hooks", "pre-commit"), "utf8");
    assert.ok(body.startsWith("#!/bin/sh"), "must be executable by git");
    assert.ok(body.includes("leakguard check"), "must actually run the analyzer");
    assert.ok(body.includes("--cached"), "must scan staged files only, not the whole repo");
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("writes the configured threshold into the hook", async () => {
  const repo = await tempRepo();
  try {
    await install(repo, "definite");
    const body = await fs.readFile(path.join(repo, ".git", "hooks", "pre-commit"), "utf8");
    assert.ok(body.includes("--fail-on definite"));
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("refuses to clobber someone else's hook unless forced", async () => {
  const repo = await tempRepo();
  try {
    const target = path.join(repo, ".git", "hooks", "pre-commit");
    await fs.writeFile(target, "#!/bin/sh\necho someone-elses-hook\n");

    const refused = await install(repo);
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.reason, "exists");
    assert.ok((await fs.readFile(target, "utf8")).includes("someone-elses-hook"));

    const forced = await install(repo, "likely", true);
    assert.equal(forced.ok, true);
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("uninstall removes only our own hook", async () => {
  const repo = await tempRepo();
  try {
    await install(repo);
    assert.equal(await uninstall(repo), true);
    assert.equal(await isInstalled(repo), false);

    await fs.writeFile(path.join(repo, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 0\n");
    assert.equal(await uninstall(repo), false, "must not delete a hook we did not write");
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("reports cleanly outside a git repository", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "leakguard-nogit-"));
  // git searches upward for a .git, and a `git init` in the user's home
  // directory would otherwise make this folder look like a repository.
  const previous = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = os.tmpdir();
  try {
    const result = await install(dir);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "not-a-repo");
    assert.equal(await isInstalled(dir), false);
  } finally {
    if (previous === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("flags a repository that is not the workspace itself", async () => {
  const repo = await tempRepo();
  try {
    const nested = path.join(repo, "sub", "folder");
    await fs.mkdir(nested, { recursive: true });
    assert.equal(await repoIsOutsideWorkspace(repo), false, "repo root is its own workspace");
    assert.equal(await repoIsOutsideWorkspace(nested), true, "subfolder belongs to a repo above it");
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("does not block the commit on a tool error (exit 2)", async () => {
  const repo = await tempRepo();
  try {
    await install(repo);
    const body = await fs.readFile(path.join(repo, ".git", "hooks", "pre-commit"), "utf8");
    assert.ok(body.includes('-eq 2'), "must special-case the tool-error exit code");
    assert.ok(/exit \$code/.test(body), "must otherwise pass the analyzer's exit code through");
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});
