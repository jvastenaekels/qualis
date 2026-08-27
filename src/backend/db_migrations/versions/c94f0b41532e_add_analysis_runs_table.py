"""add analysis_runs table

Revision ID: c94f0b41532e
Revises: d4e5f6a7b8c9
Create Date: 2026-04-25 10:52:38.606110

Adds the analysis_runs table to persist Q-method factor analysis
executions with their analytical choices and full result. Supports the
critical Q-methodology audit-trail requirement (Stainton Rogers 1997;
Watts & Stenner 2012; Sneegas 2020).

NOTE: autogenerate also surfaced unrelated drift (workspace→project
index renames, resume_code constraint format change). Those are tracked
under audit findings F-05-001 and similar and will be addressed in a
separate dedicated migration. They are intentionally NOT included here.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c94f0b41532e'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'analysis_runs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('study_id', sa.Integer(), nullable=False),
        sa.Column('ran_by_user_id', sa.Integer(), nullable=True),
        sa.Column(
            'ran_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('extraction_method', sa.String(length=20), nullable=False),
        sa.Column('n_factors', sa.SmallInteger(), nullable=False),
        sa.Column('rotation_method', sa.String(length=20), nullable=False),
        sa.Column('flagging_mode', sa.String(length=20), nullable=False),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('result', sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ['ran_by_user_id'], ['users.id'], ondelete='SET NULL'
        ),
        sa.ForeignKeyConstraint(
            ['study_id'], ['studies.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_analysis_runs_id'), 'analysis_runs', ['id'], unique=False
    )
    op.create_index(
        op.f('ix_analysis_runs_ran_at'),
        'analysis_runs',
        ['ran_at'],
        unique=False,
    )
    op.create_index(
        op.f('ix_analysis_runs_ran_by_user_id'),
        'analysis_runs',
        ['ran_by_user_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_analysis_runs_study_id'),
        'analysis_runs',
        ['study_id'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_analysis_runs_study_id'), table_name='analysis_runs')
    op.drop_index(
        op.f('ix_analysis_runs_ran_by_user_id'), table_name='analysis_runs'
    )
    op.drop_index(op.f('ix_analysis_runs_ran_at'), table_name='analysis_runs')
    op.drop_index(op.f('ix_analysis_runs_id'), table_name='analysis_runs')
    op.drop_table('analysis_runs')
