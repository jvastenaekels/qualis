"""add data_retention_months to studies

Revision ID: 8b649314aa4a
Revises: ac63354ffc6a
Create Date: 2026-04-28 13:02:49.391085

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8b649314aa4a'
down_revision: Union[str, Sequence[str], None] = 'ac63354ffc6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Adds an optional retention-period setting (in months) to studies. The
    data-lifecycle anonymisation flow uses it to compute the default cutoff
    offered to researchers; NULL keeps today's behaviour (12-month default).
    """
    op.add_column(
        'studies',
        sa.Column('data_retention_months', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('studies', 'data_retention_months')
