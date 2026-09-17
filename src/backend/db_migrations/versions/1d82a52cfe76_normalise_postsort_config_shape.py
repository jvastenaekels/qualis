"""Normalise postsort_config so questions always sit under "questions".

Revision ID: 1d82a52cfe76
Revises: fc237d2414c2

The oldest studies stored the post-sort question map at the root of the
column:

    {"comment": {"type": "text", ...}}

Every study since carries settings at the root (extreme_columns, prompts,
audio, consent switches, …) and questions under "questions". The export
told the two apart with "no extreme_columns key → the dict is the question
map", which misreads a settings-only config: the create dialog writes
{"email": {...}, "consent": {...}} and the export turned those two
settings into question columns.

This migration applies a structural rule instead: a config is a flat
question map only when it is non-empty, has no "questions" key, and every
value is a dict carrying a "type". Everything else keeps its keys and
gains an empty "questions". From here on PostsortConfig
(app/schemas/studies.py) is the only place the rule lives.

Data-only, row by row in Python (JSON column, not JSONB), idempotent. The
rule is duplicated here on purpose — a migration must not import
application code that will keep changing — and
tests/unit/test_postsort_config_shape.py pins the two copies together.

Downgrade is a no-op: the wrapped form was already readable before.
"""

from __future__ import annotations

import json
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '1d82a52cfe76'
down_revision: Union[str, Sequence[str], None] = 'fc237d2414c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def canonical_postsort_config(raw: Any) -> dict[str, Any]:
    """The rule, identical to PostsortConfig's before-validator."""
    if not isinstance(raw, dict):
        return {"questions": {}}
    if "questions" in raw:
        return dict(raw)
    is_flat_question_map = bool(raw) and all(
        isinstance(v, dict) and "type" in v for v in raw.values()
    )
    if is_flat_question_map:
        return {"questions": raw}
    return {**raw, "questions": {}}


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, postsort_config FROM studies WHERE postsort_config IS NOT NULL")
    ).fetchall()
    for study_id, raw in rows:
        current = json.loads(raw) if isinstance(raw, str) else raw
        wrapped = canonical_postsort_config(current)
        if wrapped != current:
            conn.execute(
                sa.text("UPDATE studies SET postsort_config = :cfg WHERE id = :id"),
                {"cfg": json.dumps(wrapped), "id": study_id},
            )


def downgrade() -> None:
    """No-op: the wrapped form was already readable before this revision."""
