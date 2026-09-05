export function RatchetVisual() {
  return (
    <div className="rounded-xl border border-border bg-panel p-6">
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">Day one</p>
          <p className="mt-2 text-3xl font-bold text-fg">400</p>
          <p className="mt-1 text-xs text-muted">pre-existing findings in a legacy repo</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            After <span className="font-mono">leakguard baseline</span>
          </p>
          <p className="mt-2 text-3xl font-bold text-fg">0</p>
          <p className="mt-1 text-xs text-muted">CI is green - new leaks still fail</p>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        The count can only go down from here. Nothing was fixed - the baseline just stopped
        re-litigating debt that already existed.
      </p>
    </div>
  );
}
