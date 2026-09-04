import * as vscode from "vscode";
import { Finding } from "./report";

/**
 * The LeakGuard sidebar.
 *
 * Files at the top level, findings beneath. Each finding carries inline
 * buttons, so applying a fix is one click rather than hunting for a lightbulb.
 */

export class FindingNode extends vscode.TreeItem {
  constructor(
    readonly finding: Finding,
    readonly uri: vscode.Uri,
  ) {
    super(`${finding.variable} - ${shortResource(finding.resource)}`, vscode.TreeItemCollapsibleState.None);

    this.description = `line ${finding.acquired_at.line} - ${finding.confidence}`;
    this.tooltip = new vscode.MarkdownString(
      [
        `**${finding.resource}** in \`${finding.function}\``,
        "",
        `- opened at line **${finding.acquired_at.line}**`,
        finding.leak_path?.length
          ? `- path: ${finding.leak_path.map((step) => step.line).join(" -> ")}`
          : "",
        `- ${finding.reason}`,
        "",
        finding.fix_available
          ? "_A verified fix is available._"
          : "_No deterministic fix - AI suggestion may still apply._",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    this.iconPath = new vscode.ThemeIcon(
      finding.confidence === "definite" ? "error" : finding.confidence === "likely" ? "warning" : "info",
      new vscode.ThemeColor(
        finding.confidence === "definite"
          ? "charts.red"
          : finding.confidence === "likely"
            ? "charts.yellow"
            : "charts.blue",
      ),
    );

    // Drives which inline buttons appear (see package.json menus).
    this.contextValue = finding.fix_available ? "leakguard.fixable" : "leakguard.aiOnly";

    this.command = {
      command: "vscode.open",
      title: "Open",
      arguments: [uri, { selection: selectionFor(finding) }],
    };
  }
}

class FileNode extends vscode.TreeItem {
  constructor(
    readonly uri: vscode.Uri,
    readonly findings: Finding[],
  ) {
    super(vscode.workspace.asRelativePath(uri), vscode.TreeItemCollapsibleState.Expanded);
    const definite = findings.filter((item) => item.confidence === "definite").length;
    this.description = definite ? `${findings.length} (${definite} definite)` : `${findings.length}`;
    this.iconPath = vscode.ThemeIcon.File;
    this.resourceUri = uri;
    this.contextValue = "leakguard.file";
  }
}

type Node = FileNode | FindingNode;

function shortResource(resource: string): string {
  return resource.split(".").pop() ?? resource;
}

function selectionFor(finding: Finding): vscode.Range {
  const line = Math.max(finding.acquired_at.line - 1, 0);
  return new vscode.Range(line, 0, line, 0);
}

export class LeakGuardPanel implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  /** file path -> findings */
  private results = new Map<string, Finding[]>();

  setFindings(uri: vscode.Uri, findings: Finding[]): void {
    const key = uri.toString();
    if (findings.length) this.results.set(key, findings);
    else this.results.delete(key);
    this.changed.fire(undefined);
  }

  replaceAll(entries: Map<string, Finding[]>): void {
    this.results = entries;
    this.changed.fire(undefined);
  }

  clear(): void {
    this.results.clear();
    this.changed.fire(undefined);
  }

  get total(): number {
    let count = 0;
    for (const findings of this.results.values()) count += findings.length;
    return count;
  }

  get definite(): number {
    let count = 0;
    for (const findings of this.results.values()) {
      count += findings.filter((item) => item.confidence === "definite").length;
    }
    return count;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return [...this.results.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, findings]) => new FileNode(vscode.Uri.parse(key), findings));
    }
    if (node instanceof FileNode) {
      const order = { definite: 0, likely: 1, possible: 2 } as const;
      return [...node.findings]
        .sort((a, b) => order[a.confidence] - order[b.confidence] || a.acquired_at.line - b.acquired_at.line)
        .map((finding) => new FindingNode(finding, node.uri));
    }
    return [];
  }
}
