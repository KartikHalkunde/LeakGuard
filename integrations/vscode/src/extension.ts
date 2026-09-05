import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { AiConfig, suggest } from "./ai";
import * as hook from "./hook";
import { FindingNode, LeakGuardPanel } from "./panel";
import { Finding, lineIndex, parseReport } from "./report";

const diagnostics = vscode.languages.createDiagnosticCollection("leakguard");
const panel = new LeakGuardPanel();
const findingsByUri = new Map<string, Finding[]>();
let status: vscode.StatusBarItem;
let scanErrorShown = false;

const severity: Record<string, vscode.DiagnosticSeverity> = {
  definite: vscode.DiagnosticSeverity.Error,
  likely: vscode.DiagnosticSeverity.Warning,
  possible: vscode.DiagnosticSeverity.Information,
};

// --------------------------------------------------------------------------
// configuration
// --------------------------------------------------------------------------

function settings() {
  return vscode.workspace.getConfiguration("leakguard");
}

function executable(): string {
  return settings().get<string>("path", "leakguard");
}

function aiConfig(): AiConfig {
  return {
    enabled: settings().get<boolean>("openai.enabled", false),
    apiKey: settings().get<string>("openai.apiKey", "") || process.env.OPENAI_API_KEY || "",
    model: settings().get<string>("openai.model", "gpt-4o-mini"),
    leakguardPath: executable(),
  };
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

// --------------------------------------------------------------------------
// running the analyzer
// --------------------------------------------------------------------------

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable(), args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      // `check` exits 1 when it finds a leak; valid JSON still arrives on stdout.
      if (stdout.trim()) resolve(stdout);
      else if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout);
    });
  });
}

function diagnosticFor(document: vscode.TextDocument, finding: Finding): vscode.Diagnostic {
  const index = lineIndex(finding.acquired_at.line, document.lineCount);
  const line = document.lineAt(index);
  const start = Math.min(Math.max(finding.acquired_at.col, 0), line.text.length);
  const range = new vscode.Range(index, start, index, Math.max(start + 1, line.text.length));

  const diagnostic = new vscode.Diagnostic(
    range,
    `${finding.resource} leak: ${finding.reason}`,
    severity[finding.confidence] ?? vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.source = "LeakGuard";
  diagnostic.code = finding.fingerprint;
  diagnostic.relatedInformation = (finding.leak_path ?? []).map((step) => {
    const pathLine = lineIndex(step.line, document.lineCount);
    return new vscode.DiagnosticRelatedInformation(
      new vscode.Location(document.uri, document.lineAt(pathLine).range),
      step.note,
    );
  });
  return diagnostic;
}

export async function scan(document: vscode.TextDocument): Promise<void> {
  if (document.languageId !== "python" || document.isUntitled) return;
  try {
    const stdout = await run([
      "check",
      document.fileName,
      "--format",
      "json",
      "--fail-on",
      "never",
      "--no-baseline",
    ]);
    const { findings } = parseReport(stdout);
    diagnostics.set(document.uri, findings.map((finding) => diagnosticFor(document, finding)));
    findingsByUri.set(document.uri.toString(), findings);
    panel.setFindings(document.uri, findings);
    refreshStatus();
  } catch (error) {
    diagnostics.delete(document.uri);
    findingsByUri.delete(document.uri.toString());
    panel.setFindings(document.uri, []);
    // Report once per session. Scan-on-open across a large workspace would
    // otherwise stack one dialog per file when `leakguard` is not on PATH.
    if (!scanErrorShown) {
      scanErrorShown = true;
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window
        .showErrorMessage(`LeakGuard could not run: ${message}`, "Set path")
        .then((choice) => {
          if (choice) void vscode.commands.executeCommand("workbench.action.openSettings", "leakguard.path");
        });
    }
  }
}

async function scanWorkspace(options: { quiet?: boolean } = {}): Promise<void> {
  const root = workspaceRoot();
  if (!root) {
    if (!options.quiet) {
      void vscode.window.showWarningMessage("LeakGuard: open a folder first - there is nothing to scan.");
    }
    return;
  }
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: "LeakGuard: scanning workspace" },
    async () => {
      const stdout = await run(["check", root, "--format", "json", "--fail-on", "never", "--no-baseline"]);
      const { findings } = parseReport(stdout);
      const grouped = new Map<string, Finding[]>();
      for (const finding of findings) {
        const uri = vscode.Uri.file(finding.file).toString();
        grouped.set(uri, [...(grouped.get(uri) ?? []), finding]);
      }
      findingsByUri.clear();
      for (const [key, value] of grouped) findingsByUri.set(key, value);
      panel.replaceAll(grouped);
      refreshStatus();
      if (!options.quiet) {
        void vscode.window.showInformationMessage(
          `LeakGuard: ${findings.length} finding(s) across the workspace.`,
        );
      }
    },
  );
}

// --------------------------------------------------------------------------
// fixing
// --------------------------------------------------------------------------

/** Deterministic fix - the rewriter proves the shape before it writes. */
async function applyVerifiedFix(uri: vscode.Uri, quiet = false): Promise<boolean> {
  const document = await vscode.workspace.openTextDocument(uri);
  await document.save();
  try {
    await run(["fix", document.fileName, "--write"]);
    const fresh = await vscode.workspace.openTextDocument(uri);
    await scan(fresh);
    return true;
  } catch (error) {
    if (!quiet) {
      void vscode.window.showErrorMessage(
        `LeakGuard fix failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return false;
  }
}

/**
 * Fix every leak the rewriter can prove, across the whole workspace.
 *
 * Confirms first and names the exact count, because this rewrites source in
 * place - running the equivalent CLI command against a directory by accident
 * is how a seeded test corpus gets silently "fixed" into passing.
 */
async function fixWholeProject(): Promise<void> {
  const root = workspaceRoot();
  if (!root) {
    void vscode.window.showWarningMessage("LeakGuard: open a folder first - there is nothing to fix.");
    return;
  }

  await scanWorkspace({ quiet: true });

  const countFixable = () =>
    [...findingsByUri.values()].flat().filter((finding) => finding.fix_available).length;

  const before = panel.total;
  const fixable = countFixable();
  if (!fixable) {
    void vscode.window.showInformationMessage(
      before
        ? `LeakGuard: none of the ${before} remaining finding(s) can be rewritten automatically. They need the AI suggestion or a manual change.`
        : "LeakGuard: no leaks found.",
    );
    return;
  }

  const choice = await vscode.window.showWarningMessage(
    `Rewrite ${fixable} leak(s)?`,
    {
      modal: true,
      detail:
        "Every rewrite is re-analysed and kept only if the leak is provably gone. " +
        "Commit or stash first if you want an easy way back.",
    },
    "Fix all",
  );
  if (choice !== "Fix all") return;

  // Fixing one leak can expose another in the same file, and can make a shape
  // the rewriter previously declined become rewritable. Keep going until a
  // round stops making progress rather than settling for the first pass.
  const MAX_ROUNDS = 5;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "LeakGuard: applying verified fixes",
      cancellable: false,
    },
    async (progress) => {
      for (let round = 1; round <= MAX_ROUNDS; round += 1) {
        const targets = [...findingsByUri.entries()]
          .filter(([, findings]) => findings.some((finding) => finding.fix_available))
          .map(([key]) => vscode.Uri.parse(key));
        if (!targets.length) return;

        progress.report({ message: `round ${round} - ${targets.length} file(s)` });
        const remainingBefore = countFixable();
        for (const uri of targets) await applyVerifiedFix(uri, true);
        await scanWorkspace({ quiet: true });
        if (countFixable() >= remainingBefore) return;
      }
    },
  );

  await scanWorkspace({ quiet: true });
  const left = panel.total;
  void vscode.window.showInformationMessage(
    left === 0
      ? `LeakGuard: fixed all ${before} leak(s). None remain.`
      : `LeakGuard: fixed ${before - left} of ${before} leak(s). ${left} remain that cannot be ` +
        "rewritten automatically - they need the AI suggestion or a manual change.",
  );
}


/**
 * AI fallback - only for findings the deterministic rewriter declined.
 *
 * `suggest()` re-runs the analyzer on the candidate and returns null if the
 * finding survives, so nothing unverified ever reaches this point. The user
 * still sees a diff and confirms before anything is written.
 */
async function applyAiFix(uri: vscode.Uri, finding: Finding): Promise<void> {
  const config = aiConfig();
  if (!config.enabled) {
    const choice = await vscode.window.showInformationMessage(
      "AI suggestions are off. Enable them in settings?",
      "Open settings",
    );
    if (choice) void vscode.commands.executeCommand("workbench.action.openSettings", "leakguard.openai");
    return;
  }
  if (!config.apiKey) {
    void vscode.window.showErrorMessage("No OpenAI key. Set leakguard.openai.apiKey or OPENAI_API_KEY.");
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const suggestion = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "LeakGuard: asking the model, then verifying locally" },
    () => suggest(config, document.getText(), finding),
  );

  if (!suggestion) {
    void vscode.window.showWarningMessage(
      "No verified AI fix. The suggestion was discarded because the analyzer still reported the leak.",
    );
    return;
  }

  const preview = await vscode.workspace.openTextDocument({
    language: "python",
    content: [
      `# LeakGuard - AI suggestion for ${finding.variable} in ${finding.function}()`,
      `# Verified: re-running the analyzer on this version reports no leak.`,
      "",
      suggestion.patchedFunction,
    ].join("\n"),
  });
  await vscode.window.showTextDocument(preview, { preview: true, viewColumn: vscode.ViewColumn.Beside });

  const choice = await vscode.window.showInformationMessage(
    `Apply this verified fix to ${finding.function}()?`,
    { modal: false },
    "Apply",
    "Discard",
  );
  if (choice !== "Apply") return;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, new vscode.Range(0, 0, document.lineCount, 0), suggestion.patchedSource);
  await vscode.workspace.applyEdit(edit);
  await (await vscode.workspace.openTextDocument(uri)).save();
  await scan(await vscode.workspace.openTextDocument(uri));
  void vscode.window.showInformationMessage("LeakGuard applied the verified AI fix.");
}

class FixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const findings = findingsByUri.get(document.uri.toString()) ?? [];
    const actions: vscode.CodeAction[] = [];

    for (const item of context.diagnostics.filter((d) => d.source === "LeakGuard")) {
      const finding = findings.find((f) => f.fingerprint === String(item.code));
      if (!finding) continue;

      if (finding.fix_available) {
        const action = new vscode.CodeAction("LeakGuard: apply verified fix", vscode.CodeActionKind.QuickFix);
        action.command = { command: "leakguard.fix", title: "Apply", arguments: [document.uri] };
        action.diagnostics = [item];
        action.isPreferred = true;
        actions.push(action);
      } else if (aiConfig().enabled) {
        const action = new vscode.CodeAction("LeakGuard: suggest a fix with AI", vscode.CodeActionKind.QuickFix);
        action.command = { command: "leakguard.aiFix", title: "AI fix", arguments: [document.uri, finding] };
        action.diagnostics = [item];
        actions.push(action);
      }
    }
    return actions;
  }
}

// --------------------------------------------------------------------------
// commit protection
// --------------------------------------------------------------------------

function refreshStatus(): void {
  if (!status) return;
  const total = panel.total;
  status.text = total ? `$(shield) LeakGuard: ${total}` : "$(shield) LeakGuard";
  status.tooltip = total
    ? `${panel.definite} definite, ${total} total. Click to open the panel.`
    : "No leaks found. Click to open the panel.";
  status.backgroundColor = panel.definite
    ? new vscode.ThemeColor("statusBarItem.errorBackground")
    : undefined;
  status.show();
}

async function enableProtection(): Promise<void> {
  const root = workspaceRoot();
  if (!root) {
    void vscode.window.showWarningMessage("LeakGuard: open a folder first - commit protection needs a repository.");
    return;
  }

  // git walks up until it finds a .git, so a repository in the user's home
  // directory would silently receive the hook. Confirm before writing.
  if (await hook.repoIsOutsideWorkspace(root)) {
    const actual = await hook.repoRoot(root);
    const choice = await vscode.window.showWarningMessage(
      `This folder belongs to the repository at ${actual}, not to itself. Install the hook there?`,
      "Install there",
      "Cancel",
    );
    if (choice !== "Install there") return;
  }

  const failOn = settings().get<string>("failOn", "likely");
  let result = await hook.install(root, failOn);

  if (!result.ok && result.reason === "exists") {
    const choice = await vscode.window.showWarningMessage(
      "A pre-commit hook already exists. Replace it with LeakGuard's?",
      "Replace",
      "Cancel",
    );
    if (choice !== "Replace") return;
    result = await hook.install(root, failOn, true);
  }

  if (result.ok) {
    void vscode.window.showInformationMessage(
      "Commit protection enabled. Git will now cancel any commit that introduces a leak.",
    );
  } else if (result.reason === "not-a-repo") {
    void vscode.window.showErrorMessage("Not a git repository - nothing to protect.");
  } else {
    void vscode.window.showErrorMessage(`Could not install the hook: ${result.detail ?? "unknown error"}`);
  }
  void updateProtectionContext();
}

async function updateProtectionContext(): Promise<void> {
  const root = workspaceRoot();
  const installed = root ? await hook.isInstalled(root) : false;
  await vscode.commands.executeCommand("setContext", "leakguard.protected", installed);
}

/**
 * Commit through real git, so the hook we installed actually runs.
 *
 * The extension does not - and cannot - cancel the commit itself. It shells out
 * to `git commit`; git runs `.git/hooks/pre-commit`, and git decides.
 */
async function commitNow(): Promise<void> {
  const root = workspaceRoot();
  if (!root) {
    void vscode.window.showWarningMessage("LeakGuard: open a folder first - there is no repository to commit to.");
    return;
  }

  const staged = await hook.stagedPythonFiles(root);
  if (!(await hook.isInstalled(root))) {
    const choice = await vscode.window.showWarningMessage(
      "Commit protection is not enabled - this commit will not be checked.",
      "Enable first",
      "Commit anyway",
    );
    if (choice === "Enable first") {
      await enableProtection();
    } else if (choice !== "Commit anyway") {
      return;
    }
  }

  const message = await vscode.window.showInputBox({
    prompt: staged.length ? `Commit message (${staged.length} Python file(s) staged)` : "Commit message",
    placeHolder: "fix: close database connection on the early-return path",
  });
  if (!message) return;

  const result = await hook.commit(root, message);
  if (result.ok) {
    void vscode.window.showInformationMessage("Commit created - LeakGuard found nothing to block.");
  } else {
    const choice = await vscode.window.showErrorMessage(
      "Git cancelled the commit: LeakGuard found a leak in the staged files.",
      "Show details",
    );
    if (choice) {
      const doc = await vscode.workspace.openTextDocument({ content: result.output, language: "log" });
      await vscode.window.showTextDocument(doc, { preview: true });
    }
  }
}

// --------------------------------------------------------------------------
// activation
// --------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  try {
    activateInner(context);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `LeakGuard failed to start: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function activateInner(context: vscode.ExtensionContext): void {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "leakguard.focusPanel";
  refreshStatus();

  const tree = vscode.window.createTreeView("leakguard.findings", { treeDataProvider: panel });

  context.subscriptions.push(
    diagnostics,
    status,
    tree,

    vscode.commands.registerCommand("leakguard.scan", () => {
      const document = vscode.window.activeTextEditor?.document;
      if (document) void scan(document);
    }),
    vscode.commands.registerCommand("leakguard.scanWorkspace", () => void scanWorkspace()),
    vscode.commands.registerCommand("leakguard.focusPanel", () =>
      vscode.commands.executeCommand("leakguard.findings.focus"),
    ),

    vscode.commands.registerCommand("leakguard.fix", async (target: vscode.Uri | FindingNode) => {
      const uri = target instanceof vscode.Uri ? target : target.uri;
      if (await applyVerifiedFix(uri)) {
        void vscode.window.showInformationMessage("LeakGuard applied and verified the fix.");
      }
    }),
    vscode.commands.registerCommand("leakguard.aiFix", async (target: vscode.Uri | FindingNode, finding?: Finding) => {
      if (target instanceof vscode.Uri && finding) return applyAiFix(target, finding);
      if (target instanceof FindingNode) return applyAiFix(target.uri, target.finding);
    }),
    vscode.commands.registerCommand("leakguard.fixAll", () => void fixWholeProject()),

    vscode.commands.registerCommand("leakguard.enableProtection", () => void enableProtection()),
    vscode.commands.registerCommand("leakguard.disableProtection", async () => {
      const root = workspaceRoot();
      if (root && (await hook.uninstall(root))) {
        void vscode.window.showInformationMessage("Commit protection disabled.");
      }
      void updateProtectionContext();
    }),
    vscode.commands.registerCommand("leakguard.commit", () => void commitNow()),

    vscode.languages.registerCodeActionsProvider("python", new FixProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (settings().get("scanOnSave", true)) void scan(document);
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (settings().get("scanOnOpen", true)) void scan(document);
    }),
  );

  void updateProtectionContext();
  if (settings().get("scanOnOpen", true)) {
    vscode.workspace.textDocuments.forEach((document) => void scan(document));
  }

  // Scan the whole workspace on startup so the panel is useful the moment it
  // opens. Without this a reload leaves an empty tree and the only way to see
  // anything is to find the scan button first.
  if (workspaceRoot() && settings().get("scanOnStartup", true)) {
    void scanWorkspace({ quiet: true });
  }
}

export function deactivate(): void {
  diagnostics.clear();
  panel.clear();
}
