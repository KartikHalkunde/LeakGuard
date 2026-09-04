# LeakGuard dashboard

Four Next.js views show leak debt, findings with witness paths, measured false-positive rate, and CFGs. The bundled API reads `../leakguard.json` and visibly labels the repository and source. Set `LEAKGUARD_REPORT_PATH`, `LEAKGUARD_REPOSITORY`, and `LEAKGUARD_SCAN_SCOPE` to override them, or set `NEXT_PUBLIC_CONTROL_PLANE_URL` to use n8n. Missing reports visibly fall back to demo fixtures.

Generate the default report before starting the dashboard:

```bash
leakguard check tests/corpus/leaky --format json --fail-on never --no-baseline -o leakguard.json
```

The dashboard uses dependency-free SVG charts, caches successful API responses for 30 seconds, deduplicates concurrent requests, times out slow endpoints after 1.5 seconds, and loads Mermaid only on the CFG route.

```bash
npm install
npm test
npm run build
npm run dev
```

The generated `.next` output is cleaned automatically before compilation. A
second dev server or production build is blocked while port 3000 is occupied,
so concurrent processes cannot corrupt generated chunks.

Open http://localhost:3000. The findings view copies the verified local fix command; source mutation remains in the VS Code extension/CLI so a browser cannot overwrite arbitrary developer files.
