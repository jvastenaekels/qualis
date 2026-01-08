import sqlite3
import os

db_path = "backend/q_method.db"
if not os.path.exists(db_path):
    print(f"File {db_path} not found")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("PRAGMA table_info(study_translations)")
    columns = cursor.fetchall()
    print("Columns in study_translations:")
    for col in columns:
        print(col)

    cursor.execute("SELECT count(*) FROM study_translations")
    count = cursor.fetchone()[0]
    print(f"Total rows: {count}")

except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
