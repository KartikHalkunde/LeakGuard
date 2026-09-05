# LeakGuard Organization

LeakGuard Organization has two pieces: a required GitHub check for employees
and an admin dashboard/control-plane service. Employees install nothing.

## What happens on every pull request

1. An employee opens or updates a PR targeting `main`.
2. `.github/workflows/organization-gate.yml` runs on GitHub-hosted runners.
3. LeakGuard scans only changed Python files using the merge base. It does not
   repeatedly scan unchanged files. If history is unavailable it fails safely
   to a full scan.
4. Definite or likely leaks make `Changed-code leak policy` fail. The Action
   still uploads SARIF and sends a signed report to the control plane.
5. The control plane attributes findings to GitHub actor, repository, branch,
   commit, PR and run URL, and persists them in SQLite.
6. A later clean scan on the same employee/repository/branch marks the previous
   finding fixed. The dashboard polls every 15 seconds.

## GitHub configuration

Set repository or organization Actions secret `LEAKGUARD_SECRET` to the same
signing secret used by the dashboard. The checked-in workflow already targets
`https://vh26-codeblooded.onrender.com/api/control-plane`.

In **Settings → Rules → Rulesets**, target the default branch and require:

- pull requests before merging;
- `Changed-code leak policy` status check;
- the branch to be up to date;
- blocked direct pushes and force pushes;
- no ordinary-member bypass.

The workflow creates the failing check. The ruleset is what prevents merge.

## Control plane and GitHub inventory

The dashboard owns its backend and DB. `GITHUB_TOKEN` plus
`LEAKGUARD_GITHUB_ORG` allow it to discover repositories, collaborators and
recent workflow runs. A GitHub organization webhook provides immediate
workflow updates; the API sync is the reconciliation/fallback path.

Required server variables and exact endpoints are documented in
`dashboard/README.md`. A local dashboard cannot receive GitHub cloud callbacks;
the control-plane URL must be a public HTTPS deployment with persistent disk.

Only Python resource analysis exists today. GitHub workflow status ingestion
works for every repository/language, but Go/Java leak analysis has not been
implemented and is not claimed.
