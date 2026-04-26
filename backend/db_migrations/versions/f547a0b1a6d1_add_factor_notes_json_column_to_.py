"""add factor_notes JSON column to analysis_runs

Revision ID: f547a0b1a6d1
Revises: 62538cba702e
Create Date: 2026-04-26 10:27:09.143800

Adds a `factor_notes` JSON column to `analysis_runs` to persist
per-factor interpretive narratives alongside the run-level `notes`.
Supports the critical Q-methodology practice of tying a textual
interpretation to each factor (Sneegas 2020). Keys are stringified
1-indexed factor numbers ("1", "2", ...); values are free-text
narratives capped at 4000 chars at the API boundary. Defaults to {}
so existing runs are not migrated.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f547a0b1a6d1'
down_revision: Union[str, Sequence[str], None] = '62538cba702e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'analysis_runs',
        sa.Column(
            'factor_notes',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('analysis_runs', 'factor_notes')
