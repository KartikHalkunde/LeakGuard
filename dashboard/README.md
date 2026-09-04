# LeakGuard dashboard

Four Next.js views show leak debt, findings with witness paths, measured false-positive rate, and Mermaid CFGs. Without configuration the app uses realistic fixtures. Set `NEXT_PUBLIC_CONTROL_PLANE_URL` to use the n8n `GET /findings`, `/trend`, and `/fp-rate` endpoints; failed requests fall back to fixtures.

```bash
npm install
npm test
npm run build
npm run dev
```

Open http://localhost:3000. The findings view copies the verified local fix command; source mutation remains in the VS Code extension/CLI so a browser cannot overwrite arbitrary developer files.
