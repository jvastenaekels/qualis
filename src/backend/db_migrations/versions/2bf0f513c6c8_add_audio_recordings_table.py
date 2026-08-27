"""Add audio_recordings table

Revision ID: 2bf0f513c6c8
Revises: a64b4724fcb8
Create Date: 2026-02-08 22:24:56.046123

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2bf0f513c6c8"
down_revision: Union[str, Sequence[str], None] = "a64b4724fcb8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "audio_recordings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("participant_id", sa.Integer(), nullable=False),
        sa.Column("question_key", sa.String(), nullable=False),
        sa.Column("s3_bucket", sa.String(), nullable=False),
        sa.Column("s3_key", sa.String(), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["participant_id"], ["participants.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "participant_id", "question_key", name="uq_participant_question_audio"
        ),
    )
    op.create_index(
        op.f("ix_audio_recordings_id"), "audio_recordings", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_audio_recordings_participant_id"),
        "audio_recordings",
        ["participant_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_audio_recordings_s3_key"), "audio_recordings", ["s3_key"], unique=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_audio_recordings_s3_key"), table_name="audio_recordings")
    op.drop_index(
        op.f("ix_audio_recordings_participant_id"), table_name="audio_recordings"
    )
    op.drop_index(op.f("ix_audio_recordings_id"), table_name="audio_recordings")
    op.drop_table("audio_recordings")
