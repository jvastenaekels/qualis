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

    class TestProjectData(BaseModel):
        name: str
        slug: str

    class TestSeedData(BaseModel):
        user: TestUserData
        project: TestProjectData

    class TestMemberData(BaseModel):
        email: str
        project_slug: str
        role: str

    @router.post("/init")
    async def init_test_db(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
        """
        Initialize test database - ensure tables exist
        This is typically handled by app startup, but useful for explicit initialization
        """
        from app.database import engine, Base

        try:
            # Explicitly create tables if they don't exist
            # This handles cases where migrations might have been skipped or
            # the DB was wiped after startup.
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

            # Test database connection
            await db.execute(text("SELECT 1"))
            return {"status": "ok", "message": "Database initialized"}
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Database initialization failed: {str(e)}"
            )

    @router.post("/seed")
    async def seed_test_data(
        data: TestSeedData, db: AsyncSession = Depends(get_db)
    ) -> dict[str, object]:
        """
        Seed base test data: user and project
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

            # Upsert Project
            result = await db.execute(
                text("""
                    INSERT INTO projects (title, slug, created_at, config)
                    VALUES (:title, :slug, CURRENT_TIMESTAMP, :config)
                    ON CONFLICT (slug)
                    DO NOTHING
                    RETURNING id
                """),
                {
                    "title": data.project.name,
                    "slug": data.project.slug,
                    "config": "{}",
                },
            )
            project_id = result.scalar()

            if not project_id:
                # If existing, fetch ID
                result = await db.execute(
                    text("SELECT id FROM projects WHERE slug = :slug"),
                    {"slug": data.project.slug},
                )
                project_id = result.scalar_one()
            else:
                # Add user as owner only if new project (or idempotent check)
                await db.execute(
                    text("""
                        INSERT INTO project_members (project_id, user_id, role)
                        VALUES (:project_id, :user_id, 'owner')
                        ON CONFLICT (project_id, user_id) DO NOTHING
                    """),
                    {
                        "project_id": project_id,
                        "user_id": user_id,
                    },
                )

            await db.commit()

            return {
                "status": "ok",
                "user_id": user_id,
                "project_id": project_id,
                "message": "Test data seeded successfully",
            }

        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=500, detail=f"Seeding failed: {str(e)}")

    @router.post("/members")
    async def add_test_member(
        data: TestMemberData, db: AsyncSession = Depends(get_db)
    ) -> dict[str, object]:
        """
        Add a user to a project for testing purposes
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

            # Get project
            result = await db.execute(
                text("SELECT id FROM projects WHERE slug = :slug"),
                {"slug": data.project_slug},
            )
            project = result.fetchone()
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            project_id = project[0]

            # Check if member exists
            result = await db.execute(
                text(
                    "SELECT user_id FROM project_members WHERE project_id = :pid AND user_id = :uid"
                ),
                {"pid": project_id, "uid": user_id},
            )
            if result.fetchone():
                return {"status": "ok", "message": "Member already exists"}

            # Add member
            await db.execute(
                text("""
                    INSERT INTO project_members (project_id, user_id, role)
                    VALUES (:pid, :uid, :role)
                """),
                {"pid": project_id, "uid": user_id, "role": data.role},
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
    async def cleanup_test_data(
        db: AsyncSession = Depends(get_db),
    ) -> dict[str, str]:
        """
        Cleanup test data between tests
        Removes all data except the base test user and project
        """
        try:
            # Delete in correct order to respect foreign keys
            tables_to_clean = [
                "qsort_entries",
                "audio_recordings",
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
    async def cleanup_all_test_data(
        db: AsyncSession = Depends(get_db),
    ) -> dict[str, str]:
        """
        Full cleanup including users and projects
        Use at end of test suite
        """
        try:
            # Delete everything in reverse dependency order
            tables_to_clean = [
                "qsort_entries",
                "audio_recordings",
                "participants",
                "recruitment_links",
                "statement_translations",
                "statements",
                "study_translations",
                "invitations",
                "studies",
                "project_members",
                "projects",
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
    async def test_health() -> dict[str, str]:
        """Simple health check for test router"""
        return {"status": "ok", "environment": settings.ENVIRONMENT}
