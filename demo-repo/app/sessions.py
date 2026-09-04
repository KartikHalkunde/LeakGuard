import requests


def create_session(skip_request: bool):
    session = requests.Session()
    if skip_request:
        return None
    session.close()
    return True
