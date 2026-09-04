import contextlib
import sqlite3


def read_template(path: str) -> str:
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def lookup(db_path: str, item_id: int):
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute("select * from items where id = ?", (item_id,)).fetchone()
    finally:
        conn.close()


def read_optional(path: str) -> str:
    with contextlib.closing(open(path, encoding="utf-8")) as handle:
        return handle.read()


def open_for_caller(path: str):
    return open(path, encoding="utf-8")
