import Link from "next/link";

const REPO_URL = "https://github.com/KartikHalkunde/VH26-CodeBlooded";

const CARDS = [
  {
    icon: "▶",
    title: "Install the CLI",
    body: "Run leakguard check against your own project in under a minute, fully offline.",
    href: REPO_URL,
    external: true,
    cta: "View on GitHub",
  },
  {
    icon: "⚙",
    title: "Add the GitHub Action",
    body: "Scan every push and pull request, and block a merge on a confirmed leak.",
    href: "/github-actions",
    external: false,
    cta: "Set it up",
  },
  {
    icon: "◆",
    title: "Get the extension",
    body: "Catch leaks as you type, in VS Code or Cursor, with a one-click fix.",
    href: "/extensions",
    external: false,
    cta: "Install it",
  },
];

export function GetStartedCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {CARDS.map((card) => (
        <div key={card.title} className="flex flex-col rounded-xl border border-border bg-panel p-6">
          <span className="text-xl text-accent">{card.icon}</span>
          <h3 className="mt-3 font-semibold text-fg">{card.title}</h3>
          <p className="mt-1.5 flex-1 text-sm text-muted">{card.body}</p>
          {card.external ? (
            <a
              href={card.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-md border border-border px-3 py-1.5 text-center text-sm text-fg transition-colors hover:border-accent hover:text-accent"
            >
              {card.cta} ↗
            </a>
          ) : (
            <Link
              href={card.href}
              className="mt-4 inline-block rounded-md border border-border px-3 py-1.5 text-center text-sm text-fg transition-colors hover:border-accent hover:text-accent"
            >
              {card.cta}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
