import logging
import sys
import asyncio
from sqlalchemy import text
from app.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate_workspaces_data():
    """Ensure default workspace exists and link orphans."""
    try:
        async with engine.begin() as conn:
            # 1. Ensure at least one workspace exists
            result = await conn.execute(
                text("SELECT id, slug FROM workspaces ORDER BY id ASC LIMIT 1")
            )
            row = result.fetchone()

            default_ws_id = None
            if not row:
                logger.info("No workspace found. Creating 'Default Workspace'...")
                # We need a slug.
                slug = "default-workspace"
                # Insert
                result = await conn.execute(
                    text(
                        "INSERT INTO workspaces (title, slug, created_at, config) "
                        "VALUES ('Default Workspace', :slug, CURRENT_TIMESTAMP, '{}') "
                        "RETURNING id"
                    ),
                    {"slug": slug},
                )
                default_ws_id = result.fetchone()[0]
                logger.info(f"Created Default Workspace (ID: {default_ws_id})")
            else:
                default_ws_id = row[0]
                logger.info(
                    f"Using existing Default Workspace (ID: {default_ws_id}, Slug: {row[1]})"
                )

            # 2. Link orphan users (users with no workspace membership)
            # Find users not in workspace_members
            users_result = await conn.execute(
                text(
                    "SELECT id FROM users u WHERE NOT EXISTS "
                    "(SELECT 1 FROM workspace_members wm WHERE wm.user_id = u.id)"
                )
            )
            orphan_users = users_result.fetchall()

            if orphan_users:
                logger.info(
                    f"Found {len(orphan_users)} orphan users. linking to default workspace..."
                )
                for u_row in orphan_users:
                    uid = u_row[0]
                    # Role: 'owner' if it's the first user maybe? Or just 'admin'?
                    # Plan doesn't specify logic for existing users role default. 'admin' or 'member'.
                    # Let's say 'admin' for safety in dev, or 'researcher' (member).
                    # 'owner' implies single owner usually.
                    role = "admin"
                    await conn.execute(
                        text(
                            "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) "
                            "VALUES (:ws_id, :uid, :role, CURRENT_TIMESTAMP)"
                        ),
                        {"ws_id": default_ws_id, "uid": uid, "role": role},
                    )
                logger.info("Orphan users linked.")
            else:
                logger.info("No orphan users found.")

            # 3. Link orphan studies
            # Helper: check for studies where workspace_id is NULL
            # Since models.py definition has nullable=False, schema might already enforce it.
            # But if it was added recently without default, existing rows might be problematic or cleaned up.
            # We assume we can update if needed.
            # But we can't easily check for NULL if the column is NOT NULL definition in DB.
            # We'll try to find any study where workspace_id IS NULL only if schema allows.
            # Actually, let's just run an UPDATE for safety if there are any NULLs.
            try:
                result = await conn.execute(
                    text(
                        "UPDATE studies SET workspace_id = :ws_id WHERE workspace_id IS NULL RETURNING id"
                    ),
                    {"ws_id": default_ws_id},
                )
                updated_rows = result.fetchall()
                if updated_rows:
                    logger.info(
                        f"Linked {len(updated_rows)} orphan studies to default workspace."
                    )
                else:
                    logger.info("No orphan studies found (with NULL workspace_id).")
            except Exception as e:
                logger.info(
                    f"Could not check/update orphan studies (column might be non-nullable already): {e}"
                )

            logger.info("Data migration completed.")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate_workspaces_data())
