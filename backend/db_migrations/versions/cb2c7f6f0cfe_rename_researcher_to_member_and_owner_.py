"""rename_researcher_to_member_and_owner_uniqueness

Revision ID: cb2c7f6f0cfe
Revises: fd88287d3f9b
Create Date: 2026-05-02 21:38:01.539550

Renames `researcher` role to `member`, recreates the projectrole enum
without the legacy value, and installs a partial unique index that enforces
one Owner per project. See
docs/superpowers/specs/2026-05-02-project-roles-refactor-design.md §9.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cb2c7f6f0cfe'
down_revision: Union[str, Sequence[str], None] = 'fd88287d3f9b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Pre-flight: refuse to migrate if any project has > 1 owner row.
    conn = op.get_bind()
    bad_rows = conn.execute(sa.text(
        "SELECT project_id FROM project_members "
        "WHERE role = 'owner' GROUP BY project_id HAVING COUNT(*) > 1"
    )).fetchall()
    if bad_rows:
        offenders = ", ".join(str(r[0]) for r in bad_rows)
        raise RuntimeError(
            f"Cannot migrate: project(s) {offenders} have more than one owner. "
            f"Resolve manually before retrying."
        )

    # 2. Recreate the enum without 'researcher', folding the rename into the cast.
    # The projectrole enum is referenced by both project_members.role and
    # invitations.role; recast both columns before dropping the legacy type.
    op.execute("CREATE TYPE projectrole_new AS ENUM ('owner', 'member', 'viewer')")
    op.execute(
        "ALTER TABLE project_members "
        "ALTER COLUMN role TYPE projectrole_new USING ("
        "  CASE WHEN role::text = 'researcher' THEN 'member' "
        "       ELSE role::text END"
        ")::projectrole_new"
    )
    op.execute(
        "ALTER TABLE invitations "
        "ALTER COLUMN role TYPE projectrole_new USING ("
        "  CASE WHEN role::text = 'researcher' THEN 'member' "
        "       ELSE role::text END"
        ")::projectrole_new"
    )
    op.execute("DROP TYPE projectrole")
    op.execute("ALTER TYPE projectrole_new RENAME TO projectrole")

    # 3. Partial unique index — one Owner per project.
    op.execute(
        "CREATE UNIQUE INDEX project_members_one_owner_per_project "
        "ON project_members (project_id) WHERE role = 'owner'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS project_members_one_owner_per_project")
    op.execute("CREATE TYPE projectrole_old AS ENUM ('owner', 'researcher', 'viewer')")
    op.execute(
        "ALTER TABLE project_members "
        "ALTER COLUMN role TYPE projectrole_old USING ("
        "  CASE WHEN role::text = 'member' THEN 'researcher' "
        "       ELSE role::text END"
        ")::projectrole_old"
    )
    op.execute(
        "ALTER TABLE invitations "
        "ALTER COLUMN role TYPE projectrole_old USING ("
        "  CASE WHEN role::text = 'member' THEN 'researcher' "
        "       ELSE role::text END"
        ")::projectrole_old"
    )
    op.execute("DROP TYPE projectrole")
    op.execute("ALTER TYPE projectrole_old RENAME TO projectrole")
