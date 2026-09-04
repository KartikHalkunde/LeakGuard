import { FindingsTable } from "@/components/FindingsTable";
export default function FindingsPage() { return <><span className="eyebrow">Working view</span><h1 className="page-title">Findings with proof.</h1><p className="subtitle">Definite leaks are marked in red. Expand any row to inspect the exact counterexample and copy its analyzer-verified fix command.</p><FindingsTable/></>; }
