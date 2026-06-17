"""remove email otp 2fa channel

Revision ID: f7c124e0ec1e
Revises: 60af83267ba5
Create Date: 2026-06-15 06:43:08.163836

Removes the email-OTP 2FA channel, leaving only the TOTP authenticator-app
channel. Users currently enrolled on the email channel have no TOTP secret
(it was discarded at enrolment), so they would be permanently locked out
once the email path is gone. The data step disables 2FA for those accounts
so they fall back to password-only login and can re-enrol with an app.

The `users.totp_channel` column is intentionally kept (frozen to 'app' /
NULL); only the `twofa_email_otp_codes` table is dropped.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7c124e0ec1e'
down_revision: Union[str, Sequence[str], None] = '60af83267ba5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Data step: disable 2FA for accounts enrolled on the (now removed)
    # email channel. They carry no TOTP secret, so leaving is_totp_enabled
    # set would lock them out at the next login.
    op.execute(
        "UPDATE users SET is_totp_enabled = false, totp_secret = NULL, "
        "totp_channel = NULL WHERE totp_channel = 'email'"
    )
    op.drop_index(
        op.f('ix_twofa_email_otp_codes_user_id'),
        table_name='twofa_email_otp_codes',
    )
    op.drop_index(
        'ix_twofa_email_otp_codes_user_active',
        table_name='twofa_email_otp_codes',
        postgresql_where='used_at IS NULL',
    )
    op.drop_table('twofa_email_otp_codes')


def downgrade() -> None:
    """Downgrade schema.

    Recreates the table structure only. The data step (disabled email-channel
    accounts) is not reversible — those users stay disabled.
    """
    op.create_table(
        'twofa_email_otp_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('code_hash', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'attempts',
            sa.Integer(),
            nullable=False,
            server_default=sa.text('0'),
        ),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_twofa_email_otp_codes_user_active',
        'twofa_email_otp_codes',
        ['user_id'],
        unique=False,
        postgresql_where='used_at IS NULL',
    )
    op.create_index(
        op.f('ix_twofa_email_otp_codes_user_id'),
        'twofa_email_otp_codes',
        ['user_id'],
        unique=False,
    )
