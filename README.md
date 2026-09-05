# LeakGuard

AST-based Python resource-leak detection for developers and organizations.

## Two products, one analyzer

**LeakGuard Developer** catches leaks before code leaves a machine:

- CLI with text/JSON/SARIF output and verified fixes;
- strict pre-commit hook;
- VS Code diagnostics and quick fixes.

**LeakGuard Organization** enforces and monitors repositories:

- incremental GitHub Action on pull requests;
- required check that blocks `main` while definite/likely leaks remain;
- signed report ingestion and GitHub webhook/API synchronization;
- admin dashboard for repositories, employees, workflow failures, incidents,
  reasons, accuracy and progress;
- persistent embedded SQLite control plane. No n8n dependency.

The Python analyzer is the single source of truth. It walks Python ASTs, builds
control flow, tracks acquisition/release state across returns and exception
paths, and emits a stable finding format consumed by every interface.

## Quick start

```bash
python -m venv .venv
source .venv/Scripts/activate       # Git Bash on Windows
python -m pip install -e ".[dev]"
pytest -q
leakguard check demo-repo/app --no-baseline --fail-on likely
```

The last command intentionally exits `1`: `demo-repo` contains seeded leaks.

Install the pre-commit gate from inside a consumer repository:

```bash
pre-commit install
pre-commit run --all-files
```

Run the organization service:

```bash
cd dashboard
npm install
npm test
npm run dev
```

See [Organization setup](docs/ORGANIZATION.md) and
[dashboard configuration](dashboard/README.md) for live GitHub + DB setup.

## Trigger and enforcement model

- VS Code: Python file open/save and manual `LeakGuard: Scan current file`.
- Pre-commit: automatically during `git commit`; staged Python files only.
- Organization Action: PR opened, synchronized, reopened or made ready against
  `main`; changed Python files only.
- Control plane: Action reports arrive immediately; GitHub webhooks update
  workflow state; API reconciliation runs at most once per configured TTL.
- Dashboard: DB snapshot polls every 15 seconds and supports manual refresh.

The Action failing is not enough by itself. Configure a GitHub ruleset that
requires `Changed-code leak policy` and disallows direct pushes/bypass on the
protected branch.

## Repository structure

```text
leakguard/                 Python analyzer, reports, baselines and fixes
tests/                     Unit/integration tests and labelled corpus
demo-repo/                 Deliberately leaky consumer repository
integrations/vscode/       VS Code extension
dashboard/                 Admin UI + API + SQLite control plane
.github/workflows/         CI, organization gate and intentional demo gate
action.yml                 Installable composite GitHub Action
.pre-commit-hooks.yaml     Installable pre-commit integration
docs/                      Architecture, benchmark, limitations and demos
```

## Evidence and scope

The labelled corpus currently reports precision `1.00`, recall `1.00` and F1
`1.00` on its 25 cases. These are corpus results, not a universal guarantee.
Known limits are documented in `docs/04-limitations.md`.

Resource analysis currently supports Python only. Repository inventory and
generic GitHub workflow-failure monitoring work regardless of repository
language, but Go/Java leak analysis is not implemented.
