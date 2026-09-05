"""Intentional LeakGuard demo fixture: this file must fail the CI gate."""


def read_live_demo(path: str, enabled: bool) -> str:
    handle = open(path, encoding="utf-8")
    if not enabled:
        return "disabled"
    content = handle.read()
    handle.close()
    return content
