"""add item versions and comments

Revision ID: c3d4e5f6a7b8
Revises: 2bf0f513c6c8
Create Date: 2026-03-06 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "2bf0f513c6c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "concourse_item_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column(
            "status",
            sa.Enum("proposed", "accepted", "rejected", name="concourseitemstatus", create_type=False),
            nullable=False,
        ),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("translations_snapshot", sa.JSON(), nullable=False),
        sa.Column("tag_ids_snapshot", sa.JSON(), nullable=False),
        sa.Column("change_comment", sa.String(length=500), nullable=True),
        sa.Column("changed_by", sa.Integer(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["concourse_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("item_id", "version_number", name="uq_item_version"),
    )
    op.create_index(op.f("ix_concourse_item_versions_id"), "concourse_item_versions", ["id"], unique=False)
    op.create_index(op.f("ix_concourse_item_versions_item_id"), "concourse_item_versions", ["item_id"], unique=False)

    op.create_table(
        "concourse_item_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("body", sa.String(length=2000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["concourse_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_concourse_item_comments_id"), "concourse_item_comments", ["id"], unique=False)
    op.create_index(op.f("ix_concourse_item_comments_item_id"), "concourse_item_comments", ["item_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_concourse_item_comments_item_id"), table_name="concourse_item_comments")
    op.drop_index(op.f("ix_concourse_item_comments_id"), table_name="concourse_item_comments")
    op.drop_table("concourse_item_comments")
    op.drop_index(op.f("ix_concourse_item_versions_item_id"), table_name="concourse_item_versions")
    op.drop_index(op.f("ix_concourse_item_versions_id"), table_name="concourse_item_versions")
    op.drop_table("concourse_item_versions")
