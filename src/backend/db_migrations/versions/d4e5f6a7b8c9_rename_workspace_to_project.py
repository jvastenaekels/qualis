"""rename workspace to project

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-06 14:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE workspacerole RENAME TO projectrole")
    op.execute("ALTER TABLE workspaces RENAME TO projects")
    op.execute("ALTER TABLE workspace_members RENAME TO project_members")
    op.execute("ALTER TABLE project_members RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE studies RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE concourses RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE concourse_tags RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE invitations RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER INDEX ix_workspaces_id RENAME TO ix_projects_id")
    op.execute("ALTER INDEX ix_workspaces_slug RENAME TO ix_projects_slug")
    op.execute("ALTER INDEX uq_workspace_tag_name RENAME TO uq_project_tag_name")


def downgrade() -> None:
    op.execute("ALTER INDEX uq_project_tag_name RENAME TO uq_workspace_tag_name")
    op.execute("ALTER INDEX ix_projects_slug RENAME TO ix_workspaces_slug")
    op.execute("ALTER INDEX ix_projects_id RENAME TO ix_workspaces_id")
    op.execute("ALTER TABLE invitations RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE concourse_tags RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE concourses RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE studies RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE project_members RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE project_members RENAME TO workspace_members")
    op.execute("ALTER TABLE projects RENAME TO workspaces")
    op.execute("ALTER TYPE projectrole RENAME TO workspacerole")
