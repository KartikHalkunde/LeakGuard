import { CodeBlock } from "@/components/CodeBlock";
import { DownloadBlock } from "@/components/DownloadBlock";

const REPO_URL = "https://github.com/KartikHalkunde/VH26-CodeBlooded";
const DEMO_WORKFLOW_FILE = "https://github.com/KartikHalkunde/demo-repo/blob/main/.github/workflows/leakguard.yml";
const HOOK_FILE = `${REPO_URL}/blob/main/.pre-commit-hooks.yaml`;

export default function GithubActionsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-fg">GitHub Actions</h1>
      <p className="mt-4 text-muted">
        LeakGuard ships as a reusable GitHub Action, so any repository can run it on every push
        and pull request without vendoring any of its code. The Action installs the package from
        this repo and runs the exact same <code className="text-fg">leakguard check</code> you
        can run yourself.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-fg">Add it to a workflow</h2>
        <p className="mt-2 text-sm text-muted">
          Create <code className="text-fg">.github/workflows/leakguard.yml</code> in your repo:
        </p>
        <DownloadBlock className="mt-4" filename="leakguard.yml">
{`name: LeakGuard

on:
  pull_request:
  push:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: KartikHalkunde/VH26-CodeBlooded@nikita
        with:
          paths: app
          fail-on: likely
          diff-only: false
          upload-sarif: true`}
        </DownloadBlock>
        <a
          href={DEMO_WORKFLOW_FILE}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm text-fg underline underline-offset-4 hover:text-accent"
        >
          See it running in demo-repo ↗
        </a>
      </section>

      <section className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-panel p-5">
          <h3 className="font-semibold text-fg">What it actually does</h3>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-muted">
            <li>Runs the analyzer and uploads results as SARIF, so GitHub renders leaks as inline annotations on the diff.</li>
            <li>Exits non-zero on findings at or above your <code className="text-fg">fail-on</code> threshold.</li>
            <li>Fails <em>open</em> on internal tool errors (exit 2) so a parse failure never blocks CI.</li>
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-panel p-5">
          <h3 className="font-semibold text-fg">Actually blocking a merge</h3>
          <p className="mt-2 text-sm text-muted">
            A failing check alone doesn&apos;t stop a merge - that needs a branch protection rule
            requiring it to pass:
          </p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted">
            <li>Push the workflow once so GitHub has a record of the check.</li>
            <li>Settings → Branches → Add rule for <code className="text-fg">main</code>.</li>
            <li>Enable &quot;Require status checks to pass&quot; and select the LeakGuard check.</li>
          </ol>
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-border p-6">
        <h2 className="text-xl font-semibold text-fg">Want it to catch things earlier?</h2>
        <p className="mt-2 text-sm text-muted">
          Pair the Action with the pre-commit hook so the same check runs fully offline, before a
          commit is even created:
        </p>
        <CodeBlock className="mt-4">
{`# .pre-commit-config.yaml
repos:
  - repo: ${REPO_URL}
    rev: main
    hooks:
      - id: leakguard`}
        </CodeBlock>
        <a
          href={HOOK_FILE}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm text-fg underline underline-offset-4 hover:text-accent"
        >
          See the hook definition ↗
        </a>
      </section>
    </div>
  );
}
