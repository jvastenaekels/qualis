"""add anonymised_at to participants

Revision ID: 4368e82a18ff
Revises: c94f0b41532e
Create Date: 2026-04-25 11:41:14.585889

Adds the `anonymised_at` timestamp column to participants for GDPR
Art. 17 erasure tracking. When set, the row's PII columns have been
nulled, audio recordings deleted, and the session_token rotated; the
Q-sort entries themselves are preserved as anonymous research data.

NOTE: autogenerate again surfaced unrelated drift (workspace→project
index renames, resume_code constraint format change). Per CLAUDE.md
guidance and the analysis_runs migration, those are excluded here and
tracked under audit findings F-05-001 etc.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4368e82a18ff'
down_revision: Union[str, Sequence[str], None] = 'c94f0b41532e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'participants',
        sa.Column('anonymised_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f('ix_participants_anonymised_at'),
        'participants',
        ['anonymised_at'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f('ix_participants_anonymised_at'), table_name='participants'
    )
    op.drop_column('participants', 'anonymised_at')
