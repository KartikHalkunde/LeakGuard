import json


def export_customer(source: str, destination: str) -> int:
    source_handle = open(source, encoding="utf-8")
    payload = json.load(source_handle)
    if not payload:
        return 0
    source_handle.close()

    output_handle = open(destination, "w", encoding="utf-8")
    json.dump(payload, output_handle)
    output_handle.close()
    return len(payload)


def load_manifest(path: str):
    handle = open(path, encoding="utf-8")
    payload = json.load(handle)
    handle.close()
    return payload
