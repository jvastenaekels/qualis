"""add memo_entries and memo_comments tables, drop free-text memo columns

Revision ID: db2ad904b167
Revises: 8b649314aa4a
Create Date: 2026-04-29 10:09:26.279497

Replaces concourses.construction_memo and studies.methodology_memo with a
polymorphic memo subsystem (entries + threaded comments). Existing free-text
content migrates into a single entry titled 'Notes' (position 0). Empty
memos do not produce an entry.

Aborts loudly if any source memo exceeds 10000 chars (the new entry body
cap). Researchers must split the content manually before re-running the
deploy.

PostgreSQL DDL is transactional; a failed step rolls back the migration
entirely (including the data step).

See migration c5e12a8b3d04 for the curatorial-act framing
(Sneegas 2020; Robbins & Krueger 2000) that the construction_memo
column originally surfaced.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as pg_ENUM


# revision identifiers, used by Alembic.
revision: str = 'db2ad904b167'
down_revision: Union[str, Sequence[str], None] = '8b649314aa4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Maximum body length for a memo entry.
MEMO_BODY_MAX_LENGTH = 10000

# create_type=False: we manage CREATE/DROP ourselves so create_table
# does not emit a redundant CREATE TYPE.
MEMO_PARENT_TYPE = pg_ENUM('concourse', 'study', name='memoparenttype', create_type=False)
# Separate handle used for explicit create/drop calls.
MEMO_PARENT_TYPE_MANAGED = sa.Enum('concourse', 'study', name='memoparenttype')


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    MEMO_PARENT_TYPE_MANAGED.create(bind, checkfirst=True)

    op.create_table(
        'memo_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('parent_type', MEMO_PARENT_TYPE, nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.String(length=10000), nullable=False, server_default=''),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('last_edited_by', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index(
        'ix_memo_entries_parent_position',
        'memo_entries',
        ['parent_type', 'parent_id', 'position'],
    )

    op.create_table(
        'memo_comments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('entry_id', sa.Integer(),
                  sa.ForeignKey('memo_entries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('body', sa.String(length=2000), nullable=False),
        sa.Column('mentions', sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column('resolved', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(
        'ix_memo_comments_entry_created',
        'memo_comments',
        ['entry_id', 'created_at'],
    )

    # ---- Data step: migrate existing free-text memos -----------------
    too_long = bind.execute(sa.text("""
        SELECT
            (SELECT COUNT(*) FROM concourses
             WHERE char_length(COALESCE(construction_memo, '')) > 10000)
            +
            (SELECT COUNT(*) FROM studies
             WHERE char_length(COALESCE(methodology_memo, '')) > 10000)
    """)).scalar()
    if too_long and too_long > 0:
        raise RuntimeError(
            "One or more existing memos exceed the new 10000-char cap. "
            "Split the content manually before re-running this migration."
        )

    bind.execute(sa.text("""
        INSERT INTO memo_entries
            (parent_type, parent_id, title, body, position,
             created_at, updated_at, created_by, last_edited_by)
        SELECT 'concourse', id, 'Notes', construction_memo, 0,
               now(), now(), NULL, NULL
        FROM concourses
        WHERE TRIM(COALESCE(construction_memo, '')) <> ''
    """))
    bind.execute(sa.text("""
        INSERT INTO memo_entries
            (parent_type, parent_id, title, body, position,
             created_at, updated_at, created_by, last_edited_by)
        SELECT 'study', id, 'Notes', methodology_memo, 0,
               now(), now(), NULL, NULL
        FROM studies
        WHERE TRIM(COALESCE(methodology_memo, '')) <> ''
    """))

    op.drop_column('concourses', 'construction_memo')
    op.drop_column('studies', 'methodology_memo')


def downgrade() -> None:
    """Downgrade schema.

    Re-creates the dropped columns and writes back the body of the entry
    titled 'Notes' (position 0) per parent. Data created post-upgrade in
    other entries or in comments is lost.
    """
    op.add_column(
        'concourses',
        sa.Column('construction_memo', sa.String(), nullable=True),
    )
    op.add_column(
        'studies',
        sa.Column('methodology_memo', sa.String(), nullable=True),
    )

    bind = op.get_bind()
    bind.execute(sa.text("""
        UPDATE concourses c
        SET construction_memo = e.body
        FROM memo_entries e
        WHERE e.parent_type = 'concourse'
          AND e.parent_id = c.id
          AND e.position = 0
          AND e.title = 'Notes'
    """))
    bind.execute(sa.text("""
        UPDATE studies s
        SET methodology_memo = e.body
        FROM memo_entries e
        WHERE e.parent_type = 'study'
          AND e.parent_id = s.id
          AND e.position = 0
          AND e.title = 'Notes'
    """))

    op.drop_index('ix_memo_comments_entry_created', table_name='memo_comments')
    op.drop_table('memo_comments')
    op.drop_index('ix_memo_entries_parent_position', table_name='memo_entries')
    op.drop_table('memo_entries')

    MEMO_PARENT_TYPE_MANAGED.drop(op.get_bind(), checkfirst=True)
