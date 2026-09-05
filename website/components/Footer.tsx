import Link from "next/link";
import { ShieldIcon } from "./ShieldIcon";

const REPO_URL = "https://github.com/KartikHalkunde/VH26-CodeBlooded";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Home", href: "/" },
      { label: "Extensions", href: "/extensions" },
      { label: "GitHub Actions", href: "/github-actions" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Source code", href: REPO_URL, external: true },
      { label: "README", href: `${REPO_URL}#readme`, external: true },
      { label: "action.yml", href: `${REPO_URL}/blob/main/action.yml`, external: true },
    ],
  },
  {
    title: "Editors",
    links: [
      { label: "VS Code", href: "/extensions" },
      { label: "Cursor", href: "/extensions" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2 font-semibold text-fg">
              <ShieldIcon className="h-5 w-5 text-accent" />
              LeakGuard
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted">
              Static resource-leak detection for Python, enforced across four points in your
              workflow.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold text-fg">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) =>
                  link.external ? (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted hover:text-fg"
                      >
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <Link href={link.href} className="text-sm text-muted hover:text-fg">
                        {link.label}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-10 border-t border-border pt-6 text-xs text-muted">
          Open source on{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-fg">
            GitHub
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
