import sqlite3


def find_customer(db_path: str, customer_id: int):
    conn = sqlite3.connect(db_path)
    if customer_id <= 0:
        return None
    row = conn.execute("select * from customers where id = ?", (customer_id,)).fetchone()
    conn.close()
    return row


def update_status(db_path: str, customer_id: int, status: str):
    conn = sqlite3.connect(db_path)
    conn.execute("update customers set status = ? where id = ?", (status, customer_id))
    if status == "cancelled":
        return False
    conn.commit()
    conn.close()
    return True
