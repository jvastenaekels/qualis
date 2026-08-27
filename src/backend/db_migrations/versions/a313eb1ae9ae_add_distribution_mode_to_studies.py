"""add distribution_mode column to studies

Revision ID: a313eb1ae9ae
Revises: c5e12a8b3d04
Create Date: 2026-04-27 12:00:00.000000

Adds a `distribution_mode` enum column to `studies` letting the researcher
choose between forced (each column filled to capacity, the current default;
Brown 1980; Watts & Stenner 2012), free (any distribution summing to N;
Brown et al. 2015), and flexible (Qualis-specific compromise: total
enforced, per-column capacities soft).

Default 'forced' so existing studies are unchanged.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a313eb1ae9ae'
down_revision: Union[str, Sequence[str], None] = 'c5e12a8b3d04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    distribution_mode_enum = sa.Enum(
        'forced', 'free', 'flexible', name='distributionmode'
    )
    distribution_mode_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'studies',
        sa.Column(
            'distribution_mode',
            distribution_mode_enum,
            nullable=False,
            server_default='forced',
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('studies', 'distribution_mode')
    op.execute('DROP TYPE distributionmode')
