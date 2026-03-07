"""merge concourse and workspace_rename branches

Revision ID: 4a1719a5ad2f
Revises: c8d9e0f1a2b3, d4e5f6a7b8c9
Create Date: 2026-03-07 14:00:46.819323

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4a1719a5ad2f'
down_revision: Union[str, Sequence[str], None] = ('c8d9e0f1a2b3', 'd4e5f6a7b8c9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
