"""rename workspace indexes to project + add is_discarded index

Revision ID: 62538cba702e
Revises: 4368e82a18ff
Create Date: 2026-04-25 13:16:40.422961

Cleans up the index drift left over from the workspace→project rename
in migration d4e5f6a7b8c9 (the columns were renamed but the indexes
kept their old `_workspace_id` names — audit F-05-001), and switches
the `participants.resume_code` from a unique index to a unique
constraint (a normalisation that makes future autogen runs idempotent).

Also adds the missing `participants.is_discarded` index that audit
F-05-003 surfaced — `is_discarded` is a filter predicate on at least
4 query sites including the `Study.participant_count` computed column
property; without an index PostgreSQL does a sequential scan on every
participant lookup.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '62538cba702e'
down_revision: Union[str, Sequence[str], None] = '4368e82a18ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Stale index names from the workspace→project column rename.
    op.drop_index(op.f('ix_concourse_tags_workspace_id'), table_name='concourse_tags')
    op.create_index(
        op.f('ix_concourse_tags_project_id'),
        'concourse_tags',
        ['project_id'],
        unique=False,
    )
    op.drop_index(op.f('ix_concourses_workspace_id'), table_name='concourses')
    op.create_index(
        op.f('ix_concourses_project_id'),
        'concourses',
        ['project_id'],
        unique=False,
    )
    op.drop_index(op.f('ix_invitations_workspace_id'), table_name='invitations')
    op.create_index(
        op.f('ix_invitations_project_id'),
        'invitations',
        ['project_id'],
        unique=False,
    )

    # Switch resume_code from unique-index to unique-constraint
    # so autogenerate stops re-flagging it as drift.
    op.drop_index(op.f('ix_participants_resume_code'), table_name='participants')
    op.create_unique_constraint(
        'uq_participants_resume_code', 'participants', ['resume_code']
    )

    # NEW INDEX (F-05-003): is_discarded is filtered on hot paths.
    op.create_index(
        op.f('ix_participants_is_discarded'),
        'participants',
        ['is_discarded'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_participants_is_discarded'), table_name='participants')

    op.drop_constraint('uq_participants_resume_code', 'participants', type_='unique')
    op.create_index(
        op.f('ix_participants_resume_code'),
        'participants',
        ['resume_code'],
        unique=True,
    )

    op.drop_index(op.f('ix_invitations_project_id'), table_name='invitations')
    op.create_index(
        op.f('ix_invitations_workspace_id'),
        'invitations',
        ['project_id'],
        unique=False,
    )
    op.drop_index(op.f('ix_concourses_project_id'), table_name='concourses')
    op.create_index(
        op.f('ix_concourses_workspace_id'),
        'concourses',
        ['project_id'],
        unique=False,
    )
    op.drop_index(op.f('ix_concourse_tags_project_id'), table_name='concourse_tags')
    op.create_index(
        op.f('ix_concourse_tags_workspace_id'),
        'concourse_tags',
        ['project_id'],
        unique=False,
    )
