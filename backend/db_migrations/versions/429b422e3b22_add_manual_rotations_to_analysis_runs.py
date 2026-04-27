"""add manual_rotations to analysis_runs

Revision ID: 429b422e3b22
Revises: a313eb1ae9ae
Create Date: 2026-04-27 08:54:55.427004

Adds a JSON `manual_rotations` column to `analysis_runs` so that runs using
the new 'judgmental' rotation method preserve the exact sequence of
(factor_a, factor_b, angle_deg) rotations that produced the result.

Judgmental rotation lets the researcher align factors with substantively
meaningful positions rather than relying on automatic varimax (Brown 1980;
Watts & Stenner 2012). Persisting the rotation list on the run is the
audit-trail counterpart of `rotation_method`: a co-author opening a
historical run can see not only that judgmental rotation was used but
also which rotations were applied, in what order.

Nullable so existing runs (which used 'varimax' or 'none') are not
migrated. Default behaviour is unchanged for those rotation methods.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '429b422e3b22'
down_revision: Union[str, Sequence[str], None] = 'a313eb1ae9ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'analysis_runs',
        sa.Column('manual_rotations', sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('analysis_runs', 'manual_rotations')
