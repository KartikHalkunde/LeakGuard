# EXPECT: CLEAN
import sqlite3
def get_conn(db):
    return sqlite3.connect(db)
