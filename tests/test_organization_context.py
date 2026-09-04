from leakguard import gitutil
from leakguard.report.json import build


def test_github_organization_context(monkeypatch):
    values = {
        "GITHUB_ACTOR": "employee-one",
        "GITHUB_EVENT_NAME": "pull_request",
        "LEAKGUARD_BASE_SHA": "base123",
        "GITHUB_SERVER_URL": "https://github.com",
        "GITHUB_REPOSITORY": "acme/payments",
        "GITHUB_RUN_ID": "42",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)

    assert gitutil.current_actor() == "employee-one"
    assert gitutil.current_event() == "pull_request"
    assert gitutil.current_base_sha() == "base123"
    assert gitutil.current_run_url() == "https://github.com/acme/payments/actions/runs/42"


def test_json_report_carries_admin_attribution():
    payload = build([], actor="employee-one", event="pull_request", base_sha="base123", run_url="https://example/run/42")
    assert payload["context"] == {
        "actor": "employee-one",
        "event": "pull_request",
        "base_sha": "base123",
        "run_url": "https://example/run/42",
    }
