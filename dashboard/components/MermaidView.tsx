"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { sampleMermaid } from "@/lib/sample";

type Node = { id: string; label: string; danger: boolean };

function parseGraph(source: string): { nodes: Node[]; error: string } {
  const dangerIds = new Set(
    [...source.matchAll(/^\s*style\s+(\w+)\s+.*(?:ff6b6b|ff5c67|c92a2a)/gim)].map((match) => match[1]),
  );
  const labels = new Map<string, string>();
  const order: string[] = [];
  const nodePattern = /(\w+)\s*(?:\["([^"]+)"\]|\{"([^"]+)"\})/g;

  for (const match of source.matchAll(nodePattern)) {
    if (!labels.has(match[1])) order.push(match[1]);
    labels.set(match[1], match[2] ?? match[3] ?? match[1]);
  }
  if (!order.length) return { nodes: [], error: "No CFG nodes found. Paste LeakGuard Mermaid graph output." };
  return { nodes: order.map((id) => ({ id, label: labels.get(id) ?? id, danger: dangerIds.has(id) })), error: "" };
}

export function MermaidView() {
  const [source, setSource] = useState(sampleMermaid);
  const deferredSource = useDeferredValue(source);
  const graph = useMemo(() => parseGraph(deferredSource), [deferredSource]);
  const updating = source !== deferredSource;

  return <div className="cfg-grid">
    <div className="editor">
      <div className="panel-heading"><div><span className="panel-kicker">Input</span><strong>Leak witness</strong></div><span className="live-pill">Live</span></div>
      <label htmlFor="mermaid">Paste output from <code>leakguard explain FILE:FUNCTION</code></label>
      <textarea id="mermaid" value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false}/>
    </div>
    <div className="diagram">
      <div className="panel-heading diagram-heading"><div><span className="panel-kicker">Execution path</span><strong>Control-flow graph</strong></div><span className="legend"><i/> leaking path</span></div>
      {updating && <span className="rendering">Updating...</span>}
      {graph.error ? <p className="error">{graph.error}</p> : <div className="flow-map">
        {graph.nodes.map((node, index) => <div className="flow-step" key={node.id}>
          <div className={`flow-node ${node.danger ? "leaking" : "safe"}`}><small>{node.id}</small><strong>{node.label}</strong>{node.danger && <span>Resource remains open</span>}</div>
          {index < graph.nodes.length - 1 && <div className="flow-arrow"><span>↓</span></div>}
        </div>)}
      </div>}
    </div>
  </div>;
}
