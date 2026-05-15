"""add last_login_at

Revision ID: 60af83267ba5
Revises: a3f1c2e9b4d7
Create Date: 2026-05-15 07:37:07.408626
"""

from alembic import op
import sqlalchemy as sa

revision = "60af83267ba5"
down_revision = "a3f1c2e9b4d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "last_login_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "last_login_at")
