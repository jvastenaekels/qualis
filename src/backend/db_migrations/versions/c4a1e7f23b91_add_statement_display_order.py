"""Add display_order to statements

Revision ID: c4a1e7f23b91
Revises: 2bf0f513c6c8
Create Date: 2026-02-10 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4a1e7f23b91"
down_revision: Union[str, None] = "2bf0f513c6c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "statements",
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
    )
    # Backfill: set display_order based on existing id order within each study
    op.execute(
        """
        UPDATE statements SET display_order = sub.row_num - 1
        FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY study_id ORDER BY id) AS row_num
            FROM statements
        ) sub
        WHERE statements.id = sub.id
        """
    )
    # Remove the server default after backfill
    op.alter_column("statements", "display_order", server_default=None)


def downgrade() -> None:
    op.drop_column("statements", "display_order")
