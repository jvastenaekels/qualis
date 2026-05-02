"""fix_password_changed_at_default

Revision ID: fd88287d3f9b
Revises: cb8732294475
Create Date: 2026-05-02 17:38:07.226240

The previous migration (cb8732294475) added users.password_changed_at as
nullable=True (no server_default), backfilled existing rows with NOW(), then
alter_column'd to NOT NULL — never adding a DDL-level server_default. As a
result, any INSERT that omits password_changed_at fails the NOT NULL constraint.
This migration re-asserts server_default=NOW() at the DDL level so future
inserts (including raw SQL and any path that bypasses the ORM-side default)
succeed.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fd88287d3f9b'
down_revision: Union[str, Sequence[str], None] = 'cb8732294475'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        'users',
        'password_changed_at',
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=sa.text('now()'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        'users',
        'password_changed_at',
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=None,
    )
