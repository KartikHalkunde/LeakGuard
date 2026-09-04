# LeakGuard dashboard

The default experience is now the LeakGuard Organization admin console: employee security performance, repository risk, blocked pull requests and centrally attributed incidents. Technical evidence views still expose findings, measured false-positive rate and CFGs.

Set `LEAKGUARD_CONTROL_PLANE_URL` and `LEAKGUARD_DASHBOARD_TOKEN` for live organization analytics. Without them, the UI clearly labels bundled demo organization data. The detailed findings API reads `../leakguard.json`; set `LEAKGUARD_REPORT_PATH`, `LEAKGUARD_REPOSITORY`, and `LEAKGUARD_SCAN_SCOPE` to override it.

Generate the default report before starting the dashboard:

```bash
leakguard check tests/corpus/leaky --format json --fail-on never --no-baseline -o leakguard.json
```

The dashboard uses dependency-free SVG charts, caches successful API responses for 30 seconds, deduplicates concurrent requests, and caps remote control-plane requests at 600ms. The CFG renderer is dependency-free. **Scan now** runs LeakGuard against the server-configured scope only; browser input can never select an arbitrary command or path.

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
