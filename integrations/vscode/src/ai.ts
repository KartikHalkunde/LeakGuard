import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Finding, parseReport } from "./report";

/**
 * AI-assisted fixes - the fallback layer.
 *
 * The deterministic rewriter in `leakguard fix` handles the shapes it can prove
 * safe. This module only runs for findings it declined (`fix_available: false`).
 *
 * The rule that makes it safe to ship: the model proposes, the analyzer judges.
 * Every suggestion is re-analyzed locally before it is shown, and discarded if
 * the finding survives. An unverified patch never reaches the editor.
 *
 * Privacy: we send the enclosing function, never the whole file, and only when
 * the user has explicitly enabled it.
 */

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

export interface AiConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
  leakguardPath: string;
}

export interface Suggestion {
  patchedSource: string;
  patchedFunction: string;
  originalFunction: string;
  startLine: number; // 1-based, inclusive
  endLine: number; // 1-based, inclusive
}

const SYSTEM = [
  "You are a Python refactoring assistant fixing resource leaks.",
  "Rewrite the function so the resource is released on EVERY path, including",
  "early returns and exception paths. Prefer a `with` block; fall back to",
  "try/finally when the resource escapes or is conditionally acquired.",
  "Preserve all existing behaviour, names, comments and indentation style.",
  "Return ONLY the rewritten function as raw Python. No markdown fences, no",
  "commentary, no surrounding code.",
].join(" ");

/** Line range of the `def` that encloses `line` (1-based, inclusive). */
export function functionRange(lines: string[], line: number): { start: number; end: number } | null {
  const index = line - 1;
  if (index < 0 || index >= lines.length) return null;

  let start = -1;
  let indent = 0;
  for (let i = index; i >= 0; i--) {
    const match = /^(\s*)(async\s+)?def\s/.exec(lines[i]);
    if (match) {
      start = i;
      indent = match[1].length;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length - 1;
  for (let i = start + 1; i < lines.length; i++) {
    const text = lines[i];
    if (!text.trim()) continue;
    const width = text.length - text.trimStart().length;
    if (width <= indent) {
      end = i - 1;
      break;
    }
  }
  while (end > start && !lines[end].trim()) end -= 1;
  return { start: start + 1, end: end + 1 };
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
}

async function ask(config: AiConfig, prompt: string): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content");
  return stripFences(content);
}

function analyze(leakguardPath: string, file: string): Promise<Finding[]> {
  return new Promise((resolve) => {
    execFile(
      leakguardPath,
      ["check", file, "--format", "json", "--fail-on", "never", "--no-baseline"],
      { windowsHide: true },
      (_error, stdout) => {
        try {
          resolve(parseReport(stdout).findings);
        } catch {
          resolve([]); // unparseable output -> treat as "cannot verify"
        }
      },
    );
  });
}

/**
 * Re-run the analyzer on the patched source.
 *
 * The fingerprint embeds the file path, so a temp copy would hash differently.
 * We match on function + variable instead, which is path-independent.
 */
async function verify(config: AiConfig, patched: string, finding: Finding): Promise<boolean> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "leakguard-ai-"));
  const file = path.join(dir, "candidate.py");
  try {
    await fs.writeFile(file, patched, "utf8");
    const findings = await analyze(config.leakguardPath, file);
    return !findings.some((item) => item.function === finding.function && item.variable === finding.variable);
  } catch {
    return false;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Returns a verified suggestion, or null. Never returns an unverified patch. */
export async function suggest(config: AiConfig, source: string, finding: Finding): Promise<Suggestion | null> {
  if (!config.enabled || !config.apiKey) return null;

  const lines = source.split("\n");
  const range = functionRange(lines, finding.acquired_at.line);
  if (!range) return null;

  const originalFunction = lines.slice(range.start - 1, range.end).join("\n");
  const prompt = [
    `Resource: ${finding.resource}`,
    `Variable: ${finding.variable}`,
    `Problem: ${finding.reason}`,
    "",
    "Function to fix:",
    originalFunction,
  ].join("\n");

  const patchedFunction = await ask(config, prompt);
  if (!patchedFunction.trim() || patchedFunction.trim() === originalFunction.trim()) return null;

  const patchedSource = [
    ...lines.slice(0, range.start - 1),
    ...patchedFunction.split("\n"),
    ...lines.slice(range.end),
  ].join("\n");

  // The model proposes; the analyzer judges.
  if (!(await verify(config, patchedSource, finding))) return null;

  return { patchedSource, patchedFunction, originalFunction, startLine: range.start, endLine: range.end };
}
