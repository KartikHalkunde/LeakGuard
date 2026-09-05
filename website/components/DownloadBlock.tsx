"use client";

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function DownloadBlock({
  children,
  filename,
  className = "",
}: {
  children: string;
  filename: string;
  className?: string;
}) {
  function download() {
    const blob = new Blob([children], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`code-block relative ${className}`}>
      <button
        type="button"
        onClick={download}
        aria-label={`Download ${filename}`}
        title={`Download ${filename}`}
        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-[#1e2732] bg-[#161b22] px-2 py-1 text-xs text-[#8b98a5] transition-colors hover:text-[#c9d1d9]"
      >
        <DownloadIcon />
      </button>
      {children}
    </div>
  );
}
