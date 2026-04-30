"""add rough_sort_enabled flag to studies

Revision ID: 36fea97cbbb6
Revises: db2ad904b167
Create Date: 2026-04-30 20:09:40.462939

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36fea97cbbb6'
down_revision: Union[str, Sequence[str], None] = 'db2ad904b167'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "studies",
        sa.Column(
            "rough_sort_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("studies", "rough_sort_enabled")
