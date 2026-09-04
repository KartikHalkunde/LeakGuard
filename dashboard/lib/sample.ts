import type { FpPoint, Report, TrendPoint } from "./types";

export const sampleReport: Report = {
  version: "1.0",
  meta: { repository: "LeakGuard demo", scope: "bundled fixtures", source: "demo-fixture" },
  summary: { total: 3, definite: 1, likely: 2, possible: 0, files_scanned: 12, duration_ms: 84 },
  findings: [
    {
      fingerprint: "19dd291868a43df1", confidence: "definite", resource: "sqlite3.Connection",
      file: "app/export.py", function: "export", variable: "conn",
      acquired_at: { line: 8, col: 4, snippet: "conn = sqlite3.connect(db)" },
      leak_path: [{ line: 8, note: "conn opened here" }, { line: 10, note: "early return taken" }, { line: 10, note: "function exits with conn open" }],
      close_found_at: [14], exit_kind: "return", reason: "early return reaches function exit before conn.close()", fix_available: true, severity: "high",
    },
    {
      fingerprint: "6948f1473da9b402", confidence: "likely", resource: "builtins.file",
      file: "app/loader.py", function: "load", variable: "handle",
      acquired_at: { line: 21, col: 4, snippet: "handle = open(path)" },
      leak_path: [{ line: 21, note: "handle opened here" }, { line: 23, note: "parse() may raise" }],
      close_found_at: [25], exit_kind: "exception", reason: "exception path skips handle.close()", fix_available: true, severity: "medium",
    },
    {
      fingerprint: "b191920cf253f0ca", confidence: "likely", resource: "socket.socket",
      file: "services/client.py", function: "connect_all", variable: "sock",
      acquired_at: { line: 34, col: 8, snippet: "sock = socket.socket()" },
      leak_path: [{ line: 34, note: "socket opened inside loop" }, { line: 38, note: "next iteration overwrites it" }],
      close_found_at: [40], exit_kind: "loop", reason: "resource is reacquired in a loop and closed only once", fix_available: false, severity: "high",
    },
  ],
};

export const sampleTrend: TrendPoint[] = [
  { date: "Mon", open: 18, definite: 9 }, { date: "Tue", open: 15, definite: 7 },
  { date: "Wed", open: 13, definite: 6 }, { date: "Thu", open: 9, definite: 3 },
  { date: "Fri", open: 6, definite: 1 }, { date: "Today", open: 3, definite: 1 },
];
export const sampleFp: FpPoint[] = [
  { date: "Week 1", rate: 14.2 }, { date: "Week 2", rate: 10.8 },
  { date: "Week 3", rate: 7.1 }, { date: "Week 4", rate: 3.8 },
];

export const sampleMermaid = `graph TD
    B0["L8: conn = sqlite3.connect(db)"] --> B1{"L9: if not path"}
    B1 -->|true| B2["L10: return None"]
    B1 -->|false| B3["L11-14: write and conn.close()"]
    B3 --> B4["L15: return True"]
    style B0 fill:#ff6b6b,stroke:#c92a2a,color:#111
    style B2 fill:#ff6b6b,stroke:#c92a2a,color:#111`;
