"""rename randomize_statements to randomize_statement_order

Revision ID: 8e4ef63c6c7a
Revises: 8e32439881ce
Create Date: 2026-01-16 15:30:01.161842

"""

from typing import Sequence, Union

from alembic import op  # type: ignore


# revision identifiers, used by Alembic.
revision: str = "8e4ef63c6c7a"
down_revision: Union[str, Sequence[str], None] = "8e32439881ce"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "studies", "randomize_statements", new_column_name="randomize_statement_order"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "studies", "randomize_statement_order", new_column_name="randomize_statements"
    )
