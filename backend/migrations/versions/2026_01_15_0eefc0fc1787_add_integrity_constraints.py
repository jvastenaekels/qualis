"""add_integrity_constraints

Revision ID: 0eefc0fc1787
Revises: 0db7965d6b26
Create Date: 2026-01-15 18:47:39.914839

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0eefc0fc1787"
down_revision: Union[str, Sequence[str], None] = "0db7965d6b26"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint("uq_statement_code", "statements", ["study_id", "code"])
    op.create_check_constraint(
        "chk_grid_score_range",
        "qsort_entries",
        "grid_score >= -10 AND grid_score <= 10",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("chk_grid_score_range", "qsort_entries", type_="check")
    op.drop_constraint("uq_statement_code", "statements", type_="unique")
