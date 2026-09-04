import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { Finding, lineIndex, parseReport } from "./report";

const diagnostics = vscode.languages.createDiagnosticCollection("leakguard");
const fixable = new Map<string, Set<string>>();

const severity: Record<string, vscode.DiagnosticSeverity> = {
  definite: vscode.DiagnosticSeverity.Error,
  likely: vscode.DiagnosticSeverity.Warning,
  possible: vscode.DiagnosticSeverity.Information,
};

function executable(): string {
  return vscode.workspace.getConfiguration("leakguard").get<string>("path", "leakguard");
}

function run(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(executable(), args, { windowsHide: true }, (error, stdout, stderr) => {
      // check exits 1 when it finds a leak; valid JSON still arrives on stdout.
      if (stdout.trim()) resolve({ stdout, stderr });
      else if (error) reject(new Error(stderr.trim() || error.message));
      else resolve({ stdout, stderr });
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
    const { stdout } = await run(["check", document.fileName, "--format", "json", "--fail-on", "never", "--no-baseline"]);
    const report = parseReport(stdout);
    diagnostics.set(document.uri, report.findings.map((finding) => diagnosticFor(document, finding)));
    fixable.set(document.uri.toString(), new Set(report.findings.filter((finding) => finding.fix_available).map((finding) => finding.fingerprint)));
  } catch (error) {
    diagnostics.delete(document.uri);
    void vscode.window.showErrorMessage(`LeakGuard scan failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

class FixProvider implements vscode.CodeActionProvider {
  provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const available = fixable.get(document.uri.toString()) ?? new Set<string>();
    return context.diagnostics
      .filter((item) => item.source === "LeakGuard" && available.has(String(item.code)))
      .map((item) => {
        const action = new vscode.CodeAction("LeakGuard: apply verified resource fix", vscode.CodeActionKind.QuickFix);
        action.command = { command: "leakguard.fix", title: "Apply verified fix", arguments: [document.uri] };
        action.diagnostics = [item];
        action.isPreferred = true;
        return action;
      });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const scanCurrent = vscode.commands.registerCommand("leakguard.scan", () => {
    const document = vscode.window.activeTextEditor?.document;
    if (document) void scan(document);
  });
  const applyFix = vscode.commands.registerCommand("leakguard.fix", async (uri: vscode.Uri) => {
    const document = await vscode.workspace.openTextDocument(uri);
    await document.save();
    try {
      await run(["fix", document.fileName, "--write"]);
      const fresh = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(fresh, { preview: false });
      await vscode.commands.executeCommand("workbench.action.files.revert");
      await scan(fresh);
      void vscode.window.showInformationMessage("LeakGuard applied and verified the fix.");
    } catch (error) {
      void vscode.window.showErrorMessage(`LeakGuard fix failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  context.subscriptions.push(
    diagnostics,
    scanCurrent,
    applyFix,
    vscode.languages.registerCodeActionsProvider("python", new FixProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (vscode.workspace.getConfiguration("leakguard").get("scanOnSave", true)) void scan(document);
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (vscode.workspace.getConfiguration("leakguard").get("scanOnOpen", true)) void scan(document);
    }),
  );
  if (vscode.workspace.getConfiguration("leakguard").get("scanOnOpen", true)) {
    vscode.workspace.textDocuments.forEach((document) => void scan(document));
  }
}

export function deactivate(): void {
  diagnostics.clear();
}
