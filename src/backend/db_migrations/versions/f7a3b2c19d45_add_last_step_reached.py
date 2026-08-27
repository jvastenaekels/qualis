"""Add last_step_reached to participants

Revision ID: f7a3b2c19d45
Revises: c4a1e7f23b91
Create Date: 2026-02-18 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f7a3b2c19d45"
down_revision: Union[str, None] = "c4a1e7f23b91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("last_step_reached", sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        "participants",
        sa.Column("last_step_reached_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill: completed participants → step 5, started → step 1
    op.execute(
        """
        UPDATE participants SET
            last_step_reached = CASE WHEN status = 'completed' THEN 5 ELSE 1 END,
            last_step_reached_at = COALESCE(submitted_at, consented_at, created_at)
        """
    )


def downgrade() -> None:
    op.drop_column("participants", "last_step_reached_at")
    op.drop_column("participants", "last_step_reached")
