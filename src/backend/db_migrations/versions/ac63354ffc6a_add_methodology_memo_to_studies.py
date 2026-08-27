"""add methodology_memo to studies

Revision ID: ac63354ffc6a
Revises: 4ef41a295cbb
Create Date: 2026-04-28 12:48:33.340915

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ac63354ffc6a'
down_revision: Union[str, Sequence[str], None] = '4ef41a295cbb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Adds an optional free-text methodology memo to studies (mirrors the
    per-concourse construction_memo). Useful for replication and pre-
    registration documentation.
    """
    op.add_column(
        'studies',
        sa.Column('methodology_memo', sa.String(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('studies', 'methodology_memo')
