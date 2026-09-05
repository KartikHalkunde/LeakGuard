const REPO_URL = "https://github.com/KartikHalkunde/VH26-CodeBlooded";
const VSCODE_DIR = `${REPO_URL}/tree/main/integrations/vscode`;

export default function ExtensionsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-mono text-sm text-accent">editor integration</p>
      <h1 className="mt-2 text-3xl font-bold text-fg">Extensions</h1>
      <p className="mt-4 text-muted">
        LeakGuard&apos;s editor extension is a thin client - on save, it shells out to the same{" "}
        <code className="text-fg">leakguard check --format json</code> command you&apos;d run
        yourself, then renders the results as inline diagnostics with a one-click quick-fix. No
        separate language server, no separate logic to keep in sync.
      </p>

      {/* VS Code */}
      <section className="mt-12 rounded-xl border border-border bg-panel p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-fg">VS Code</h2>
          <span className="badge border border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400">
            Not yet on the Marketplace
          </span>
        </div>
        <p className="mt-3 text-sm text-muted">
          The extension isn&apos;t published to the VS Code Marketplace yet - install it locally
          from source:
        </p>
        <div className="code-block mt-4">
{`git clone ${REPO_URL}
cd VH26-CodeBlooded/integrations/vscode
npm install

# Option A - run it in a dev host straight away
code . # then press F5 inside VS Code

# Option B - package it and install the .vsix yourself
npx vsce package
code --install-extension leakguard-*.vsix`}
        </div>
        <a
          href={VSCODE_DIR}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm text-fg underline underline-offset-4 hover:text-accent"
        >
          Browse the extension source ↗
        </a>
      </section>

      {/* Cursor */}
      <section className="mt-6 rounded-xl border border-border bg-panel p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-fg">Cursor</h2>
          <span className="badge border border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400">
            Works today
          </span>
        </div>
        <p className="mt-3 text-sm text-muted">
          Cursor is a VS Code fork and loads standard <code className="text-fg">.vsix</code>{" "}
          packages, so there&apos;s no separate Cursor build to maintain. Package the extension as
          above, then install the same file:
        </p>
        <div className="code-block mt-4">
{`cursor --install-extension leakguard-*.vsix`}
        </div>
      </section>

      {/* Other editors */}
      <section className="mt-6 rounded-xl border border-border p-6">
        <h2 className="text-xl font-semibold text-fg">Any other editor</h2>
        <p className="mt-3 text-sm text-muted">
          Since the extension is just a thin wrapper around the CLI, any editor that can run a
          shell command on save and read JSON can build an equivalent integration in a similar
          amount of code. The contract is one command:
        </p>
        <div className="code-block mt-4">
{`leakguard check <file> --format json`}
        </div>
      </section>
    </div>
  );
}
