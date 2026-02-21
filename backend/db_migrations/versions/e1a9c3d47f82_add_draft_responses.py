"""Add draft_responses to participants

Revision ID: e1a9c3d47f82
Revises: 2347cad310fd
Create Date: 2026-02-21 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1a9c3d47f82"
down_revision: Union[str, None] = "2347cad310fd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add draft_responses JSON column to participants."""
    op.add_column(
        "participants",
        sa.Column("draft_responses", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    """Remove draft_responses column from participants."""
    op.drop_column("participants", "draft_responses")
