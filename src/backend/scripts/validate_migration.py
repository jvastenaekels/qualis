"""Migration validation script (PostgreSQL only)."""

import asyncio
import sys
import os
from sqlalchemy import text

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal


async def validate_pre_migration():
    """Pre-migration checks."""
    print("=" * 50)
    print("PRE-MIGRATION VALIDATION (PostgreSQL)")
    print("=" * 50)

    async with SessionLocal() as db:
        # Count current roles
        for role in ["admin", "researcher", "member", "viewer", "owner"]:
            try:
                result = await db.execute(
                    text(
                        f"SELECT COUNT(*) FROM project_members WHERE role::text = '{role}'"
                    )
                )
                count = result.scalar() or 0
                symbol = "✓" if role != "owner" or count == 0 else "⚠️"
                print(f"{symbol} {role}: {count}")
            except Exception:
                # If table doesn't exist yet or column missing
                print(f"✘ {role}: Error querying role (maybe table doesn't exist yet?)")

        # Total count
        try:
            result = await db.execute(text("SELECT COUNT(*) FROM project_members"))
            total = result.scalar()
            print(f"\nTotal project members: {total}")
        except Exception:
            print("\nTotal project members: Could not query")

        # Check database dialect
        dialect = db.bind.dialect.name
        print(f"Database: {dialect}")
        if dialect != "postgresql":
            print(f"⚠️  WARNING: Expected postgresql, found {dialect}")

        return True


async def validate_post_migration():
    """Post-migration checks."""
    print("=" * 50)
    print("POST-MIGRATION VALIDATION (PostgreSQL)")
    print("=" * 50)

    async with SessionLocal() as db:
        # Verify no 'admin' remain
        result = await db.execute(
            text("SELECT COUNT(*) FROM project_members WHERE role::text = 'admin'")
        )
        admin_count = result.scalar()

        if admin_count > 0:
            print(f"❌ ERROR: {admin_count} 'admin' roles still exist!")
            return False
        else:
            print("✓ No 'admin' roles found")

        # Count current roles
        for role in ["owner", "member", "viewer"]:
            result = await db.execute(
                text(
                    f"SELECT COUNT(*) FROM project_members WHERE role::text = '{role}'"
                )
            )
            count = result.scalar() or 0
            print(f"✓ {role}: {count}")

        # Check referential integrity
        result = await db.execute(
            text("""
            SELECT COUNT(*) FROM project_members wm
            LEFT JOIN users u ON wm.user_id = u.id
            WHERE u.id IS NULL
        """)
        )
        orphaned = result.scalar()

        if orphaned > 0:
            print(f"❌ ERROR: {orphaned} orphaned member records!")
            return False
        else:
            print("✓ Referential integrity OK")

        return True


if __name__ == "__main__":
    if "--pre" in sys.argv:
        success = asyncio.run(validate_pre_migration())
    elif "--post" in sys.argv:
        success = asyncio.run(validate_post_migration())
    else:
        print("Usage: python scripts/validate_migration.py [--pre|--post]")
        sys.exit(1)

    sys.exit(0 if success else 1)
