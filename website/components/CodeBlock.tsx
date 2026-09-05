"use client";

import { useState } from "react";

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CodeBlock({ children, className = "" }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) - button just won't confirm.
    }
  }

  return (
    <div className={`code-block relative ${className}`}>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-[#1e2732] bg-[#161b22] px-2 py-1 text-xs text-[#8b98a5] transition-colors hover:text-[#c9d1d9]"
      >
        {copied ? (
          <>
            <CheckIcon />
            <span className="text-emerald-400">Copied</span>
          </>
        ) : (
          <CopyIcon />
        )}
      </button>
      {children}
    </div>
  );
}
