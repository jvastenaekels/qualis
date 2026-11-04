"""Track the latest saved draft revision.

Revision ID: b839ce2f641a
Revises: 1d82a52cfe76
"""

from alembic import op
import sqlalchemy as sa

revision = "b839ce2f641a"
down_revision = "1d82a52cfe76"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participants", sa.Column("draft_revision", sa.BigInteger(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("participants", "draft_revision")
