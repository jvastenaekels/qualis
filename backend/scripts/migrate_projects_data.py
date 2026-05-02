import logging
import sys
import asyncio
from sqlalchemy import text
from app.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate_projects_data():
    """Ensure default project exists and link orphans."""
    try:
        async with engine.begin() as conn:
            # 1. Ensure at least one project exists
            result = await conn.execute(
                text("SELECT id, slug FROM projects ORDER BY id ASC LIMIT 1")
            )
            row = result.fetchone()

            default_project_id = None
            if not row:
                logger.info("No project found. Creating 'Default Project'...")
                # We need a slug.
                slug = "default-project"
                # Insert
                result = await conn.execute(
                    text(
                        "INSERT INTO projects (title, slug, created_at, config) "
                        "VALUES ('Default Project', :slug, CURRENT_TIMESTAMP, '{}') "
                        "RETURNING id"
                    ),
                    {"slug": slug},
                )
                default_project_id = result.fetchone()[0]
                logger.info(f"Created Default Project (ID: {default_project_id})")
            else:
                default_project_id = row[0]
                logger.info(
                    f"Using existing Default Project (ID: {default_project_id}, Slug: {row[1]})"
                )

            # 2. Link orphan users (users with no project membership)
            # Find users not in project_members
            users_result = await conn.execute(
                text(
                    "SELECT id FROM users u WHERE NOT EXISTS "
                    "(SELECT 1 FROM project_members pm WHERE pm.user_id = u.id)"
                )
            )
            orphan_users = users_result.fetchall()

            if orphan_users:
                logger.info(
                    f"Found {len(orphan_users)} orphan users. linking to default project..."
                )
                for u_row in orphan_users:
                    uid = u_row[0]
                    # Role: 'owner' if it's the first user maybe? Or just 'admin'?
                    # Plan doesn't specify logic for existing users role default. 'admin' or 'member'.
                    # Let's say 'admin' for safety in dev, or 'member'.
                    # 'owner' implies single owner usually.
                    role = "admin"
                    await conn.execute(
                        text(
                            "INSERT INTO project_members (project_id, user_id, role, joined_at) "
                            "VALUES (:project_id, :uid, :role, CURRENT_TIMESTAMP)"
                        ),
                        {"project_id": default_project_id, "uid": uid, "role": role},
                    )
                logger.info("Orphan users linked.")
            else:
                logger.info("No orphan users found.")

            # 3. Link orphan studies
            # Helper: check for studies where project_id is NULL
            # Since models.py definition has nullable=False, schema might already enforce it.
            # But if it was added recently without default, existing rows might be problematic or cleaned up.
            # We assume we can update if needed.
            # But we can't easily check for NULL if the column is NOT NULL definition in DB.
            # We'll try to find any study where project_id IS NULL only if schema allows.
            # Actually, let's just run an UPDATE for safety if there are any NULLs.
            try:
                result = await conn.execute(
                    text(
                        "UPDATE studies SET project_id = :project_id WHERE project_id IS NULL RETURNING id"
                    ),
                    {"project_id": default_project_id},
                )
                updated_rows = result.fetchall()
                if updated_rows:
                    logger.info(
                        f"Linked {len(updated_rows)} orphan studies to default project."
                    )
                else:
                    logger.info("No orphan studies found (with NULL project_id).")
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
    asyncio.run(migrate_projects_data())
