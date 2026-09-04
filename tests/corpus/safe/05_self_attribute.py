# EXPECT: CLEAN
import sqlite3
class Store:
    def __init__(self, db):
        self.conn = sqlite3.connect(db)
