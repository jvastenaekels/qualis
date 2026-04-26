"""drop participants.is_test_run column

Revision ID: b3a47d8e9f12
Revises: 090c4286d21a
Create Date: 2026-04-26 11:00:00.000000

Removes the vestigial `is_test_run` column from `participants`. The
column existed to flag pilot/test submissions for exclusion from
analysis and exports, but pilot mode in the current frontend
short-circuits in the browser (`useSubmitStudy.ts`) and never reaches
the database — so no new `is_test_run=TRUE` rows are created.

Migration first deletes any legacy `is_test_run=TRUE` rows (cascading
to qsort_entries and audio_recordings via FK ON DELETE CASCADE; S3
audio cleanup must be done out of band before applying this migration
if you have legacy pilot rows). Then drops the column itself.

Downgrade re-adds the column as a nullable boolean defaulting to FALSE
(the originally deleted rows are not recoverable).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3a47d8e9f12'
down_revision: Union[str, Sequence[str], None] = '090c4286d21a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop legacy is_test_run rows, then drop the column."""
    op.execute("DELETE FROM participants WHERE is_test_run = TRUE")
    op.drop_column('participants', 'is_test_run')


def downgrade() -> None:
    """Re-add the column as nullable boolean default false."""
    op.add_column(
        'participants',
        sa.Column(
            'is_test_run',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
