"""Normalise presort_config to the wrapped {"enabled", "fields"} shape.

Revision ID: fc237d2414c2
Revises: d2a989f21f92

Before the pre-sort on/off switch existed, studies.presort_config held
the field map itself:

    {"age": {...}, "gender": {...}}

Since the switch, the designer writes:

    {"enabled": true, "fields": {"age": {...}, "gender": {...}}}

Both shapes coexisted in stored rows and every reader (export, activation
checks, the frontend designer) told them apart by sniffing keys. This
migration rewrites every row to the wrapped form with the exact rule the
readers used — "fields" present: already wrapped; else "enabled" present:
wrapped without fields; else the dict is the field map — so that, from
here on, PresortConfig (app/schemas/studies.py) is the only place the
rule lives and readers take config["fields"].

Data-only. Rows are read and written one by one in Python because the
column is JSON, not JSONB, so no operator can do it in SQL. Idempotent:
an already-wrapped row is written back unchanged. The rule is duplicated
here on purpose — a migration must not import application code that will
keep changing — and tests/unit/test_presort_config_shape.py pins the two
copies together.

Downgrade is a no-op: the pre-change readers accepted the wrapped form.
"""

from __future__ import annotations

import json
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'fc237d2414c2'
down_revision: Union[str, Sequence[str], None] = 'd2a989f21f92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def canonical_presort_config(raw: Any) -> dict[str, Any]:
    """The rule, verbatim from the readers this migration retires."""
    if not isinstance(raw, dict):
        return {"enabled": True, "fields": {}}
    if "fields" in raw or "enabled" in raw:
        out = dict(raw)
        out.setdefault("enabled", True)
        out.setdefault("fields", {})
        return out
    return {"enabled": True, "fields": raw}


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, presort_config FROM studies WHERE presort_config IS NOT NULL")
    ).fetchall()
    for study_id, raw in rows:
        current = json.loads(raw) if isinstance(raw, str) else raw
        wrapped = canonical_presort_config(current)
        if wrapped != current:
            conn.execute(
                sa.text("UPDATE studies SET presort_config = :cfg WHERE id = :id"),
                {"cfg": json.dumps(wrapped), "id": study_id},
            )


def downgrade() -> None:
    """No-op: the wrapped form was already readable before this revision."""
