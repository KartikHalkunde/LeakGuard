import socket


def notify(host: str, port: int, message: bytes) -> bool:
    client = socket.socket()
    client.connect((host, port))
    if not message:
        return False
    client.sendall(message)
    client.close()
    return True


def connect_first(hosts: list[str], port: int):
    client = None
    for host in hosts:
        client = socket.socket()
        if client.connect_ex((host, port)) == 0:
            return client
    if client:
        client.close()
    return None
