"""Add the three indexes the hot read paths were missing.

PostgreSQL does not index foreign keys on its own, and the 2026-09-15
architecture diagnostic found three columns filtered on every relevant
page load without one:

- studies.project_id — joined by every study-level permission check
  (dependencies.check_study_permission) and filtered by the project
  dashboard;
- project_members.user_id — the composite primary key starts with
  project_id, so "which projects is this user in" (researcher hub, on
  every load) could not use it;
- participants (study_id, status) — Study.participant_count and the
  lifecycle counters filter one study's participants by status; the
  composite serves both, whereas status alone (three values) would not
  be selective enough to be used.

Pure DDL, additive, no data change. Declared on the models in the same
commit so create_all and the drift test see them.


Revision ID: d2a989f21f92
Revises: f7c124e0ec1e
Create Date: 2026-09-16 23:59:07.939541

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd2a989f21f92'
down_revision: Union[str, Sequence[str], None] = 'f7c124e0ec1e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index('ix_participants_study_status', 'participants', ['study_id', 'status'], unique=False)
    op.create_index(op.f('ix_project_members_user_id'), 'project_members', ['user_id'], unique=False)
    op.create_index(op.f('ix_studies_project_id'), 'studies', ['project_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_studies_project_id'), table_name='studies')
    op.drop_index(op.f('ix_project_members_user_id'), table_name='project_members')
    op.drop_index('ix_participants_study_status', table_name='participants')
