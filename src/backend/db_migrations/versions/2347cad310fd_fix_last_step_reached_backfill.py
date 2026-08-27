"""fix_last_step_reached_backfill

The initial backfill in f7a3b2c19d45 set last_step_reached=1 for all
non-completed participants. This corrects it by inferring actual progress
from existing data (qsort_entries → step 4, presort_answers → step 2).

Revision ID: 2347cad310fd
Revises: f7a3b2c19d45
Create Date: 2026-02-19 14:47:34.757475

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "2347cad310fd"
down_revision: Union[str, Sequence[str], None] = "f7a3b2c19d45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Participants who have qsort_entries reached at least step 4 (fine sort)
    op.execute(
        """
        UPDATE participants SET last_step_reached = 4
        WHERE status != 'completed'
          AND last_step_reached < 4
          AND id IN (SELECT DISTINCT participant_id FROM qsort_entries)
        """
    )
    # Participants with presort_answers reached at least step 2 (pre-sort)
    op.execute(
        """
        UPDATE participants SET last_step_reached = 2
        WHERE status != 'completed'
          AND last_step_reached < 2
          AND presort_answers IS NOT NULL
          AND presort_answers::text != '{}'
          AND presort_answers::text != 'null'
        """
    )


def downgrade() -> None:
    # Revert to the original naive backfill
    op.execute(
        """
        UPDATE participants SET last_step_reached = 1
        WHERE status != 'completed'
        """
    )
