import type { ReactNode } from "react";

export function FeatureSection({
  eyebrow,
  title,
  body,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  body: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="border-t border-border py-16">
      <div
        className={`grid items-center gap-10 sm:grid-cols-2 ${reverse ? "sm:[&>*:first-child]:order-2" : ""}`}
      >
        <div>
          <p className="font-mono text-sm text-accent">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold text-fg sm:text-3xl">{title}</h2>
          <div className="mt-4 space-y-3 text-muted">{body}</div>
        </div>
        <div>{visual}</div>
      </div>
    </section>
  );
}
