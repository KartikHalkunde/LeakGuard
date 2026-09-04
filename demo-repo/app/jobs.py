import subprocess


def render_report(command: list[str], dry_run: bool):
    process = subprocess.Popen(command)
    if dry_run:
        return None
    result = process.wait()
    process.terminate()
    return result


def read_two_configs(primary: str, fallback: str):
    handle = open(primary, encoding="utf-8")
    if not handle.read(1):
        handle = open(fallback, encoding="utf-8")
    data = handle.read()
    handle.close()
    return data
