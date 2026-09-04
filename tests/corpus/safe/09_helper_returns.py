# EXPECT: CLEAN
import sqlite3
def get_conn(db):
    return sqlite3.connect(db)
def work(db):
    c = get_conn(db)
    c.close()
    return True
