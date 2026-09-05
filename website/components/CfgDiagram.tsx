export function CfgDiagram() {
  return (
    <div className="rounded-xl border border-[#1e2732] bg-[#11161d] p-6">
      <svg viewBox="0 0 320 300" className="w-full" role="img" aria-label="Control-flow graph with the leaking path highlighted in red">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#8b98a5" />
          </marker>
          <marker id="arrowRed" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#f87171" />
          </marker>
        </defs>

        {/* entry -> acquire */}
        <line x1="160" y1="20" x2="160" y2="55" stroke="#f87171" strokeWidth="2" markerEnd="url(#arrowRed)" />
        {/* acquire -> branch */}
        <line x1="160" y1="90" x2="160" y2="125" stroke="#f87171" strokeWidth="2" markerEnd="url(#arrowRed)" />
        {/* branch -> early return (red) */}
        <line x1="140" y1="150" x2="80" y2="190" stroke="#f87171" strokeWidth="2" markerEnd="url(#arrowRed)" />
        {/* branch -> close path (grey) */}
        <line x1="180" y1="150" x2="240" y2="190" stroke="#8b98a5" strokeWidth="2" markerEnd="url(#arrow)" />
        {/* close -> normal return (grey) */}
        <line x1="240" y1="225" x2="200" y2="260" stroke="#8b98a5" strokeWidth="2" markerEnd="url(#arrow)" />

        {/* entry */}
        <rect x="120" y="4" width="80" height="24" rx="6" fill="#1e2732" stroke="#2d3846" />
        <text x="160" y="20" textAnchor="middle" className="fill-white" fontSize="11">entry</text>

        {/* acquire */}
        <rect x="90" y="55" width="140" height="34" rx="6" fill="#1e2732" stroke="#2d3846" />
        <text x="160" y="76" textAnchor="middle" className="fill-white" fontSize="11" fontFamily="monospace">
          conn = connect(db)
        </text>

        {/* branch */}
        <rect x="115" y="125" width="90" height="30" rx="6" fill="#1e2732" stroke="#2d3846" />
        <text x="160" y="145" textAnchor="middle" className="fill-white" fontSize="11" fontFamily="monospace">
          if not path:
        </text>

        {/* early return - leak */}
        <rect x="20" y="190" width="120" height="34" rx="6" fill="#3f1d1d" stroke="#f87171" />
        <text x="80" y="211" textAnchor="middle" className="fill-red-300" fontSize="11" fontFamily="monospace">
          return None
        </text>

        {/* close */}
        <rect x="200" y="190" width="90" height="34" rx="6" fill="#1e2732" stroke="#2d3846" />
        <text x="245" y="211" textAnchor="middle" className="fill-white" fontSize="11" fontFamily="monospace">
          conn.close()
        </text>

        {/* normal return */}
        <rect x="165" y="260" width="90" height="30" rx="6" fill="#132a1c" stroke="#34d399" />
        <text x="210" y="280" textAnchor="middle" className="fill-emerald-300" fontSize="11" fontFamily="monospace">
          return row
        </text>

        {/* leak label */}
        <text x="15" y="240" className="fill-red-400" fontSize="10" fontWeight="600">
          leaks here
        </text>
      </svg>
    </div>
  );
}
