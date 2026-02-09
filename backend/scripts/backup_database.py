"""Database backup script (PostgreSQL specific entries)."""

import asyncio
import os
import sys
from datetime import datetime
from sqlalchemy import text

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal


async def backup_workspace_members():
    """Create backup of workspace_members table data."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = f"backups/workspace_members_{timestamp}.sql"

    os.makedirs("backups", exist_ok=True)

    async with SessionLocal() as db:
        dialect = db.bind.dialect.name

        if dialect != "postgresql":
            print(
                f"⚠️  WARNING: Dialect is {dialect}, but script is optimized for PostgreSQL"
            )

        # Select role as text to avoid enum issues during backup/restore
        result = await db.execute(
            text("""
            SELECT workspace_id, user_id, role::text, joined_at
            FROM workspace_members
        """)
        )
        rows = result.fetchall()

        with open(backup_file, "w") as f:
            f.write(f"-- Backup created: {timestamp}\n")
            f.write(f"-- Dialect: {dialect}\n")
            f.write(f"-- Total rows: {len(rows)}\n\n")

            for row in rows:
                ws_id, user_id, role, joined_at = row
                f.write(
                    f"-- INSERT: workspace_id={ws_id}, user_id={user_id}, "
                    f"role='{role}', joined_at='{joined_at}'\n"
                )

        print(f"✓ Backup created: {backup_file}")
        print(f"  Rows backed up: {len(rows)}")

        return backup_file


if __name__ == "__main__":
    backup_file = asyncio.run(backup_workspace_members())
    print(f"\n✓ Backup complete: {backup_file}")
