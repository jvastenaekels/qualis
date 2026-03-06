"""Add concourse traceability columns to statements.

Revision ID: c8d9e0f1a2b3
Revises: b1c2d3e4f5a6
Create Date: 2026-03-06
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "statements",
        sa.Column(
            "source_concourse_item_id",
            sa.Integer(),
            sa.ForeignKey("concourse_items.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "statements",
        sa.Column("source_imported_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_statements_source_concourse_item_id",
        "statements",
        ["source_concourse_item_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_statements_source_concourse_item_id", table_name="statements")
    op.drop_column("statements", "source_imported_at")
    op.drop_column("statements", "source_concourse_item_id")
