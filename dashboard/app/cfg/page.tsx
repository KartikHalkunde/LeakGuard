import { MermaidView } from "@/components/MermaidView";
export default function CfgPage() { return <><span className="eyebrow">Counterexample</span><h1 className="page-title">See the path that leaks.</h1><p className="subtitle">Generate a graph with <code>leakguard explain FILE:FUNCTION</code>. Red blocks are the acquisition-to-exit witness path.</p><MermaidView/></>; }
