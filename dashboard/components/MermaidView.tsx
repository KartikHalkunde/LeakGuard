"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";
import { sampleMermaid } from "@/lib/sample";

export function MermaidView() {
  const [source, setSource] = useState(sampleMermaid);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const id = `cfg-${useId().replaceAll(":", "")}`;
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
    void mermaid.render(id, source).then((result) => { setSvg(result.svg); setError(""); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [id, source]);
  return <div className="cfg-grid"><div className="editor"><label htmlFor="mermaid">Paste output from <code>leakguard explain FILE:FUNCTION</code></label><textarea id="mermaid" value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false}/></div><div className="diagram">{error ? <p className="error">Invalid diagram: {error}</p> : <div dangerouslySetInnerHTML={{ __html: svg }}/>}</div></div>;
}
