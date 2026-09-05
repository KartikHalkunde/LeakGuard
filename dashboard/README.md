# LeakGuard Organization dashboard

This Next.js service is both the admin UI and the LeakGuard control plane. It
does not require n8n. It stores signed analyzer reports, repositories, people,
repository membership and GitHub workflow outcomes in an embedded SQLite DB.

## Configure

Use Node.js 22 or newer (`node:sqlite` is used). Create `dashboard/.env.local`:

```dotenv
LEAKGUARD_SECRET=replace-with-a-long-random-value
LEAKGUARD_GITHUB_ORG=your-github-organization
# Recommended for private repos and higher API limits. Public repos work without it.
GITHUB_TOKEN=github-token-with-metadata-read-actions-read-members-read
GITHUB_WEBHOOK_SECRET=another-long-random-value
LEAKGUARD_ADMIN_TOKEN=token-for-scheduled-sync-calls
LEAKGUARD_DASHBOARD_USER=admin
LEAKGUARD_DASHBOARD_PASSWORD=replace-with-a-strong-password
# Optional; defaults to dashboard/.leakguard-data/control-plane.sqlite
LEAKGUARD_DB_PATH=C:/persistent/leakguard/control-plane.sqlite
LEAKGUARD_GITHUB_SYNC_SECONDS=60
LEAKGUARD_GITHUB_REPO_LIMIT=1000
# Optional safety caps; each defaults to 1000 so paginated syncs do not stop
# after GitHub's first 100 members or first 20 workflow runs.
LEAKGUARD_GITHUB_MEMBER_LIMIT=1000
LEAKGUARD_GITHUB_BRANCH_LIMIT=1000
LEAKGUARD_GITHUB_WORKFLOW_LIMIT=1000
```

Run it:

```bash
npm install
npm test
npm run dev
```

Open `http://localhost:3000`. The UI polls its DB every 15 seconds. **Refresh
GitHub** forces a GitHub API refresh. For production, deploy on a Node host with
a persistent volume; do not put the SQLite file on an ephemeral serverless
filesystem.

Member sync merges collaborators, contributors, and the heads of every visible
branch. This includes people working only on unmerged feature branches. The
repository detail view also lists every stored GitHub Actions run in the chosen
date range, with a link back to the original run.

## Live inputs

- `POST /api/control-plane/ingest`: HMAC-authenticated LeakGuard Action report.
- `POST /api/control-plane/github/webhook`: HMAC-authenticated GitHub webhook.
- `POST /api/control-plane/github/sync`: bearer-authenticated scheduled sync.
- `GET /api/organization`: paginated, filtered DB snapshot consumed by the UI.

Set the same `LEAKGUARD_SECRET` in GitHub Actions and the dashboard service.
Configure an organization
webhook pointing to
`https://your-dashboard.example/api/control-plane/github/webhook`, select
workflow-run and repository/member events, and use `GITHUB_WEBHOOK_SECRET`.

This repository's organization workflow already points at
`https://vh26-codeblooded.onrender.com/api/control-plane`. `render.yaml`
defines the Node 22 service, health check, persistent SQLite disk and all
required secret placeholders. Render and GitHub still require the secret
values to be entered in their authenticated settings; they must never be
committed.

The technical evidence pages (`/findings`, `/cfg`, `/fp-rate`) remain local
analyzer demonstrations. Browser requests cannot choose arbitrary commands or
filesystem paths.
