"""add_auth_email_flows

Revision ID: cb8732294475
Revises: 36fea97cbbb6
Create Date: 2026-05-02 13:07:03.569615

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cb8732294475'
down_revision: Union[str, Sequence[str], None] = '36fea97cbbb6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # New tables
    op.create_table('consumed_email_tokens',
    sa.Column('jti', sa.String(), nullable=False),
    sa.Column('purpose', sa.String(), nullable=False),
    sa.Column('consumed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('jti')
    )
    op.create_table('twofa_email_otp_codes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('code_hash', sa.String(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False, server_default=sa.text('0')),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_twofa_email_otp_codes_user_active', 'twofa_email_otp_codes', ['user_id'], unique=False, postgresql_where='used_at IS NULL')
    op.create_index(op.f('ix_twofa_email_otp_codes_user_id'), 'twofa_email_otp_codes', ['user_id'], unique=False)

    # New columns on users
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('totp_channel', sa.String(), nullable=True))
    op.add_column('users', sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True))

    # Backfill existing rows so live accounts don't break.
    op.execute("UPDATE users SET email_verified_at = NOW() WHERE email_verified_at IS NULL")
    op.execute("UPDATE users SET totp_channel = 'app' WHERE is_totp_enabled = true AND totp_channel IS NULL")
    op.execute("UPDATE users SET password_changed_at = NOW() WHERE password_changed_at IS NULL")

    # Enforce NOT NULL after backfill
    op.alter_column('users', 'password_changed_at', nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'password_changed_at')
    op.drop_column('users', 'totp_channel')
    op.drop_column('users', 'email_verified_at')
    op.drop_index(op.f('ix_twofa_email_otp_codes_user_id'), table_name='twofa_email_otp_codes')
    op.drop_index('ix_twofa_email_otp_codes_user_active', table_name='twofa_email_otp_codes', postgresql_where='used_at IS NULL')
    op.drop_table('twofa_email_otp_codes')
    op.drop_table('consumed_email_tokens')
