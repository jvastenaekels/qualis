"""add bootstrap to analysis_runs

Revision ID: 4ef41a295cbb
Revises: 429b422e3b22
Create Date: 2026-04-27 10:49:41.750855

Adds two columns to ``analysis_runs`` so that runs which opted in to the
non-parametric bootstrap of Q-sorts (Zabala & Pascual 2016) preserve the
stability information alongside the regular result:

- ``bootstrap_iterations`` records the number of bootstrap iterations B
  the analyst requested. NULL = bootstrap was not run for this row.
- ``bootstrap_result`` stores SE/CI per (statement, factor) plus
  convergence metadata as JSON, so the audit trail captures not only
  that bootstrap was used but also the exact stability numbers
  produced.

Both columns are nullable so existing runs (which pre-date the feature)
keep working unchanged.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ef41a295cbb'
down_revision: Union[str, Sequence[str], None] = '429b422e3b22'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'analysis_runs',
        sa.Column('bootstrap_iterations', sa.Integer(), nullable=True),
    )
    op.add_column(
        'analysis_runs',
        sa.Column('bootstrap_result', sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('analysis_runs', 'bootstrap_result')
    op.drop_column('analysis_runs', 'bootstrap_iterations')
