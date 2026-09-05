export function TerminalPreview() {
  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="overflow-hidden rounded-xl border border-[#1e2732] bg-[#0d1117] shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 border-b border-[#1e2732] bg-[#161b22] px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
          <span className="ml-3 font-mono text-xs text-[#8b98a5]">leakguard check app/</span>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-[#c9d1d9]">
          <span>{"LEAK "}</span>
          <span className="font-semibold text-red-400">(definite)</span>
          <span>{" - sqlite3.Connection - app/export.py:export\n\n"}</span>
          <span>{"  opened   line 2    conn = sqlite3.connect(db)\n"}</span>
          <span>{"  path     2 -> 3 -> 4 (return)\n"}</span>
          <span>{"  reason   reaches function exit with conn still open\n"}</span>
          <span>{"  close    line 8    unreachable from line 4\n\n"}</span>
          <span className="font-semibold text-red-400">1 definite</span>
          <span>{", "}</span>
          <span className="text-amber-400">2 likely</span>
          <span>{" - 47 files - 412ms"}</span>
        </pre>
      </div>
      <div className="absolute -bottom-5 -right-5 hidden w-56 rounded-lg border border-border bg-panel p-3 shadow-xl sm:block">
        <p className="font-mono text-[11px] text-muted">exit code</p>
        <p className="mt-1 font-mono text-2xl font-bold text-red-400">1</p>
        <p className="mt-1 text-[11px] text-muted">build blocked - a definite leak was found</p>
      </div>
    </div>
  );
}
