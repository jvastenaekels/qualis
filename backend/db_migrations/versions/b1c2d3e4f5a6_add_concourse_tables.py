"""Add concourse tables

Revision ID: b1c2d3e4f5a6
Revises: a7b3c9d12e45
Create Date: 2026-03-06 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a7b3c9d12e45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create concourse, concourse_items, concourse_item_translations, concourse_tags, concourse_item_tags tables."""

    # -- concourses --
    op.create_table(
        "concourses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_concourses_id"), "concourses", ["id"], unique=False)
    op.create_index(
        op.f("ix_concourses_workspace_id"), "concourses", ["workspace_id"], unique=False
    )

    # -- concourse_tags --
    op.create_table(
        "concourse_tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "name", name="uq_workspace_tag_name"),
    )
    op.create_index(
        op.f("ix_concourse_tags_id"), "concourse_tags", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_concourse_tags_workspace_id"),
        "concourse_tags",
        ["workspace_id"],
        unique=False,
    )

    # -- concourse_items --
    op.create_table(
        "concourse_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("concourse_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column(
            "status",
            sa.Enum("proposed", "accepted", "rejected", name="concourseitemstatus"),
            nullable=False,
            server_default="proposed",
        ),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["concourse_id"], ["concourses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("concourse_id", "code", name="uq_concourse_item_code"),
    )
    op.create_index(
        op.f("ix_concourse_items_id"), "concourse_items", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_concourse_items_concourse_id"),
        "concourse_items",
        ["concourse_id"],
        unique=False,
    )

    # -- concourse_item_translations --
    op.create_table(
        "concourse_item_translations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("language_code", sa.String(5), nullable=False),
        sa.Column("text", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(
            ["item_id"], ["concourse_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "item_id", "language_code", name="uq_concourse_item_lang"
        ),
    )
    op.create_index(
        op.f("ix_concourse_item_translations_id"),
        "concourse_item_translations",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_concourse_item_translations_item_id"),
        "concourse_item_translations",
        ["item_id"],
        unique=False,
    )

    # -- concourse_item_tags (join table) --
    op.create_table(
        "concourse_item_tags",
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["item_id"], ["concourse_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["concourse_tags.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("item_id", "tag_id"),
    )


def downgrade() -> None:
    """Drop concourse tables in reverse dependency order."""
    op.drop_table("concourse_item_tags")
    op.drop_index(
        op.f("ix_concourse_item_translations_item_id"),
        table_name="concourse_item_translations",
    )
    op.drop_index(
        op.f("ix_concourse_item_translations_id"),
        table_name="concourse_item_translations",
    )
    op.drop_table("concourse_item_translations")
    op.drop_index(
        op.f("ix_concourse_items_concourse_id"), table_name="concourse_items"
    )
    op.drop_index(op.f("ix_concourse_items_id"), table_name="concourse_items")
    op.drop_table("concourse_items")
    op.drop_index(
        op.f("ix_concourse_tags_workspace_id"), table_name="concourse_tags"
    )
    op.drop_index(op.f("ix_concourse_tags_id"), table_name="concourse_tags")
    op.drop_table("concourse_tags")
    op.drop_index(op.f("ix_concourses_workspace_id"), table_name="concourses")
    op.drop_index(op.f("ix_concourses_id"), table_name="concourses")
    op.drop_table("concourses")
    op.execute("DROP TYPE IF EXISTS concourseitemstatus")
