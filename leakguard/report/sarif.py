"""SARIF 2.1.0 output - P3 owns this file.

GitHub renders SARIF as inline annotations on the PR diff. Two details make
this worth more than a plain annotation:

  * `codeFlows` renders the witness path as a clickable step-through of the
    leaking path, right in the PR review UI.
  * `partialFingerprints` lets GitHub track a finding across commits even
    when lines move, so a re-formatted file does not resurface every finding
    as new.
"""

from __future__ import annotations

import json as _json

from leakguard.core.finding import Finding

SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json"
INFO_URI = "https://github.com/leakguard/leakguard"

#: SARIF has three reportable levels; ours map cleanly.
LEVEL = {
    "definite": "error",
    "likely": "warning",
    "possible": "note",
    "safe": "none",
}


def _rule_id(resource: str) -> str:
    return "leakguard/" + resource.replace(".", "-")


def _rule(resource: str, level: str) -> dict:
    return {
        "id": _rule_id(resource),
        "name": "UnclosedResource",
        "shortDescription": {"text": f"Unclosed {resource}"},
        "fullDescription": {
            "text": (
                "A resource is acquired but not released on every path that "
                "reaches a function exit, including early returns and "
                "exception paths."
            )
        },
        "defaultConfiguration": {"level": level},
        "helpUri": f"{INFO_URI}#readme",
        "properties": {"tags": ["resource-leak", "reliability", "security"]},
    }


def _location(uri: str, line: int, col: int = 1) -> dict:
    return {
        "physicalLocation": {
            "artifactLocation": {"uri": uri, "uriBaseId": "%SRCROOT%"},
            "region": {"startLine": max(line, 1), "startColumn": max(col, 1)},
        }
    }


def _code_flows(f: Finding) -> list[dict]:
    """The witness path, rendered by GitHub as a step-through."""
    if not f.leak_path:
        return []
    return [
        {
            "threadFlows": [
                {
                    "locations": [
                        {
                            "location": {
                                **_location(f.file, step.line),
                                "message": {"text": step.note},
                            },
                            "nestingLevel": 0,
                            "executionOrder": i,
                        }
                        for i, step in enumerate(f.leak_path)
                    ]
                }
            ]
        }
    ]


def build(findings: list[Finding], version: str = "0.1.0") -> dict:
    rules: dict[str, dict] = {}
    results: list[dict] = []

    for f in findings:
        level = LEVEL.get(f.confidence.value, "warning")
        rid = _rule_id(f.resource)
        rules.setdefault(rid, _rule(f.resource, level))

        result: dict = {
            "ruleId": rid,
            "ruleIndex": list(rules).index(rid),
            "level": level,
            "message": {"text": f.reason or f"Unclosed {f.resource}"},
            "locations": [_location(f.file, f.acquired_line, f.acquired_col)],
            "partialFingerprints": {"leakguardFingerprint/v1": f.fingerprint},
            "properties": {
                "confidence": f.confidence.value,
                "resource": f.resource,
                "variable": f.variable,
                "exitKind": f.exit_kind,
                "fixAvailable": f.fix_available,
            },
        }

        flows = _code_flows(f)
        if flows:
            result["codeFlows"] = flows

        results.append(result)

    return {
        "$schema": SARIF_SCHEMA,
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "LeakGuard",
                        "version": version,
                        "semanticVersion": version,
                        "informationUri": INFO_URI,
                        "rules": list(rules.values()),
                    }
                },
                "results": results,
                "columnKind": "unicodeCodePoints",
            }
        ],
    }


def render(findings: list[Finding], version: str = "0.1.0") -> str:
    return _json.dumps(build(findings, version), indent=2)
