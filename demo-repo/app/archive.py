import zipfile


def build_archive(destination: str, enabled: bool) -> bool:
    archive = zipfile.ZipFile(destination, "w")
    if not enabled:
        return False
    archive.close()
    return True
