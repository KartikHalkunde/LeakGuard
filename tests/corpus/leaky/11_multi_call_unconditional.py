# EXPECT: LEAK var=conn line=4 confidence=definite
import sqlite3
def get_note_count(db):
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO audit_log (note_id) VALUES (?)", (1,))
    conn.commit()
    return conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
