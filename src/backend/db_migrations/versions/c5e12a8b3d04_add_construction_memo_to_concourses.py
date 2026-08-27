"""add construction_memo column to concourses

Revision ID: c5e12a8b3d04
Revises: b3a47d8e9f12
Create Date: 2026-04-26 11:00:00.000000

Adds a free-text `construction_memo` column to `concourses` so researchers
can document **how** the concourse was built: which sources were canvassed,
which voices were retained or excluded, and the rationale for sampling.

Concourse construction is a curatorial act, not a neutral inventory of
"all the things people might say" (Sneegas 2020; Robbins & Krueger 2000).
Surfacing that act inside the data structure — rather than burying it in
external notes — is the minimum reflexive infrastructure a critical-Q
platform should provide. Capped at 10 000 characters at the API boundary
(roughly three pages of prose), nullable so existing concourses are not
migrated.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5e12a8b3d04'
down_revision: Union[str, Sequence[str], None] = 'b3a47d8e9f12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'concourses',
        sa.Column('construction_memo', sa.String(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('concourses', 'construction_memo')
