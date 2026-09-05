const STEPS = [
  { label: "Editor", detail: "squiggle on save", enforce: "none" },
  { label: "Pre-commit", detail: "offline, <1s", enforce: "blocks the commit" },
  { label: "CI", detail: "on push / PR", enforce: "blocks the merge" },
  { label: "Team baseline", detail: "after CI reports", enforce: "tracks & triages" },
];

export function EnforcementVisual() {
  return (
    <div className="rounded-xl border border-border bg-panel p-6">
      <ol className="relative space-y-6 border-l border-border pl-6">
        {STEPS.map((step) => (
          <li key={step.label} className="relative">
            <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-accent bg-ink" />
            <p className="font-semibold text-fg">{step.label}</p>
            <p className="font-mono text-xs text-muted">{step.detail}</p>
            <p className="mt-1 text-sm text-muted">{step.enforce}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
