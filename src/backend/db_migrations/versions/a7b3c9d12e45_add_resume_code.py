"""Add resume_code to participants

Revision ID: a7b3c9d12e45
Revises: e1a9c3d47f82
Create Date: 2026-02-21 18:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7b3c9d12e45"
down_revision: Union[str, None] = "e1a9c3d47f82"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add resume_code column with unique index to participants."""
    op.add_column(
        "participants",
        sa.Column("resume_code", sa.String(50), nullable=True),
    )
    op.create_index(
        "ix_participants_resume_code",
        "participants",
        ["resume_code"],
        unique=True,
    )


def downgrade() -> None:
    """Remove resume_code column from participants."""
    op.drop_index("ix_participants_resume_code", table_name="participants")
    op.drop_column("participants", "resume_code")
