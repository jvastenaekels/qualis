"""add_pre_instruction

Revision ID: d3221972445d
Revises: bf798fcf46a6
Create Date: 2026-01-17 12:14:14.343769

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d3221972445d"
down_revision: Union[str, Sequence[str], None] = "bf798fcf46a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "study_translations", sa.Column("pre_instruction", sa.String(), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("study_translations", "pre_instruction")
