const CONFIDENCE = [
  {
    label: "DEFINITE",
    color:
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
    ci: "Fails the build",
  },
  {
    label: "LIKELY",
    color:
      "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
    ci: "Warns",
  },
  {
    label: "POSSIBLE",
    color:
      "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/30",
    ci: "Informational",
  },
  {
    label: "SAFE",
    color:
      "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30",
    ci: "Silent",
  },
];

export function ConfidenceVisual() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {CONFIDENCE.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-panel p-4">
          <span className={`badge border ${c.color}`}>{c.label}</span>
          <p className="mt-2 font-mono text-[11px] text-muted">{c.ci}</p>
        </div>
      ))}
    </div>
  );
}
