# LeakGuard Organization

LeakGuard Organization is a GitHub-native product. Employees install nothing:
they push normally to personal branches and receive actionable findings in the
pull-request check. Organization admins use the dashboard for portfolio-wide
visibility and governance.

## Enforcement lifecycle

1. An employee opens or updates a pull request targeting `main`.
2. `LeakGuard Organization Gate` always creates the required status check, so
   documentation-only PRs cannot get stuck waiting for a skipped workflow.
3. The analyzer diffs the PR merge-base and scans only added, copied, modified
   and renamed Python files. Unchanged, deleted and non-Python files are skipped;
   a PR with no Python changes quickly reports a green zero-file scan.
4. Definite and likely leaks fail the required check. Possible findings remain
   review signals.
5. The report carries repository, employee, branch, commit, base SHA, PR,
   GitHub event and workflow URL to the control plane. Source code is never
   uploaded.
6. New commits trigger a fresh diff scan. The PR cannot merge until the latest
   required check passes.

If Git history is unavailable, LeakGuard falls back to a full scan instead of
silently passing an unscanned change.

## Required GitHub rule

In repository **Settings → Rules → Rulesets**, create a rule targeting the
default branch with:

- Require a pull request before merging.
- Require status checks to pass.
- Add `Changed-code leak policy` as a required check.
- Require the branch to be up to date.
- Block force pushes and direct pushes.
- Disable bypass for ordinary organization members.

The workflow produces the check; the GitHub ruleset is what makes a failed
check technically prevent the merge.

## Admin dashboard

The default dashboard route is the organization overview. It includes employee
security ranking, repositories by exposure, blocked pull requests, remediation
speed and attributed incidents. `/employees`, `/repositories` and `/incidents`
provide focused views. Technical evidence remains under `/findings`, `/cfg`
and `/fp-rate`.

Set `LEAKGUARD_CONTROL_PLANE_URL` and `LEAKGUARD_DASHBOARD_TOKEN` on the
dashboard server to replace bundled demo organization data with the live
`/organization/overview` response.

Set these GitHub repository secrets for central ingestion:

- `LEAKGUARD_CONTROL_PLANE_URL`
- `LEAKGUARD_SECRET`
