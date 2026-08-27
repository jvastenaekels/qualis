"""add_pending_email_column

Revision ID: a3f1c2e9b4d7
Revises: cb2c7f6f0cfe
Create Date: 2026-05-03 11:30:00.000000

Adds ``users.pending_email`` (nullable VARCHAR) to support the email-change
dual-confirmation flow introduced for F-03-011. The column is purely additive
and starts NULL on every row; no data backfill is required.

The flow:

1. ``PATCH /me`` with a new email writes the requested address to
   ``pending_email`` (instead of overwriting ``email``) and emails a
   confirmation token to the new address and a cancellation token to
   the old one.
2. ``POST /email-change/confirm`` with a valid token swaps
   ``email <- pending_email`` and clears ``pending_email``.
3. ``POST /email-change/cancel`` clears ``pending_email`` without
   touching ``email``.

A second ``PATCH /me`` with a different new email replaces the pending
request — the prior confirmation token then mismatches ``pending_email``
at consume time and is rejected.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f1c2e9b4d7'
down_revision: Union[str, Sequence[str], None] = 'cb2c7f6f0cfe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'users',
        sa.Column('pending_email', sa.String(length=254), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'pending_email')
