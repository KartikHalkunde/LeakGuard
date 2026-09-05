"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldIcon } from "./ShieldIcon";
import { ThemeToggle } from "./ThemeToggle";

const REPO_URL = "https://github.com/KartikHalkunde/VH26-CodeBlooded";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/extensions", label: "Extensions" },
  { href: "/github-actions", label: "GitHub Actions" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-fg">
          <ShieldIcon className="h-5 w-5 text-accent" />
          LeakGuard
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-sm text-muted hover:text-fg sm:inline"
          >
            GitHub ↗
          </a>
          <Link
            href="/#get-started"
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Get Started
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
