# EXPECT: CLEAN
import sqlite3
def connections(db_list):
    for db in db_list:
        yield sqlite3.connect(db)
