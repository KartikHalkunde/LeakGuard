# EXPECT: CLEAN
import sqlite3
def add_connection(conns, db):
    conns.append(sqlite3.connect(db))
