"""
Test Router - Only available in test/development environments
Provides endpoints for E2E test database management
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.config import settings
from app.database import get_db
from app.utils.security import get_password_hash

router = APIRouter(prefix="/api/test", tags=["test"])

# Only enable test endpoints in test/dev environments
if settings.ENVIRONMENT not in ["test", "development"]:
    # Empty router in production
    pass
else:

    class TestUserData(BaseModel):
        email: str
        password: str
        is_superuser: bool = False

    class TestWorkspaceData(BaseModel):
        name: str
        slug: str

    class TestSeedData(BaseModel):
        user: TestUserData
        workspace: TestWorkspaceData

    class TestMemberData(BaseModel):
        email: str
        workspace_slug: str
        role: str

    @router.post("/init")
    async def init_test_db(db: AsyncSession = Depends(get_db)):
        """
        Initialize test database - ensure tables exist
        This is typically handled by app startup, but useful for explicit initialization
        """
        try:
            # Test database connection
            await db.execute(text("SELECT 1"))
            return {"status": "ok", "message": "Database initialized"}
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Database initialization failed: {str(e)}"
            )

    @router.post("/seed")
    async def seed_test_data(data: TestSeedData, db: AsyncSession = Depends(get_db)):
        """
        Seed base test data: user and workspace
        Idempotent - won't create duplicates
        """
        try:
            # Upsert User
            hashed_password = get_password_hash(data.user.password)
            result = await db.execute(
                text("""
                    INSERT INTO users (email, hashed_password, is_active, is_superuser, is_totp_enabled)
                    VALUES (:email, :password, true, :is_superuser, false)
                    ON CONFLICT (email)
                    DO UPDATE SET hashed_password = EXCLUDED.hashed_password
                    RETURNING id
                """),
                {
                    "email": data.user.email,
                    "password": hashed_password,
                    "is_superuser": data.user.is_superuser,
                },
            )
            user_id = result.scalar()

            # Upsert Workspace
            result = await db.execute(
                text("""
                    INSERT INTO workspaces (title, slug, created_at, config)
                    VALUES (:title, :slug, CURRENT_TIMESTAMP, :config)
                    ON CONFLICT (slug)
                    DO NOTHING
                    RETURNING id
                """),
                {
                    "title": data.workspace.name,
                    "slug": data.workspace.slug,
                    "config": "{}",
                },
            )
            workspace_id = result.scalar()

            if not workspace_id:
                # If existing, fetch ID
                result = await db.execute(
                    text("SELECT id FROM workspaces WHERE slug = :slug"),
                    {"slug": data.workspace.slug},
                )
                workspace_id = result.scalar_one()
            else:
                # Add user as owner only if new workspace (or idempotent check)
                await db.execute(
                    text("""
                        INSERT INTO workspace_members (workspace_id, user_id, role)
                        VALUES (:workspace_id, :user_id, 'owner')
                        ON CONFLICT (workspace_id, user_id) DO NOTHING
                    """),
                    {
                        "workspace_id": workspace_id,
                        "user_id": user_id,
                    },
                )

            await db.commit()

            return {
                "status": "ok",
                "user_id": user_id,
                "workspace_id": workspace_id,
                "message": "Test data seeded successfully",
            }

        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=500, detail=f"Seeding failed: {str(e)}")

    @router.post("/members")
    async def add_test_member(data: TestMemberData, db: AsyncSession = Depends(get_db)):
        """
        Add a user to a workspace for testing purposes
        """
        try:
            # Get user
            result = await db.execute(
                text("SELECT id FROM users WHERE email = :email"),
                {"email": data.email},
            )
            user = result.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            user_id = user[0]

            # Get workspace
            result = await db.execute(
                text("SELECT id FROM workspaces WHERE slug = :slug"),
                {"slug": data.workspace_slug},
            )
            workspace = result.fetchone()
            if not workspace:
                raise HTTPException(status_code=404, detail="Workspace not found")
            workspace_id = workspace[0]

            # Check if member exists
            result = await db.execute(
                text(
                    "SELECT user_id FROM workspace_members WHERE workspace_id = :wid AND user_id = :uid"
                ),
                {"wid": workspace_id, "uid": user_id},
            )
            if result.fetchone():
                return {"status": "ok", "message": "Member already exists"}

            # Add member
            await db.execute(
                text("""
                    INSERT INTO workspace_members (workspace_id, user_id, role)
                    VALUES (:wid, :uid, :role)
                """),
                {"wid": workspace_id, "uid": user_id, "role": data.role},
            )
            await db.commit()
            return {"status": "ok", "message": "Member added"}

        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=500, detail=f"Failed to add member: {str(e)}"
            )

    @router.post("/cleanup")
    async def cleanup_test_data(db: AsyncSession = Depends(get_db)):
        """
        Cleanup test data between tests
        Removes all data except the base test user and workspace
        """
        try:
            # Delete in correct order to respect foreign keys
            tables_to_clean = [
                "qsort_entries",
                "participants",
                "recruitment_links",
                "statement_translations",
                "statements",
                "study_translations",
                "invitations",
                "studies",
            ]

            for table in tables_to_clean:
                await db.execute(text(f"DELETE FROM {table}"))  # nosec

            await db.commit()

            return {"status": "ok", "message": "Test data cleaned up"}

        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")

    @router.post("/cleanup-all")
    async def cleanup_all_test_data(db: AsyncSession = Depends(get_db)):
        """
        Full cleanup including users and workspaces
        Use at end of test suite
        """
        try:
            # Delete everything in reverse dependency order
            tables_to_clean = [
                "qsort_entries",
                "participants",
                "recruitment_links",
                "statement_translations",
                "statements",
                "study_translations",
                "invitations",
                "studies",
                "workspace_members",
                "workspaces",
                "users",
            ]

            for table in tables_to_clean:
                await db.execute(text(f"DELETE FROM {table}"))  # nosec

            await db.commit()

            return {"status": "ok", "message": "All test data cleaned up"}

        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=500, detail=f"Full cleanup failed: {str(e)}"
            )

    @router.get("/health")
    async def test_health():
        """Simple health check for test router"""
        return {"status": "ok", "environment": settings.ENVIRONMENT}
