import { TerminalPreview } from "@/components/TerminalPreview";
import { FeatureSection } from "@/components/FeatureSection";
import { CfgDiagram } from "@/components/CfgDiagram";
import { ConfidenceVisual } from "@/components/ConfidenceVisual";
import { EnforcementVisual } from "@/components/EnforcementVisual";
import { RatchetVisual } from "@/components/RatchetVisual";
import { GetStartedCards } from "@/components/GetStartedCards";

const REPO_URL = "https://github.com/KartikHalkunde/VH26-CodeBlooded";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-6">
      {/* Hero */}
      <section className="pb-16 pt-20 text-center">
        <span className="badge border border-border bg-panel text-muted">
          static analysis for Python
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-fg sm:text-5xl">
          Find the resource leak a text search{" "}
          <span className="text-accent">can&apos;t</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          LeakGuard traces every path through your Python code - every branch, every loop, every
          &quot;what if this raises&quot; - to prove whether a database connection, file handle, or
          socket actually gets closed.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            View on GitHub
          </a>
          <a
            href="/#get-started"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-accent"
          >
            Get started ↗
          </a>
        </div>
      </section>

      {/* Big proof visual */}
      <section className="pb-20">
        <TerminalPreview />
      </section>

      {/* Alternating feature sections */}
      <FeatureSection
        eyebrow="how it works"
        title="Real control-flow analysis, not a text search"
        body={
          <>
            <p>
              A tool that just checks &quot;does <code className="text-fg">.close()</code>{" "}
              appear somewhere in this function&quot; gets this wrong constantly. An early return
              can skip the close entirely, and whether that&apos;s reachable is a control-flow
              question, not a text one.
            </p>
            <p>
              LeakGuard builds a real control-flow graph - every branch, every loop, every
              exception path - and runs a fixpoint dataflow analysis over it to trace exactly
              which routes leave a resource open.
            </p>
          </>
        }
        visual={<CfgDiagram />}
      />

      <FeatureSection
        eyebrow="confidence scoring"
        title="Findings you can actually trust"
        reverse
        body={
          <p>
            LeakGuard would rather stay quiet than be wrong. Every finding is labelled with how
            certain the tool actually is - and only the certain ones (<span className="text-fg">DEFINITE</span>)
            can block your build by default. Everything else warns instead of crying wolf.
          </p>
        }
        visual={<ConfidenceVisual />}
      />

      <FeatureSection
        eyebrow="enforcement"
        title="Enforced at every point in your workflow"
        body={
          <p>
            The same analysis runs in your editor, at commit time, in CI, and across your whole
            team - each interceptor calling the exact same underlying check, so nothing is ever
            reimplemented or out of sync.
          </p>
        }
        visual={<EnforcementVisual />}
      />

      <FeatureSection
        eyebrow="adoption"
        title="Gets quieter over time, not louder"
        reverse
        body={
          <p>
            Turn on any analyzer in an existing codebase and you get hundreds of findings on day
            one - so teams turn it off. The baseline ratchet snapshots every existing finding as
            accepted, so day one is green, and the count can only go down from there.
          </p>
        }
        visual={<RatchetVisual />}
      />

      {/* Get started cards */}
      <section id="get-started" className="scroll-mt-20 border-t border-border py-16 pb-24">
        <h2 className="text-center text-2xl font-bold text-fg sm:text-3xl">Get started</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted">
          Everything runs fully offline. Source code never leaves your machine unless you opt into
          the team-scale control plane, and even then only file, line, resource type, and
          fingerprint are ever sent - never your code.
        </p>
        <div className="mt-10">
          <GetStartedCards />
        </div>
      </section>
    </div>
  );
}
