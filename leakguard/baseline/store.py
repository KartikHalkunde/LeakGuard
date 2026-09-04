"""The baseline ratchet - P3 owns this file.

The adoption problem: turn any analyzer on in an existing repo and you get
hundreds of findings, so the team turns it off. This is the exact failure the
problem statement warns about ("gets disabled by week two").

The fix is a ratchet:

    leakguard baseline      # snapshot every existing finding as accepted
    leakguard check         # fails ONLY on findings not in the baseline

Day one is green. The count can only go down.

Remote-first with local fallback: if the n8n control plane holds a shared,
team-wide baseline we use it, but an unreachable control plane must never
break CI - we fall through to the committed local file.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from leakguard.core.finding import Finding

SCHEMA_VERSION = 1
FETCH_TIMEOUT = 5  # seconds - never hang CI on the optional layer


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Baseline:
    def __init__(self, path: Path, remote_url: str | None = None, repo: str | None = None):
        self.path = Path(path)
        self.remote = remote_url
        self.repo = repo
        self.suppressed: dict[str, dict] = {}
        self.source = "none"

    # -- loading ---------------------------------------------------------
    def load(self) -> "Baseline":
        if self.remote and self._load_remote():
            self.source = "remote"
            return self
        if self._load_local():
            self.source = "local"
        return self

    def _load_remote(self) -> bool:
        url = f"{self.remote.rstrip('/')}/baseline"
        if self.repo:
            url += f"?repo={urllib.parse.quote(self.repo)}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        token = os.environ.get("LEAKGUARD_API_KEY")
        if token:
            req.add_header("X-API-Key", token)
        try:
            with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, ValueError, TimeoutError):
            return False  # control plane down - fall through to local
        entries = data.get("suppressed", [])
        self.suppressed = {e["fingerprint"]: e for e in entries}
        return True

    def _load_local(self) -> bool:
        if not self.path.exists():
            return False
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return False
        self.suppressed = {e["fingerprint"]: e for e in data.get("suppressed", [])}
        return True

    # -- use -------------------------------------------------------------
    def filter(self, findings: list[Finding]) -> list[Finding]:
        """Drop anything already accepted. This is the ratchet."""
        if not self.suppressed:
            return findings
        return [f for f in findings if f.fingerprint not in self.suppressed]

    def snapshot(self, findings: list[Finding], reason: str = "baseline snapshot") -> int:
        """Accept every current finding, so CI starts green."""
        payload = {
            "version": SCHEMA_VERSION,
            "created": _now(),
            "suppressed": [
                {
                    "fingerprint": f.fingerprint,
                    "reason": reason,
                    "file": f.file,
                    "function": f.function,
                    "resource": f.resource,
                    "confidence": f.confidence.value,
                    "at": _now(),
                }
                for f in findings
            ],
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return len(findings)

    def __len__(self) -> int:
        return len(self.suppressed)
