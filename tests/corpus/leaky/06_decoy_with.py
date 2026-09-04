# EXPECT: LEAK var=conn line=4 confidence=definite
import sqlite3
def export(path, db):
    conn = sqlite3.connect(db)
    with open(path) as fh:
        return fh.read()
