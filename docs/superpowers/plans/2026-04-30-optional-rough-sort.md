# Optional Rough Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the participant rough-sort step (3-pile triage: agree / neutral / disagree) optional per-study, controlled by a `Study.rough_sort_enabled` flag. When disabled, the participant goes directly from the pre-sort questionnaire to the fine-sort grid via a horizontally-scrollable deck. Admin views and exports adapt automatically; in-flight participants are protected by locking the toggle once any session has started.

**Architecture:** Single boolean column on `Study` is canonical. Backend validates state-machine transitions (rejects `last_step_reached=3` if disabled); frontend derives display via a centralised `getEnabledSteps(study)` utility. Admin views (`InteractiveDataView`, `RecentActivityCard`, `ParticipantDetailsPage`, `HelpOverlay`) and the participant router consume the utility. The toggle locks once `participants` exist with non-default `last_step_reached`.

**Tech Stack:** Backend — FastAPI, SQLAlchemy async, Alembic, Pydantic. Frontend — React 19 + TypeScript strict, Tailwind, dnd-kit, Vitest, react-router. Toolchain — `uv`, `make ci-fast` (~38s) between every change, `make ci` before PR, `make generate-api` after backend schema changes.

**Reference:**
- Empirical motivation: Dieteren et al. 2023 (n=613 Q-method studies) — only 37.9% use the pre-sort piling step.
- Codex stress-test (2026-04-30): backend must remain canonical for state-machine; PR 2 must include `rough_sort_enabled=false` fixtures or the refactor is invisible; in-flight participants must be protected.

**Plan-time decisions:**
- **Lock policy** is "**lock once any participant has `last_step_reached > 1`**" (i.e. went past consent). Studies with only consented participants who haven't started the survey can still flip. UI banner explains the lock with a count.
- **Toggle is editable** in `draft` and `active` states; ignored elsewhere (paused/archived/completed). Lock check is on top.
- **No parallel "deck" component.** The existing FineSort UI already has a `deck-cards-container` (the area for unplaced cards). Deck-only mode REUSES this container, only changing its internal organisation: 3 grouped sub-lists (agree/neutral/disagree) → 1 flat list. Drag-and-drop, placement, validation: unchanged. This is the **safest refactor** for the fragile FineSort UI.
- **`_DRAFT_ALLOWED_KEYS` = `{"presort", "rough", "qsort", "postsort"}` stays as-is.** When `rough_sort_enabled=false`, a draft containing a `rough` key is silently ignored (not rejected) — keeps backwards compatibility with stale clients.
- **Migration default** = `True` for all existing rows (backwards-compat). New studies default to `True` from Pydantic.
- **i18n** keys live under `admin.study_design.rough_sort.*` and `participant.fine_sort.flat_deck.*`.
- **No new export columns.** Participants in flat-deck mode have empty `presort_answers` (already handled) and the rough_pile per-statement column is `null` for them — existing export schema absorbs this.

**Fragility-aware testing strategy:** FineSort has 8 existing test files — `FineSortPage.{test,mobile.test,desktop.test,integration.test,reconciliation.test}.tsx`, `useFineSort.test.ts`, plus `RoughSortPage.{test,integration.test}.tsx`. Every Phase 3 task that touches FineSort MUST run **all 8 files in both modes** (rough enabled + disabled fixtures), not just `make ci-fast`. A new Task 18.5 (pre-flight contract inventory) inventories every behaviour those tests assert, so the refactor preserves each contract.

**Form-factor coverage (REQUIRED).** FineSort is responsive — `ViewportContext` swaps layouts based on `window.visualViewport`. The plan must verify behaviour across **four form factors × two modes × two distribution shapes** (forced + flexible), not just "mobile/desktop":

| Form factor | Width range | Notes |
|---|---|---|
| Mobile portrait | ≤ 640px | Tap-to-Swap interaction (mobile.test.tsx) |
| Mobile landscape | 480-896 landscape | Horizontal screen, low height — deck overflow critical |
| Tablet portrait | 641-1024 portrait | Hybrid: drag works but constrained vertical space |
| Tablet landscape | 768-1366 landscape | Closest to desktop; `lg:grid-cols-2` deck applies |
| Desktop | > 1024px | Two-column deck (desktop.test.tsx) |

Task 18.5 adds **viewport rotation tests** via `Object.defineProperty(window, 'innerWidth', ...)` + `window.dispatchEvent(new Event('resize'))` for each form factor. Task 22.5 (manual smoke matrix) gates PR 3 on a **20-cell verification** (5 form factors × 2 modes × 2 distributions) before merge — including device rotation mid-flow (mid-sort rotation must not lose card state).

---

## File structure

### Backend — created
- `backend/db_migrations/versions/<auto-id>_add_rough_sort_enabled.py` — adds column, defaults existing to True
- `backend/app/utils/study_flow.py` — `validate_step_transition()` state-machine helper
- `backend/tests/integration/test_study_flow_validation.py`
- `backend/tests/integration/test_rough_sort_toggle_lock.py`
- `backend/tests/integration/test_study_defaults_rough_disabled.py`

### Backend — modified
- `backend/app/models/study.py` — add `rough_sort_enabled: Mapped[bool]` column
- `backend/app/schemas/studies.py` — add field to `StudyRead`, `StudyCreate`, `StudyUpdate`; default True
- `backend/app/services/study_service.py` — toggle-lock validation in `update_study`
- `backend/app/services/study_defaults.py` — `build_process_steps(rough_enabled, locale)` + filtered `step_help` and `methodology_tips`
- `backend/app/services/submission_service.py` — call `validate_step_transition` before persisting `last_step_reached`
- `backend/app/schemas/participants.py:175-192` — silently drop `rough` key from drafts when study has `rough_sort_enabled=false`
- `backend/pyproject.toml` — add `app.utils.study_flow` to `[[tool.mypy.overrides]]`

### Frontend — created
- `frontend/src/utils/studySteps.ts` — `getEnabledSteps(study)`, `StepDescriptor` type, helpers
- `frontend/src/utils/studySteps.test.ts`
- `frontend/src/components/participant/StatementDeck.tsx` — horizontal scrollable deck for fine-sort
- `frontend/src/components/participant/StatementDeck.test.tsx`
- `frontend/src/hooks/admin/useRoughSortLock.ts` — computes lock status from participants count
- `frontend/src/hooks/admin/useRoughSortLock.test.ts`
- `frontend/e2e/participant/fine-sort-no-rough.spec.ts`

### Frontend — modified
- `frontend/src/api/generated.ts` — regenerated via `make generate-api`
- `frontend/src/components/admin/dashboard/InteractiveDataView.tsx` — replace `STEP_LABEL_KEYS` constant with `getEnabledSteps(study)`
- `frontend/src/components/admin/dashboard/RecentActivityCard.tsx` — replace `STEP_INFO` with `getEnabledSteps(study)` + dynamic progress %
- `frontend/src/pages/admin/ParticipantDetailsPage.tsx` — timeline derived from enabled steps
- `frontend/src/pages/admin/StudyDesignPage.tsx` — toggle UI in methodology section
- `frontend/src/pages/admin/AnalysisPage.tsx` — verify/touch if it references step 3 (audit step)
- `frontend/src/components/study/HelpOverlay.tsx:34-44` — derive `stepIdMap` from enabled steps
- `frontend/src/hooks/participant/useFineSort.ts` — branch on `rough_sort_enabled`: deck mode vs piles mode
- `frontend/src/pages/FineSortPage.tsx` — render `StatementDeck` when deck mode
- `frontend/src/App.tsx:249` — guard `/rough-sort` route, redirect to `/fine-sort` when disabled
- `frontend/public/locales/{en,fr,fi}/translation.json` — new keys for toggle + deck + lock banner
- `frontend/src/store/useResponseStore.ts` — guard `categorizeCard` no-op when deck mode (keep slice for backwards-compat)

---

# Phase 1 — Foundation (PR 1)

**Goal:** Add the canonical column, backend state-machine validation, defaults builder, and the frontend `getEnabledSteps` utility. **No behaviour change visible to users**: all existing studies default to `rough_sort_enabled=True`, the participant flow is unchanged, no admin UI for the toggle yet.

**Test target after Phase 1:** `make ci` green; `getEnabledSteps()` covered for both modes; backend rejects an attempted `last_step_reached=3` when flag is false; defaults builder generates 4-step or 5-step process_steps depending on flag.

## Task 1: Add column + migration

**Files:**
- Modify: `backend/app/models/study.py`
- Create: `backend/db_migrations/versions/<auto-id>_add_rough_sort_enabled.py`

- [ ] **Step 1.1: Read current head migration**

```bash
cd /home/julien/tools/qualis/backend && .venv/bin/alembic heads
```

Expected: `db2ad904b167 (head)` (or the current head — record it for `down_revision`).

- [ ] **Step 1.2: Add column to model**

In `backend/app/models/study.py`, after `symmetry_lock` (line ~65) and before `distribution_mode`:

```python
    rough_sort_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
```

Ensure `text` is imported from `sqlalchemy` at the top of the file.

- [ ] **Step 1.3: Generate the migration**

```bash
cd /home/julien/tools/qualis/backend
.venv/bin/alembic revision --autogenerate -m "add rough_sort_enabled flag to studies"
```

- [ ] **Step 1.4: Review and clean the generated migration**

Open the generated file. The body must contain ONLY:

```python
"""add rough_sort_enabled flag to studies

Revises: db2ad904b167
Create Date: 2026-04-30 ...

"""

from alembic import op
import sqlalchemy as sa


revision = "<auto-id>"
down_revision = "db2ad904b167"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "studies",
        sa.Column(
            "rough_sort_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("studies", "rough_sort_enabled")
```

Delete any unrelated autogen noise (other tables, indexes Alembic invented).

- [ ] **Step 1.5: Apply migration locally**

```bash
cd /home/julien/tools/qualis/backend && .venv/bin/alembic upgrade head
```

Expected: one line "INFO  [alembic.runtime.migration] Running upgrade db2ad904b167 -> <new>".

- [ ] **Step 1.6: Verify mypy stays green**

```bash
cd /home/julien/tools/qualis && make lint
```

Expected: no new errors.

- [ ] **Step 1.7: Commit**

```bash
cd /home/julien/tools/qualis
git add backend/app/models/study.py backend/db_migrations/versions/*_add_rough_sort_enabled.py
git commit -m "feat(study): add rough_sort_enabled column (default True)"
```

## Task 2: Pydantic schema fields

**Files:**
- Modify: `backend/app/schemas/studies.py`

- [ ] **Step 2.1: Locate StudyBase / StudyRead / StudyCreate / StudyUpdate**

```bash
grep -nE "class Study(Base|Read|Create|Update)" /home/julien/tools/qualis/backend/app/schemas/studies.py
```

- [ ] **Step 2.2: Add field to StudyBase (or wherever shared fields live)**

Add to the shared base, after `symmetry_lock`:

```python
    rough_sort_enabled: bool = Field(
        default=True,
        description="Enable the rough-sort step (3-pile triage). When False, "
        "participants go directly from pre-sort to fine-sort.",
    )
```

For `StudyUpdate`, the field must be `Optional[bool] = None` (PATCH semantics).

- [ ] **Step 2.3: Run schema tests**

```bash
cd /home/julien/tools/qualis/backend && .venv/bin/pytest tests/unit/schemas -x -q
```

Expected: PASS (or no test exists; that's fine — new field has a default).

- [ ] **Step 2.4: Commit**

```bash
git add backend/app/schemas/studies.py
git commit -m "feat(study): expose rough_sort_enabled in study schemas"
```

## Task 3: State-machine validator (TDD)

**Files:**
- Create: `backend/app/utils/study_flow.py`
- Create: `backend/tests/integration/test_study_flow_validation.py`

- [ ] **Step 3.1: Write the failing test**

In `backend/tests/integration/test_study_flow_validation.py`:

```python
import pytest

from app.utils.study_flow import (
    InvalidStepTransition,
    validate_step_transition,
)


def test_step_3_rejected_when_rough_disabled():
    with pytest.raises(InvalidStepTransition):
        validate_step_transition(
            current_step=2, target_step=3, rough_sort_enabled=False
        )


def test_step_3_allowed_when_rough_enabled():
    validate_step_transition(
        current_step=2, target_step=3, rough_sort_enabled=True
    )


def test_step_4_from_step_2_when_rough_disabled():
    validate_step_transition(
        current_step=2, target_step=4, rough_sort_enabled=False
    )


def test_step_4_from_step_2_rejected_when_rough_enabled():
    with pytest.raises(InvalidStepTransition):
        validate_step_transition(
            current_step=2, target_step=4, rough_sort_enabled=True
        )


def test_backward_transitions_always_allowed():
    validate_step_transition(
        current_step=4, target_step=2, rough_sort_enabled=True
    )
    validate_step_transition(
        current_step=4, target_step=2, rough_sort_enabled=False
    )
```

- [ ] **Step 3.2: Run test — should fail**

```bash
cd /home/julien/tools/qualis/backend && .venv/bin/pytest tests/integration/test_study_flow_validation.py -v
```

Expected: ImportError on `app.utils.study_flow`.

- [ ] **Step 3.3: Implement the validator**

Create `backend/app/utils/study_flow.py`:

```python
"""State-machine validation for participant flow steps.

Steps: 1=consent, 2=presort, 3=rough sort, 4=fine sort, 5=post-sort.
When `rough_sort_enabled=False`, step 3 is skipped and the canonical
forward sequence is 1 -> 2 -> 4 -> 5.
"""
from __future__ import annotations


class InvalidStepTransition(ValueError):
    """Raised when a step transition is not permitted by the study's flow."""


def enabled_steps(rough_sort_enabled: bool) -> tuple[int, ...]:
    if rough_sort_enabled:
        return (1, 2, 3, 4, 5)
    return (1, 2, 4, 5)


def validate_step_transition(
    *, current_step: int, target_step: int, rough_sort_enabled: bool
) -> None:
    """Raise InvalidStepTransition if target_step is not reachable.

    Backward transitions are always allowed (resume / replay scenarios).
    Forward transitions must follow the enabled-steps sequence.
    """
    if target_step <= current_step:
        return
    allowed = enabled_steps(rough_sort_enabled)
    if target_step not in allowed:
        raise InvalidStepTransition(
            f"Step {target_step} is not enabled for this study "
            f"(allowed: {allowed})"
        )
```

- [ ] **Step 3.4: Run test — should pass**

```bash
.venv/bin/pytest tests/integration/test_study_flow_validation.py -v
```

Expected: 5 PASS.

- [ ] **Step 3.5: Add module to mypy strict overrides**

In `backend/pyproject.toml`, locate the `[[tool.mypy.overrides]]` block listing strict modules, and add:

```toml
[[tool.mypy.overrides]]
module = "app.utils.study_flow"
disallow_any_explicit = true
disallow_untyped_defs = true
warn_return_any = true
strict_equality = true
```

- [ ] **Step 3.6: Commit**

```bash
cd /home/julien/tools/qualis
git add backend/app/utils/study_flow.py backend/tests/integration/test_study_flow_validation.py backend/pyproject.toml
git commit -m "feat(study): add validate_step_transition for rough-sort flag"
```

## Task 4: Wire validator into submission_service

**Files:**
- Modify: `backend/app/services/submission_service.py`
- Modify: `backend/tests/integration/test_study_flow_validation.py` (add integration test)

- [ ] **Step 4.1: Locate where last_step_reached is updated**

```bash
grep -n "last_step_reached" /home/julien/tools/qualis/backend/app/services/submission_service.py
```

Note the function(s) that write to this field.

- [ ] **Step 4.2: Add the integration test**

Append to `backend/tests/integration/test_study_flow_validation.py`:

```python
import pytest
from httpx import AsyncClient

from app.exceptions import HTTPBadRequest


@pytest.mark.asyncio
async def test_submission_rejects_step_3_when_rough_disabled(
    client: AsyncClient, study_factory, participant_factory
):
    study = await study_factory(rough_sort_enabled=False, state="active")
    participant = await participant_factory(study=study, last_step_reached=2)

    resp = await client.post(
        f"/api/participate/{study.slug}/submit-step",
        json={"step": 3, "draft": {"rough": {"agree": [], "neutral": [], "disagree": []}}},
        headers={"X-Participant-Id": str(participant.id)},
    )

    assert resp.status_code == 400
    assert "step 3" in resp.json()["detail"].lower()
```

(Use the project's actual API path and headers — check `backend/app/routers/submissions.py` and `backend/tests/integration/conftest.py` for the correct fixtures and route.)

- [ ] **Step 4.3: Run test — should fail**

```bash
.venv/bin/pytest tests/integration/test_study_flow_validation.py::test_submission_rejects_step_3_when_rough_disabled -v
```

Expected: FAIL with 200 or 422 (currently passes silently).

- [ ] **Step 4.4: Wire the validator**

In `submission_service.py`, before `participant.last_step_reached = ...`:

```python
from ..utils.study_flow import (
    InvalidStepTransition,
    validate_step_transition,
)
from ..exceptions import HTTPBadRequest

try:
    validate_step_transition(
        current_step=participant.last_step_reached or 1,
        target_step=target_step,
        rough_sort_enabled=study.rough_sort_enabled,
    )
except InvalidStepTransition as exc:
    raise HTTPBadRequest(str(exc)) from exc
```

(Adapt variable names to match the surrounding code. Replace `target_step` with the local variable holding the requested next step.)

- [ ] **Step 4.5: Run test — should pass**

```bash
.venv/bin/pytest tests/integration/test_study_flow_validation.py -v
```

Expected: all PASS.

- [ ] **Step 4.6: Run all submission tests as a regression check**

```bash
.venv/bin/pytest tests/integration/test_submission*.py -v
```

Expected: PASS (existing tests use `rough_sort_enabled=True` default).

- [ ] **Step 4.7: Commit**

```bash
git add backend/app/services/submission_service.py backend/tests/integration/test_study_flow_validation.py
git commit -m "feat(study): enforce step transition flag in submission service"
```

## Task 5: Drafts validator silently drops rough when disabled

**Files:**
- Modify: `backend/app/schemas/participants.py`
- Modify: `backend/tests/integration/test_study_flow_validation.py`

- [ ] **Step 5.1: Add the failing test**

Append to the test file:

```python
@pytest.mark.asyncio
async def test_draft_with_rough_silently_dropped_when_disabled(
    client, study_factory, participant_factory
):
    study = await study_factory(rough_sort_enabled=False, state="active")
    participant = await participant_factory(study=study, last_step_reached=2)

    resp = await client.put(
        f"/api/participate/{study.slug}/draft",
        json={"presort": {"q1": "a"}, "rough": {"agree": [], "neutral": [], "disagree": []}},
        headers={"X-Participant-Id": str(participant.id)},
    )

    assert resp.status_code == 200
    refreshed = await participant_factory.refresh(participant)
    assert "rough" not in refreshed.draft_responses
    assert refreshed.draft_responses["presort"] == {"q1": "a"}
```

- [ ] **Step 5.2: Run test — should fail**

Expected: `rough` key persisted.

- [ ] **Step 5.3: Implement the silent drop**

In `backend/app/schemas/participants.py`, locate the validator that uses `_DRAFT_ALLOWED_KEYS` (around line 192). Adjust to the pattern: the schema accepts `rough` but the **service** layer drops it when the study has the flag off. So modify the draft-saving code in `submission_service.py` (or wherever drafts merge) instead:

```python
incoming = draft_payload.copy()
if not study.rough_sort_enabled:
    incoming.pop("rough", None)
participant.draft_responses = {**participant.draft_responses, **incoming}
```

- [ ] **Step 5.4: Run test — should pass**

```bash
.venv/bin/pytest tests/integration/test_study_flow_validation.py -v
```

- [ ] **Step 5.5: Commit**

```bash
git add backend/app/schemas/participants.py backend/app/services/submission_service.py backend/tests/integration/test_study_flow_validation.py
git commit -m "feat(study): drop rough draft key when rough_sort disabled"
```

## Task 6: study_defaults builder

**Files:**
- Modify: `backend/app/services/study_defaults.py`
- Create: `backend/tests/integration/test_study_defaults_rough_disabled.py`

- [ ] **Step 6.1: Write the failing test**

In `backend/tests/integration/test_study_defaults_rough_disabled.py`:

```python
from app.services.study_defaults import (
    build_process_steps,
    build_step_help,
    build_methodology_tips,
)


def test_process_steps_excludes_rough_when_disabled_en():
    steps = build_process_steps(rough_sort_enabled=False, locale="en")
    ids = [s["id"] for s in steps]
    assert "rough" not in ids
    assert ids == ["welcome", "consent", "presort", "fine", "post"]


def test_process_steps_includes_rough_when_enabled_fr():
    steps = build_process_steps(rough_sort_enabled=True, locale="fr")
    ids = [s["id"] for s in steps]
    assert "rough" in ids


def test_step_help_excludes_rough_key_when_disabled():
    help_dict = build_step_help(rough_sort_enabled=False, locale="en")
    assert "rough" not in help_dict
    assert "fine" in help_dict


def test_methodology_tips_drops_rough_specific_when_disabled():
    tips = build_methodology_tips(rough_sort_enabled=False, locale="en")
    joined = " ".join(tips).lower()
    assert "rough" not in joined
    assert "first impression" not in joined
```

- [ ] **Step 6.2: Run test — fails**

Expected: ImportError on `build_process_steps` etc.

- [ ] **Step 6.3: Refactor study_defaults.py**

Replace the existing module-level constants with builder functions. Keep the literal data as locale-keyed dicts inside the builders. Skeleton:

```python
from typing import Any

_PROCESS_STEPS_ALL: dict[str, list[dict[str, Any]]] = {
    "en": [
        {"id": "welcome", "icon": "Hand", "title": "Welcome", ...},
        {"id": "consent", "icon": "FileCheck", ...},
        {"id": "presort", "icon": "ClipboardList", ...},
        {"id": "rough", "icon": "Zap", "title": "First impressions", ...},
        {"id": "fine", "icon": "Grid", ...},
        {"id": "post", "icon": "MessageCircle", ...},
    ],
    "fr": [...],
    "fi": [...],
}

_STEP_HELP_ALL: dict[str, dict[str, dict[str, str]]] = {
    "en": {"rough": {...}, "fine": {...}, ...},
    ...
}

_METHODOLOGY_TIPS_ROUGH_SPECIFIC: set[str] = {
    # exact strings from the existing array that mention rough piling
}


def build_process_steps(
    *, rough_sort_enabled: bool, locale: str
) -> list[dict[str, Any]]:
    steps = _PROCESS_STEPS_ALL[locale]
    if rough_sort_enabled:
        return [s.copy() for s in steps]
    return [s.copy() for s in steps if s["id"] != "rough"]


def build_step_help(
    *, rough_sort_enabled: bool, locale: str
) -> dict[str, dict[str, str]]:
    help_dict = _STEP_HELP_ALL[locale]
    if rough_sort_enabled:
        return {k: v.copy() for k, v in help_dict.items()}
    return {k: v.copy() for k, v in help_dict.items() if k != "rough"}


def build_methodology_tips(
    *, rough_sort_enabled: bool, locale: str
) -> list[str]:
    tips = _METHODOLOGY_TIPS_ALL[locale]
    if rough_sort_enabled:
        return list(tips)
    return [t for t in tips if t not in _METHODOLOGY_TIPS_ROUGH_SPECIFIC.get(locale, set())]
```

(Move the existing literal data from the original constants into `_PROCESS_STEPS_ALL` etc. — preserve every string verbatim. Identify the methodology_tips entries that mention "rough" / "première impression" / "ensivaikutelma" and put them in the rough-specific set.)

- [ ] **Step 6.4: Update callers**

Find every existing caller:

```bash
grep -rnE "process_steps|step_help|methodology_tips" /home/julien/tools/qualis/backend/app --include="*.py" | grep -v study_defaults.py
```

Each call must pass `rough_sort_enabled=study.rough_sort_enabled, locale=study.default_language or "en"`.

- [ ] **Step 6.5: Run tests**

```bash
.venv/bin/pytest tests/integration/test_study_defaults_rough_disabled.py -v
.venv/bin/pytest tests/integration/test_study*.py -v
```

Expected: PASS for new tests; existing study tests untouched (default still `True`).

- [ ] **Step 6.6: Commit**

```bash
git add backend/app/services/study_defaults.py backend/tests/integration/test_study_defaults_rough_disabled.py
git commit -m "feat(study): conditional defaults builder for rough_sort flag"
```

## Task 7: Toggle-lock service validation

**Files:**
- Modify: `backend/app/services/study_service.py`
- Create: `backend/tests/integration/test_rough_sort_toggle_lock.py`

- [ ] **Step 7.1: Write failing tests**

In `backend/tests/integration/test_rough_sort_toggle_lock.py`:

```python
import pytest

from app.exceptions import HTTPBadRequest


@pytest.mark.asyncio
async def test_toggle_allowed_when_no_active_participants(
    study_service, study_factory
):
    study = await study_factory(rough_sort_enabled=True)
    updated = await study_service.update_study(
        study.id, {"rough_sort_enabled": False}
    )
    assert updated.rough_sort_enabled is False


@pytest.mark.asyncio
async def test_toggle_blocked_when_participants_started(
    study_service, study_factory, participant_factory
):
    study = await study_factory(rough_sort_enabled=True)
    await participant_factory(study=study, last_step_reached=2)

    with pytest.raises(HTTPBadRequest, match="locked"):
        await study_service.update_study(
            study.id, {"rough_sort_enabled": False}
        )


@pytest.mark.asyncio
async def test_toggle_allowed_when_only_consent_step_reached(
    study_service, study_factory, participant_factory
):
    study = await study_factory(rough_sort_enabled=True)
    await participant_factory(study=study, last_step_reached=1)

    updated = await study_service.update_study(
        study.id, {"rough_sort_enabled": False}
    )
    assert updated.rough_sort_enabled is False


@pytest.mark.asyncio
async def test_toggle_lock_count_returned_in_error(
    study_service, study_factory, participant_factory
):
    study = await study_factory(rough_sort_enabled=True)
    for _ in range(3):
        await participant_factory(study=study, last_step_reached=2)

    with pytest.raises(HTTPBadRequest) as exc_info:
        await study_service.update_study(
            study.id, {"rough_sort_enabled": False}
        )
    assert "3 participants" in str(exc_info.value)
```

- [ ] **Step 7.2: Run tests — fail**

Expected: all 4 fail (toggle currently always succeeds).

- [ ] **Step 7.3: Implement the lock**

In `study_service.update_study`, before applying changes:

```python
from sqlalchemy import select, func
from ..models.participant import Participant
from ..exceptions import HTTPBadRequest

if "rough_sort_enabled" in update_data:
    incoming = update_data["rough_sort_enabled"]
    if incoming != study.rough_sort_enabled:
        # Count participants who went past consent
        count_stmt = select(func.count()).select_from(Participant).where(
            Participant.study_id == study.id,
            Participant.last_step_reached > 1,
        )
        count = (await session.execute(count_stmt)).scalar_one()
        if count > 0:
            raise HTTPBadRequest(
                f"Toggle locked — {count} participants have started "
                "the survey. Archive or delete those sessions before changing "
                "rough_sort_enabled."
            )
```

- [ ] **Step 7.4: Run tests — pass**

```bash
.venv/bin/pytest tests/integration/test_rough_sort_toggle_lock.py -v
```

- [ ] **Step 7.5: Commit**

```bash
git add backend/app/services/study_service.py backend/tests/integration/test_rough_sort_toggle_lock.py
git commit -m "feat(study): lock rough_sort_enabled toggle once participants started"
```

## Task 8: Regenerate frontend API client

**Files:**
- Modify: `frontend/src/api/generated.ts` (auto-generated)

- [ ] **Step 8.1: Run generator**

```bash
cd /home/julien/tools/qualis && make generate-api
```

- [ ] **Step 8.2: Verify the new field appears**

```bash
grep -n "rough_sort_enabled" /home/julien/tools/qualis/frontend/src/api/generated.ts | head -5
```

Expected: ≥4 occurrences (StudyRead, StudyCreate, StudyUpdate, internal types).

- [ ] **Step 8.3: Run check-api**

```bash
cd /home/julien/tools/qualis && make check-api
```

Expected: PASS ("Generated client is up to date").

- [ ] **Step 8.4: Commit**

```bash
git add frontend/src/api/generated.ts
git commit -m "chore(api): regenerate client for rough_sort_enabled field"
```

## Task 9: Frontend `getEnabledSteps` utility (TDD)

**Files:**
- Create: `frontend/src/utils/studySteps.ts`
- Create: `frontend/src/utils/studySteps.test.ts`

- [ ] **Step 9.1: Write the failing tests**

In `frontend/src/utils/studySteps.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { getEnabledSteps, mapPersistedStepToKey } from './studySteps';

const baseStudy = (overrides = {}) => ({
    id: 1,
    slug: 's',
    rough_sort_enabled: true,
    ...overrides,
}) as any;

describe('getEnabledSteps', () => {
    it('returns 5 steps when rough enabled', () => {
        const steps = getEnabledSteps(baseStudy({ rough_sort_enabled: true }));
        expect(steps.map((s) => s.key)).toEqual(['consent', 'presort', 'rough', 'fine', 'post']);
    });

    it('returns 4 steps when rough disabled', () => {
        const steps = getEnabledSteps(baseStudy({ rough_sort_enabled: false }));
        expect(steps.map((s) => s.key)).toEqual(['consent', 'presort', 'fine', 'post']);
    });

    it('progress percentage is evenly distributed in 4-step mode', () => {
        const steps = getEnabledSteps(baseStudy({ rough_sort_enabled: false }));
        expect(steps.map((s) => s.progressPct)).toEqual([25, 50, 75, 100]);
    });

    it('progress percentage in 5-step mode keeps 25/50/75/100 milestones', () => {
        const steps = getEnabledSteps(baseStudy({ rough_sort_enabled: true }));
        const pcts = steps.map((s) => s.progressPct);
        expect(pcts[pcts.length - 1]).toBe(100);
        expect(pcts.length).toBe(5);
    });

    it('persisted step number matches the configured number', () => {
        const stepsEnabled = getEnabledSteps(baseStudy({ rough_sort_enabled: true }));
        expect(stepsEnabled.find((s) => s.key === 'fine')?.persistedNumber).toBe(4);

        const stepsDisabled = getEnabledSteps(baseStudy({ rough_sort_enabled: false }));
        expect(stepsDisabled.find((s) => s.key === 'fine')?.persistedNumber).toBe(4);
    });
});

describe('mapPersistedStepToKey', () => {
    it('maps step 3 to rough when enabled', () => {
        expect(mapPersistedStepToKey(3, baseStudy({ rough_sort_enabled: true }))).toBe('rough');
    });

    it('maps step 3 to fine when rough disabled (skipped step)', () => {
        // Defensive: a stale persisted step=3 with rough disabled should fallback to next available
        expect(mapPersistedStepToKey(3, baseStudy({ rough_sort_enabled: false }))).toBe('fine');
    });

    it('returns null for unknown step', () => {
        expect(mapPersistedStepToKey(99, baseStudy())).toBeNull();
    });
});
```

- [ ] **Step 9.2: Run tests — fail**

```bash
cd /home/julien/tools/qualis/frontend && npm test -- --run studySteps
```

Expected: ImportError.

- [ ] **Step 9.3: Implement**

Create `frontend/src/utils/studySteps.ts`:

```typescript
import type { StudyRead } from '../api/generated';

export type StepKey = 'consent' | 'presort' | 'rough' | 'fine' | 'post';

export interface StepDescriptor {
    key: StepKey;
    persistedNumber: number; // value persisted in last_step_reached
    labelKey: string; // i18n key
    labelDefault: string;
    progressPct: number; // 25, 50, 75, 100, ...
}

const ALL_STEPS: ReadonlyArray<Omit<StepDescriptor, 'progressPct'>> = [
    { key: 'consent', persistedNumber: 1, labelKey: 'admin.data.step.consent', labelDefault: 'Consent' },
    { key: 'presort', persistedNumber: 2, labelKey: 'admin.data.step.presort', labelDefault: 'Pre-sort survey' },
    { key: 'rough', persistedNumber: 3, labelKey: 'admin.data.step.rough', labelDefault: 'Preliminary sort' },
    { key: 'fine', persistedNumber: 4, labelKey: 'admin.data.step.fine', labelDefault: 'Q-sort' },
    { key: 'post', persistedNumber: 5, labelKey: 'admin.data.step.post', labelDefault: 'Post-sort survey' },
];

export function getEnabledSteps(study: Pick<StudyRead, 'rough_sort_enabled'>): StepDescriptor[] {
    const filtered = study.rough_sort_enabled
        ? ALL_STEPS
        : ALL_STEPS.filter((s) => s.key !== 'rough');
    const total = filtered.length;
    return filtered.map((s, i) => ({
        ...s,
        progressPct: Math.round(((i + 1) / total) * 100),
    }));
}

export function mapPersistedStepToKey(
    persistedNumber: number,
    study: Pick<StudyRead, 'rough_sort_enabled'>
): StepKey | null {
    const enabled = getEnabledSteps(study);
    const exact = enabled.find((s) => s.persistedNumber === persistedNumber);
    if (exact) return exact.key;
    // Defensive: a stale persisted step that isn't enabled — return the
    // next enabled step >= the requested number, or null.
    const fallback = enabled.find((s) => s.persistedNumber > persistedNumber);
    return fallback?.key ?? null;
}
```

- [ ] **Step 9.4: Run tests — pass**

```bash
npm test -- --run studySteps
```

Expected: 8 PASS.

- [ ] **Step 9.5: Commit**

```bash
git add frontend/src/utils/studySteps.ts frontend/src/utils/studySteps.test.ts
git commit -m "feat(frontend): getEnabledSteps utility for rough_sort flag"
```

## Task 10: Phase 1 closure — full CI

- [ ] **Step 10.1: Run full CI**

```bash
cd /home/julien/tools/qualis && make ci
```

Expected: PASS. If anything fails, fix and re-commit before opening the PR.

- [ ] **Step 10.2: Open PR 1**

Title: `feat(study): rough_sort_enabled foundation (phase 1/3)`

Body includes:
- Spec link to this plan
- Note: "No user-visible change. Adds canonical column, state-machine validator, defaults builder, frontend utility. Behaviour change ships in phase 3."
- Risk: "Default `True` for all existing rows preserves current behaviour."

---

# Phase 2 — Admin refactor (PR 2)

**Goal:** Replace hardcoded `STEP_LABEL_KEYS` / `STEP_INFO` constants in admin views and `HelpOverlay` with `getEnabledSteps()`-derived data. **Test fixtures explicitly include `rough_sort_enabled=false` cases** so the refactor is validated even before the feature toggle exists.

**Behaviour invariant:** with `rough_sort_enabled=true` (current default for every existing study), every admin screen renders identically to before.

## Task 11: InteractiveDataView refactor (TDD with both modes)

**Files:**
- Modify: `frontend/src/components/admin/dashboard/InteractiveDataView.tsx`
- Modify: `frontend/src/components/admin/dashboard/InteractiveDataView.test.tsx` (or create if missing)

- [ ] **Step 11.1: Write failing tests for both modes**

In the test file:

```typescript
import { renderWithStore } from '../../../test-utils/renderWithStore';
import { InteractiveDataView } from './InteractiveDataView';

describe('InteractiveDataView step labels', () => {
    it('shows 5 step filter options when study has rough_sort_enabled=true', () => {
        const study = { rough_sort_enabled: true } as any;
        const { getByRole } = renderWithStore(
            <InteractiveDataView study={study} participants={[]} />
        );
        // Open the step filter dropdown
        // Expect 5 step rows in the menu (including "Preliminary sort")
        // (use the actual selectors / interactions from existing test patterns)
    });

    it('hides "Preliminary sort" option when study has rough_sort_enabled=false', () => {
        const study = { rough_sort_enabled: false } as any;
        const { queryByText } = renderWithStore(
            <InteractiveDataView study={study} participants={[]} />
        );
        expect(queryByText(/Preliminary sort/i)).not.toBeInTheDocument();
    });
});
```

(Adapt to the actual props the component receives. If `study` is currently fetched via a hook inside the component, mock the hook return.)

- [ ] **Step 11.2: Run — fail**

```bash
npm test -- --run InteractiveDataView
```

Expected: the second test fails because "Preliminary sort" still renders.

- [ ] **Step 11.3: Refactor**

In `InteractiveDataView.tsx`, replace lines 161-163 (`STEP_LABEL_KEYS` constant) with a derived value inside the component:

```typescript
import { getEnabledSteps } from '../../../utils/studySteps';

// inside the component body, after the study/data hook:
const stepDescriptors = useMemo(
    () => getEnabledSteps(study),
    [study.rough_sort_enabled]
);
```

Update the dropdown render (around lines 678-686) to map `stepDescriptors` instead of `Object.entries(STEP_LABEL_KEYS)`. Update the `stepFilter` filter logic (lines 388-390) to compare against `stepDescriptors` numbers.

Drop the `STEP_LABEL_KEYS` constant entirely.

- [ ] **Step 11.4: Run — pass**

```bash
npm test -- --run InteractiveDataView
```

Expected: PASS.

- [ ] **Step 11.5: Commit**

```bash
git add frontend/src/components/admin/dashboard/InteractiveDataView.tsx frontend/src/components/admin/dashboard/InteractiveDataView.test.tsx
git commit -m "refactor(admin): InteractiveDataView consumes getEnabledSteps"
```

## Task 12: RecentActivityCard refactor

**Files:**
- Modify: `frontend/src/components/admin/dashboard/RecentActivityCard.tsx`
- Create or extend: `frontend/src/components/admin/dashboard/RecentActivityCard.test.tsx`

- [ ] **Step 12.1: Write failing tests**

```typescript
describe('RecentActivityCard progress', () => {
    it('shows 75% progress for fine step when rough enabled', () => {
        const study = { rough_sort_enabled: true } as any;
        const participant = { last_step_reached: 4 } as any;
        const { getByRole } = renderWithStore(
            <RecentActivityCard study={study} participants={[participant]} />
        );
        const bar = getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuenow', '75');
    });

    it('shows 75% progress for fine step when rough disabled (3 of 4 steps)', () => {
        const study = { rough_sort_enabled: false } as any;
        const participant = { last_step_reached: 4 } as any;
        const { getByRole } = renderWithStore(
            <RecentActivityCard study={study} participants={[participant]} />
        );
        const bar = getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuenow', '75');
    });
});
```

- [ ] **Step 12.2: Run — fail**

The second test fails because `STEP_INFO[4].progress = 75` is hardcoded (was correct for 5-step but happens to be the same value here — pick a step where the difference shows, e.g. step 2 = 50% when rough disabled vs 25% when enabled. Adjust test accordingly).

- [ ] **Step 12.3: Refactor**

Replace lines 33-41 (`STEP_INFO` constant) with derived data:

```typescript
import { getEnabledSteps, mapPersistedStepToKey } from '../../../utils/studySteps';

// inside the component:
const stepDescriptors = useMemo(() => getEnabledSteps(study), [study.rough_sort_enabled]);

const renderParticipantStep = (p: ParticipantSummary) => {
    const stepNum = (p.last_step_reached as number) ?? 1;
    const desc = stepDescriptors.find((s) => s.persistedNumber === stepNum);
    if (!desc) return null;
    return (
        <Progress
            value={desc.progressPct}
            label={t(desc.labelKey, desc.labelDefault)}
        />
    );
};
```

- [ ] **Step 12.4: Run — pass**

- [ ] **Step 12.5: Commit**

```bash
git add frontend/src/components/admin/dashboard/RecentActivityCard.tsx frontend/src/components/admin/dashboard/RecentActivityCard.test.tsx
git commit -m "refactor(admin): RecentActivityCard derives progress from getEnabledSteps"
```

## Task 13: ParticipantDetailsPage timeline refactor

**Files:**
- Modify: `frontend/src/pages/admin/ParticipantDetailsPage.tsx`
- Modify or create: corresponding test file

- [ ] **Step 13.1: Locate the timeline / step-progress widget**

```bash
grep -nE "step|stage|stepLabel|process_steps" /home/julien/tools/qualis/frontend/src/pages/admin/ParticipantDetailsPage.tsx
```

- [ ] **Step 13.2: Write failing tests for both modes**

(Same pattern as Task 12 — verify that the timeline shows 4 entries when rough disabled, 5 when enabled.)

- [ ] **Step 13.3: Refactor to use `getEnabledSteps(study)`**

- [ ] **Step 13.4: Run — pass**

- [ ] **Step 13.5: Commit**

```bash
git add frontend/src/pages/admin/ParticipantDetailsPage.tsx frontend/src/pages/admin/ParticipantDetailsPage.test.tsx
git commit -m "refactor(admin): ParticipantDetailsPage timeline derives from getEnabledSteps"
```

## Task 14: HelpOverlay step mapping refactor

**Files:**
- Modify: `frontend/src/components/study/HelpOverlay.tsx`
- Modify: `frontend/src/components/study/HelpOverlay.test.tsx` (create if missing)

- [ ] **Step 14.1: Write failing test**

```typescript
it('maps currentStep=3 to fine when rough disabled', () => {
    const study = { rough_sort_enabled: false } as any;
    const { container } = renderWithStore(
        <HelpOverlay study={study} currentStep={3} />
    );
    // Assert the help content matches the "fine" step (not "rough")
    expect(container.textContent).toMatch(/Q-sort|fine sort/i);
    expect(container.textContent).not.toMatch(/preliminary|first impression/i);
});
```

- [ ] **Step 14.2: Run — fail**

- [ ] **Step 14.3: Refactor lines 34-44**

Replace the hardcoded `stepIdMap` with:

```typescript
import { mapPersistedStepToKey } from '../../utils/studySteps';

const stepKey = mapPersistedStepToKey(currentStep, study) ?? 'rough';
```

(Pass `study` as a prop; thread it through callers as needed.)

- [ ] **Step 14.4: Pass; commit**

```bash
git add frontend/src/components/study/HelpOverlay.tsx frontend/src/components/study/HelpOverlay.test.tsx
git commit -m "refactor(study): HelpOverlay derives step mapping from study config"
```

## Task 15: AnalysisPage audit

**Files:**
- Audit only: `frontend/src/pages/admin/AnalysisPage.tsx`

- [ ] **Step 15.1: Search for step-3 / rough references**

```bash
grep -nE "rough|step.*3|preliminary" /home/julien/tools/qualis/frontend/src/pages/admin/AnalysisPage.tsx
```

- [ ] **Step 15.2: If matches, refactor. Otherwise document the audit**

If there are no matches, add a one-line comment near top of file:

```typescript
// Step semantics derive from study.rough_sort_enabled — see utils/studySteps.ts
```

If there are matches, refactor with the same pattern as Task 11-14 and add a test.

- [ ] **Step 15.3: Commit**

```bash
git add frontend/src/pages/admin/AnalysisPage.tsx
git commit -m "chore(analysis): note step semantics live in studySteps util"
```

## Task 16: Phase 2 closure — full CI

- [ ] **Step 16.1: Verify the constants are gone**

```bash
grep -rn "STEP_LABEL_KEYS\|STEP_INFO" /home/julien/tools/qualis/frontend/src
```

Expected: zero matches.

- [ ] **Step 16.2: Run full CI**

```bash
cd /home/julien/tools/qualis && make ci
```

- [ ] **Step 16.3: Open PR 2**

Title: `refactor(admin): step semantics derive from getEnabledSteps (phase 2/3)`

Body:
- "No user-visible change. Replaces 4 hardcoded step constants with calls to `getEnabledSteps(study)`."
- "Tests cover both `rough_sort_enabled=true` and `=false` fixtures so the contract is enforced before phase 3 ships the toggle."

---

# Phase 3 — Feature shipping (PR 3)

**Goal:** Add the admin toggle, the lock policy with banner, the deck UX in fine-sort, and the participant route guard. After this PR, study designers can disable rough sort and participants experience the deck UX.

## Task 17: Admin toggle UI in StudyDesignPage (TDD)

**Files:**
- Modify: `frontend/src/pages/admin/StudyDesignPage.tsx`
- Modify: `frontend/src/hooks/admin/useStudyDesignPage.ts`
- Modify: `frontend/src/pages/admin/StudyDesignPage.test.tsx`
- Modify: `frontend/public/locales/{en,fr,fi}/translation.json`
- Create: `frontend/src/hooks/admin/useRoughSortLock.ts`
- Create: `frontend/src/hooks/admin/useRoughSortLock.test.ts`

- [ ] **Step 17.1: Write failing tests for the lock hook**

In `frontend/src/hooks/admin/useRoughSortLock.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRoughSortLock } from './useRoughSortLock';

describe('useRoughSortLock', () => {
    it('is unlocked when no participants exist', () => {
        const { result } = renderHook(() =>
            useRoughSortLock({ studyId: 1, participants: [] })
        );
        expect(result.current.locked).toBe(false);
        expect(result.current.lockedCount).toBe(0);
    });

    it('is unlocked when participants only reached step 1 (consent)', () => {
        const { result } = renderHook(() =>
            useRoughSortLock({
                studyId: 1,
                participants: [{ last_step_reached: 1 } as any],
            })
        );
        expect(result.current.locked).toBe(false);
    });

    it('is locked when at least one participant has reached step 2+', () => {
        const { result } = renderHook(() =>
            useRoughSortLock({
                studyId: 1,
                participants: [
                    { last_step_reached: 1 } as any,
                    { last_step_reached: 3 } as any,
                ],
            })
        );
        expect(result.current.locked).toBe(true);
        expect(result.current.lockedCount).toBe(1);
    });
});
```

- [ ] **Step 17.2: Implement the hook**

```typescript
import { useMemo } from 'react';
import type { ParticipantSummary } from '../../api/generated';

export interface RoughSortLockState {
    locked: boolean;
    lockedCount: number;
}

interface Args {
    studyId: number;
    participants: ParticipantSummary[];
}

export function useRoughSortLock({ participants }: Args): RoughSortLockState {
    return useMemo(() => {
        const lockedCount = participants.filter(
            (p) => (p.last_step_reached ?? 0) > 1
        ).length;
        return { locked: lockedCount > 0, lockedCount };
    }, [participants]);
}
```

- [ ] **Step 17.3: Tests pass; commit**

```bash
git add frontend/src/hooks/admin/useRoughSortLock.ts frontend/src/hooks/admin/useRoughSortLock.test.ts
git commit -m "feat(admin): useRoughSortLock hook"
```

- [ ] **Step 17.4: Add i18n keys**

Edit `frontend/public/locales/en/translation.json`. Find the `admin.study_design` section and add:

```json
"rough_sort": {
    "section_title": "Rough sort step",
    "toggle_label": "Enable preliminary sort (3-pile triage)",
    "toggle_help": "Recommended for large Q-sets (>40 statements). About 38% of published Q studies use this step (Dieteren et al. 2023).",
    "lock_banner": "Toggle locked — {{count}} participant(s) have started the survey. Archive or delete those sessions before changing this setting.",
    "deck_mode_note": "Disabled — participants will see the full Q-set as a horizontally-scrollable deck."
}
```

Add equivalent keys to `fr/translation.json`:

```json
"rough_sort": {
    "section_title": "Étape de pré-tri",
    "toggle_label": "Activer le pré-tri (3 piles d'accord/neutre/pas d'accord)",
    "toggle_help": "Recommandé pour les Q-sets longs (>40 énoncés). Environ 38 % des études Q publiées utilisent cette étape (Dieteren et al. 2023).",
    "lock_banner": "Verrou actif — {{count}} participant(s) ont commencé l'enquête. Archivez ou supprimez ces sessions avant de modifier ce réglage.",
    "deck_mode_note": "Désactivé — les participants verront l'ensemble du Q-set sous forme d'un deck défilant horizontalement."
}
```

And `fi/translation.json`:

```json
"rough_sort": {
    "section_title": "Esilajitteluvaihe",
    "toggle_label": "Ota esilajittelu käyttöön (samaa mieltä / neutraali / eri mieltä)",
    "toggle_help": "Suositellaan suurille Q-joukoille (>40 väittämää). Noin 38 % julkaistuista Q-tutkimuksista käyttää tätä vaihetta (Dieteren et al. 2023).",
    "lock_banner": "Lukittu — {{count}} osallistuja(a) on aloittanut kyselyn. Arkistoi tai poista nämä istunnot ennen tämän asetuksen muuttamista.",
    "deck_mode_note": "Pois käytöstä — osallistujat näkevät koko Q-joukon vaakasuunnassa vieritettävänä pakkana."
}
```

Run i18n parity check:

```bash
cd /home/julien/tools/qualis/frontend && npm run i18n-check
```

Expected: PASS.

- [ ] **Step 17.5: Add toggle UI in StudyDesignPage**

In `StudyDesignPage.tsx`, locate the methodology section (typically near distribution / grid config). Add a new sub-section:

```tsx
import { useRoughSortLock } from '../../hooks/admin/useRoughSortLock';

// in component:
const { locked, lockedCount } = useRoughSortLock({
    studyId: study.id,
    participants,
});

// in JSX, in the methodology accordion:
<section className="space-y-2">
    <h3 className="text-lg font-black text-slate-900">
        {t('admin.study_design.rough_sort.section_title', 'Rough sort step')}
    </h3>
    {locked && (
        <div className="rounded border-l-4 border-amber-400 bg-amber-50 p-2 text-sm text-amber-900">
            {t('admin.study_design.rough_sort.lock_banner', {
                count: lockedCount,
                defaultValue: 'Toggle locked — {{count}} participant(s) have started the survey...',
            })}
        </div>
    )}
    <label className="flex items-center gap-2">
        <input
            type="checkbox"
            checked={form.rough_sort_enabled}
            disabled={locked || study.state === 'archived'}
            onChange={(e) => updateForm({ rough_sort_enabled: e.target.checked })}
        />
        <span>
            {t('admin.study_design.rough_sort.toggle_label', 'Enable preliminary sort (3-pile triage)')}
        </span>
    </label>
    <p className="text-xs text-slate-600">
        {t('admin.study_design.rough_sort.toggle_help', '...')}
    </p>
    {!form.rough_sort_enabled && (
        <p className="text-xs italic text-slate-500">
            {t('admin.study_design.rough_sort.deck_mode_note', 'Disabled — participants will see...')}
        </p>
    )}
</section>
```

- [ ] **Step 17.6: Update useStudyDesignPage hook**

Add `rough_sort_enabled` to the form state shape, the load-from-study mapping, and the save payload.

- [ ] **Step 17.7: Add page-level test**

```typescript
it('disables the toggle when participants have started the survey', () => {
    const study = { id: 1, rough_sort_enabled: true } as any;
    const participants = [{ last_step_reached: 2 } as any];
    const { getByLabelText } = renderWithStore(
        <StudyDesignPage study={study} participants={participants} />
    );
    expect(getByLabelText(/preliminary sort/i)).toBeDisabled();
});
```

- [ ] **Step 17.8: Run; commit**

```bash
git add frontend/src/pages/admin/StudyDesignPage.tsx frontend/src/hooks/admin/useStudyDesignPage.ts frontend/src/pages/admin/StudyDesignPage.test.tsx frontend/public/locales/en/translation.json frontend/public/locales/fr/translation.json frontend/public/locales/fi/translation.json
git commit -m "feat(admin): rough_sort toggle UI with lock-when-started policy"
```

## Task 18.0: Pre-flight contract inventory (REQUIRED before Phase 3 code changes)

**Goal:** Before touching FineSort source, build a written inventory of every behaviour the existing tests assert. The refactor must preserve each contract for `rough_sort_enabled=true` and define an analogue for `false`. **No code changes in this task — read-only audit.**

**Files:**
- Create: `docs/superpowers/audits/2026-04-30-finesort-contract-inventory.md` (audit artefact, committed)

- [ ] **Step 18.0.1: Read every FineSort/RoughSort test**

```bash
for f in frontend/src/pages/FineSortPage*.test.tsx \
         frontend/src/pages/RoughSortPage*.test.tsx \
         frontend/src/hooks/participant/useFineSort.test.ts; do
    echo "### $f"; grep -nE "^\s+(it|test|describe)\(" "$f"
done > /tmp/finesort-contracts.txt
```

- [ ] **Step 18.0.2: Document every assertion**

For each `it(...)` block, write one row in the audit:

```markdown
| Test file | Test name | Asserts | Mode | Form factor | Deck-mode analogue |
|---|---|---|---|---|---|
| FineSortPage.test.tsx | renders and initializes correctly | first paint shows piles + grid | both | all | flat deck + grid |
| FineSortPage.test.tsx | reconciles missing cards into Neutral deck | recovery on mount | rough only | all | "recovers missing cards into flat deck" |
| FineSortPage.test.tsx | disables validation until all cards placed | submit button gating | both | all | (same — agnostic to mode) |
| FineSortPage.test.tsx | enables validation and navigates on success | submit + nav | both | all | (same) |
| FineSortPage.test.tsx | Escape key deselects active card | keyboard nav | both | all | (same) |
| FineSortPage.mobile.test.tsx | empty pile message when category fully placed | mobile UX | rough only | mobile | "all placed" message in flat deck |
| FineSortPage.mobile.test.tsx | Tap-to-Swap interaction | mobile drag alternative | both | mobile | (same — works on placed cards) |
| FineSortPage.desktop.test.tsx | organizes deck cards in two columns | `lg:grid-cols-2` on `deck-cards-container` | both | desktop | (same — flat deck reuses container) |
| FineSortPage.integration.test.tsx | renders Finish Sorting when grid full | header behaviour | both | all | (same) |
| FineSortPage.integration.test.tsx | hides Finish Sorting when grid not full | header behaviour | both | all | (same) |
| FineSortPage.reconciliation.test.tsx | recovers missing cards into neutral deck on mount | resilience | rough only | all | recover into flat deck (no "neutral" — single bucket) |
| useFineSort.test.ts | sets step to 4 on mount | step persistence | both | n/a | step persistence at last_step_reached=4 unchanged |
| useFineSort.test.ts | computes correct unplaced card groups | partition logic | rough only | n/a | "computes correct unplaced flat list" |
| useFineSort.test.ts | isAllPlaced is false when cards remain in decks | gating | both | n/a | (same — semantics: any unplaced) |
| useFineSort.test.ts | isAllPlaced is true when all cards in grid | gating | both | n/a | (same) |
| useFineSort.test.ts | exposes qsort from response store | store wiring | both | n/a | (same) |
| useFineSort.test.ts | reconciles missing cards into neutral on mount | resilience | rough only | n/a | recover into flat deck |
| useFineSort.test.ts | handleValidate navigates to post-sort | submit nav | both | n/a | (same) |
| useFineSort.test.ts | Escape key sets selectedCardId to null | keyboard | both | n/a | (same) |
| useFineSort.test.ts | navigation guard redirects to rough-sort when no rough data | guard | rough only | n/a | "no redirect — direct fine-sort entry" |
| useFineSort.test.ts | uses config grid_config when provided | config wiring | both | n/a | (same) |
| useFineSort.test.ts | defaults distributionMode to forced | config | both | n/a | (same) |
| useFineSort.test.ts | surfaces distributionMode='free' from config | config | both | n/a | (same) |
| useFineSort.test.ts | surfaces distributionMode='flexible' from config | config | both | n/a | (same) |
```

(Read each test file in full and complete the table with the actual assertion semantics — not just the test name.)

- [ ] **Step 18.0.3: Identify breaking-risk areas**

Add a section "**Refactor risk hot-spots**" to the audit listing every place the existing tests assert behaviour that depends on the **3-pile structure**. These are the lines that need explicit deck-mode analogues:
- `useFineSort.ts:158` redirect to /rough-sort
- `useFineSort.ts:191-201` `unplacedAgree/Neutral/Disagree`
- `useFineSort.ts:255` `roughIds` set construction
- `useFineSort.ts:262` reconciliation falls back to `'neutral'`
- `FineSortPage.tsx` rendering of 3 named piles
- `FineSortPage.mobile.test.tsx` "empty pile" message tied to a specific pile

- [ ] **Step 18.0.4: Commit the audit**

```bash
git add docs/superpowers/audits/2026-04-30-finesort-contract-inventory.md
git commit -m "docs(audit): FineSort contract inventory before optional rough_sort"
```

**Phase 3 ENTRY GATE: every test row in the audit must have a deck-mode analogue defined before Task 19 begins.**

## Task 18.5: Form-factor test fixture helper

**Goal:** Centralise viewport switching so each subsequent test can target a form factor declaratively. Without this, every Task 19+ test would duplicate the `Object.defineProperty(window, 'innerWidth', ...)` boilerplate.

**Files:**
- Create: `frontend/src/test-utils/viewports.ts`
- Create: `frontend/src/test-utils/viewports.test.ts`

- [ ] **Step 18.5.1: Write failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { setViewport, FORM_FACTORS } from './viewports';

describe('setViewport', () => {
    it('updates window.innerWidth and dispatches resize', () => {
        const events: Event[] = [];
        const listener = (e: Event) => events.push(e);
        window.addEventListener('resize', listener);
        setViewport('desktop');
        expect(window.innerWidth).toBe(1280);
        expect(events.some((e) => e.type === 'resize')).toBe(true);
        window.removeEventListener('resize', listener);
    });

    it('exposes 5 named form factors', () => {
        expect(Object.keys(FORM_FACTORS)).toEqual([
            'mobile_portrait',
            'mobile_landscape',
            'tablet_portrait',
            'tablet_landscape',
            'desktop',
        ]);
    });
});
```

- [ ] **Step 18.5.2: Implement**

```typescript
export type FormFactor =
    | 'mobile_portrait'
    | 'mobile_landscape'
    | 'tablet_portrait'
    | 'tablet_landscape'
    | 'desktop';

export const FORM_FACTORS: Record<FormFactor, { width: number; height: number }> = {
    mobile_portrait: { width: 390, height: 844 },
    mobile_landscape: { width: 844, height: 390 },
    tablet_portrait: { width: 768, height: 1024 },
    tablet_landscape: { width: 1024, height: 768 },
    desktop: { width: 1280, height: 800 },
};

export function setViewport(factor: FormFactor): void {
    const { width, height } = FORM_FACTORS[factor];
    Object.defineProperty(window, 'innerWidth', {
        writable: true, configurable: true, value: width,
    });
    Object.defineProperty(window, 'innerHeight', {
        writable: true, configurable: true, value: height,
    });
    window.dispatchEvent(new Event('resize'));
}

export function rotateViewport(from: FormFactor, to: FormFactor): void {
    setViewport(from);
    setTimeout(() => setViewport(to), 0);
}
```

- [ ] **Step 18.5.3: Run; commit**

```bash
git add frontend/src/test-utils/viewports.ts frontend/src/test-utils/viewports.test.ts
git commit -m "test(utils): viewport fixture helper for FineSort form-factor coverage"
```

## Task 18: Refactor existing deck rendering (NO new component)

**Goal:** The existing FineSort UI has a `deck-cards-container` for unplaced cards. Instead of introducing a parallel `StatementDeck` component (collision risk + parallel UI to maintain), modify the **existing** rendering logic to handle both modes via a single conditional.

**Files:**
- Modify: `frontend/src/pages/FineSortPage.tsx`
- (no new component file)

- [ ] **Step 18.1: Read the existing FineSort layout**

```bash
grep -nE "deck-cards-container|unplacedAgree|unplacedNeutral|unplacedDisagree" /home/julien/tools/qualis/frontend/src/pages/FineSortPage.tsx
```

Understand where the 3 sub-lists currently render inside `deck-cards-container`.

- [ ] **Step 18.2: Add the conditional render path (without removing piles)**

In `FineSortPage.tsx`, locate the `<div data-testid="deck-cards-container" ...>` block. Wrap its children:

```tsx
<div data-testid="deck-cards-container" className="lg:grid-cols-2 ...">
    {config.rough_sort_enabled ? (
        // existing 3-sub-list rendering, untouched
        <>
            <PileList label="agree" ids={unplaced.agree} />
            <PileList label="neutral" ids={unplaced.neutral} />
            <PileList label="disagree" ids={unplaced.disagree} />
        </>
    ) : (
        // new flat list — same card component, same drag behaviour, no pile metadata
        <FlatDeckList ids={unplaced.deck} />
    )}
</div>
```

`FlatDeckList` is a small **inline** component in the same file (no new file) that maps `ids → <CardComponent />` exactly as the pile lists do.

- [ ] **Step 18.3: Verify the testid is preserved**

```bash
grep -n 'deck-cards-container' /home/julien/tools/qualis/frontend/src/pages/FineSortPage.tsx
```

Expected: ≥1 occurrence (the testid is shared by both modes — existing desktop test still finds it).

- [ ] **Step 18.4: Commit (without changing useFineSort yet — this is a no-op render path)**

The page now branches on `config.rough_sort_enabled`, but the hook still always returns 3-pile data. So `unplaced.deck` is undefined in current state. This commit is structural prep only:

```bash
git add frontend/src/pages/FineSortPage.tsx
git commit -m "refactor(participant): FineSortPage branches deck render on rough_sort_enabled"
```

## Task 19: Branch useFineSort hook on rough_sort_enabled

**Files:**
- Modify: `frontend/src/hooks/participant/useFineSort.ts`
- Modify: `frontend/src/hooks/participant/useFineSort.test.ts`

- [ ] **Step 19.1: Write failing tests for deck mode (one per contract row from Task 18.0)**

In `useFineSort.test.ts`, add a new `describe('useFineSort deck mode', ...)` block. **Every row from the audit table marked "rough only"** gets a deck-mode counterpart. Concretely:

```typescript
describe('useFineSort deck mode', () => {
    const setup = (overrides = {}) => {
        useConfigStore.getState().setConfig({
            slug: 's',
            statements: [
                { id: 1, code: '1', text: 'A' },
                { id: 2, code: '2', text: 'B' },
                { id: 3, code: '3', text: 'C' },
            ],
            grid_config: [
                { score: -1, capacity: 1 },
                { score: 0, capacity: 1 },
                { score: 1, capacity: 1 },
            ],
            rough_sort_enabled: false,
            ...overrides,
        } as any);
        useSessionStore.getState().setConsent(true);
    };

    it('does not redirect to /rough-sort when in deck mode', () => {
        setup();
        const navigate = vi.fn();
        // mock useNavigate to return navigate
        renderHook(() => useFineSort());
        expect(navigate).not.toHaveBeenCalledWith(
            expect.stringContaining('/rough-sort'),
            expect.anything()
        );
    });

    it('returns flat unplaced list as `deck` when rough_sort_enabled=false', () => {
        setup();
        const { result } = renderHook(() => useFineSort());
        expect(result.current.unplaced).toMatchObject({ deck: [1, 2, 3] });
        expect(result.current.unplaced).not.toHaveProperty('agree');
    });

    it('partitions placed vs unplaced via placedIds in deck mode', () => {
        setup();
        // place card 2 in grid
        useResponseStore.getState().placeCardInGrid(2, 0);
        const { result } = renderHook(() => useFineSort());
        expect(result.current.unplaced.deck).toEqual([1, 3]);
    });

    it('reconciles missing cards into the flat deck (no neutral fallback)', () => {
        setup();
        // simulate stale state with card not in qsort and not in (absent) rough
        const { result } = renderHook(() => useFineSort());
        // assert all 3 statements appear in deck
        expect(result.current.unplaced.deck).toEqual([1, 2, 3]);
    });

    it('isAllPlaced false when deck is not empty', () => {
        setup();
        const { result } = renderHook(() => useFineSort());
        expect(result.current.isAllPlaced).toBe(false);
    });

    it('isAllPlaced true when all cards placed in grid (deck empty)', () => {
        setup();
        useResponseStore.getState().placeCardInGrid(1, 0);
        useResponseStore.getState().placeCardInGrid(2, 1);
        useResponseStore.getState().placeCardInGrid(3, 2);
        const { result } = renderHook(() => useFineSort());
        expect(result.current.isAllPlaced).toBe(true);
    });

    it('Escape key deselects in deck mode (parity with rough mode)', () => {
        setup();
        const { result } = renderHook(() => useFineSort());
        act(() => {
            result.current.setSelectedCardId(1);
        });
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(result.current.selectedCardId).toBeNull();
    });

    it('handleValidate navigates to post-sort in deck mode', () => {
        setup();
        useResponseStore.getState().placeCardInGrid(1, 0);
        useResponseStore.getState().placeCardInGrid(2, 1);
        useResponseStore.getState().placeCardInGrid(3, 2);
        const { result } = renderHook(() => useFineSort());
        const navigate = vi.fn();
        act(() => result.current.handleValidate());
        expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/post-sort'));
    });

    it.each(['forced', 'free', 'flexible'] as const)(
        'surfaces distributionMode=%s in deck mode',
        (mode) => {
            setup({ distribution_mode: mode });
            const { result } = renderHook(() => useFineSort());
            expect(result.current.distributionMode).toBe(mode);
        }
    );
});
```

- [ ] **Step 19.2: Verify ALL existing rough-mode tests still pass**

```bash
cd /home/julien/tools/qualis/frontend && npm test -- --run useFineSort
```

Expected: 13 existing tests PASS (rough mode default), 9 new deck-mode tests FAIL.

- [ ] **Step 19.3: Refactor the hook**

In `useFineSort.ts`:

1. Read `config.rough_sort_enabled` (default `true` if absent for back-compat).
2. Wrap the rough-redirect (line 158) in a flag check:
   ```typescript
   if (config.rough_sort_enabled !== false) {
       const totalRough = rough.agree.length + rough.disagree.length + rough.neutral.length;
       if (totalRough === 0) {
           navigate(`/study/${slug}/rough-sort${location.search}`, { replace: true });
       }
   }
   ```
3. Replace the `unplaced` computation:
   ```typescript
   const placedIds = useMemo(
       () => new Set(qsort.cards.filter((c) => c.gridPos !== null).map((c) => c.id)),
       [qsort.cards]
   );
   const unplaced = useMemo(() => {
       if (config.rough_sort_enabled === false) {
           return { deck: (config.statements ?? []).map((s) => s.id).filter((id) => !placedIds.has(id)) };
       }
       return {
           agree: rough.agree.filter((id) => !placedIds.has(id)),
           neutral: rough.neutral.filter((id) => !placedIds.has(id)),
           disagree: rough.disagree.filter((id) => !placedIds.has(id)),
       };
   }, [config.rough_sort_enabled, config.statements, rough, placedIds]);
   ```
4. Update the reconciliation effect (lines 252-265): when `rough_sort_enabled === false`, do NOT call `actions.categorizeCard(id, 'neutral')` — the deck mode has no piles. Skip reconciliation; orphan cards already appear in the flat deck via `placedIds` partition.

- [ ] **Step 19.4: Run all useFineSort tests — both modes pass**

```bash
npm test -- --run useFineSort
```

Expected: 22 PASS (13 existing + 9 new).

- [ ] **Step 19.5: GATE — run all 8 FineSort/RoughSort test files**

```bash
npm test -- --run "FineSortPage|RoughSortPage|useFineSort|useRoughSort"
```

Expected: every existing test still PASS. **If anything regresses, do NOT commit — fix first.**

- [ ] **Step 19.6: Commit**

```bash
git add frontend/src/hooks/participant/useFineSort.ts frontend/src/hooks/participant/useFineSort.test.ts
git commit -m "feat(participant): useFineSort branches on rough_sort_enabled"
```

## Task 20: Extend FineSortPage tests for deck mode (form-factor coverage)

**Goal:** Each of the 4 existing `FineSortPage*.test.tsx` files gets explicit deck-mode tests. **No source changes** — Task 18 already added the conditional render. This task only adds tests + verifies behaviour preservation.

**Files:**
- Modify: `frontend/src/pages/FineSortPage.test.tsx`
- Modify: `frontend/src/pages/FineSortPage.mobile.test.tsx`
- Modify: `frontend/src/pages/FineSortPage.desktop.test.tsx`
- Modify: `frontend/src/pages/FineSortPage.integration.test.tsx`
- Modify: `frontend/src/pages/FineSortPage.reconciliation.test.tsx`

- [ ] **Step 20.1: Extend FineSortPage.test.tsx**

Add a `describe('FineSortPage deck mode', ...)` block. For each existing `it` in `FineSortPage.test.tsx`, add the deck-mode equivalent (refer to Task 18.0 audit table). Use `setViewport('desktop')` from Task 18.5 for default viewport.

```typescript
import { setViewport } from '../test-utils/viewports';

describe('FineSortPage deck mode', () => {
    beforeEach(() => {
        setViewport('desktop');
        // setup config with rough_sort_enabled: false
    });

    it('renders flat deck (no agree/neutral/disagree labels)', () => {
        // assert: deck-cards-container has no pile-label headings
    });

    it('reconciles missing cards into flat deck (not neutral)', () => {
        // setup stale state with one missing card
        // assert: card appears in flat deck, no neutral pile materialised
    });

    it('disables validation until all placed (mode-agnostic)', () => {
        // existing test repeated under deck mode
    });

    it('enables validation and navigates on success (mode-agnostic)', () => {
        // existing test repeated under deck mode
    });

    it('Escape key deselects active card (mode-agnostic)', () => {
        // existing test repeated under deck mode
    });
});
```

- [ ] **Step 20.2: Extend FineSortPage.mobile.test.tsx**

```typescript
import { setViewport } from '../test-utils/viewports';

describe('FineSortPage Mobile (deck mode)', () => {
    beforeEach(() => setViewport('mobile_portrait'));

    it('shows "all placed" message when flat deck empties', () => {
        // setup deck mode + place all cards
        // assert: "all placed" message visible
    });

    it('Tap-to-Swap interaction works in deck mode', () => {
        // place 2 cards in grid; tap one in grid then tap another's slot — swap
    });

    it('mobile_landscape: flat deck still scrollable horizontally', () => {
        setViewport('mobile_landscape');
        // assert: container has overflow-x-auto class or scrollWidth > clientWidth
    });
});
```

- [ ] **Step 20.3: Extend FineSortPage.desktop.test.tsx**

```typescript
describe('FineSortPage Desktop (deck mode)', () => {
    beforeEach(() => setViewport('desktop'));

    it('flat deck still uses lg:grid-cols-2 layout', () => {
        // setup deck mode
        const container = screen.getByTestId('deck-cards-container');
        expect(container.className).toContain('lg:grid-cols-2');
    });
});
```

- [ ] **Step 20.4: Extend FineSortPage.integration.test.tsx**

```typescript
describe('FineSortPage Header (deck mode)', () => {
    it('shows Finish Sorting when grid full in deck mode', () => { /* ... */ });
    it('hides Finish Sorting when grid not full in deck mode', () => { /* ... */ });
});
```

- [ ] **Step 20.5: Extend FineSortPage.reconciliation.test.tsx**

```typescript
test('deck mode: orphan cards recovered into flat deck (no neutral pile)', async () => {
    // Critical: this is where the "no neutral fallback" semantics from Task 19
    // gets visual verification. A stale state with cards missing from rough piles
    // (which don't exist) and missing from qsort must end up in the flat deck.
});
```

- [ ] **Step 20.6: Add tablet form-factor cross-cutting tests**

In `FineSortPage.test.tsx`, append:

```typescript
describe.each([
    ['tablet_portrait', 'rough'],
    ['tablet_portrait', 'deck'],
    ['tablet_landscape', 'rough'],
    ['tablet_landscape', 'deck'],
])('FineSortPage tablet %s × %s mode', (factor, mode) => {
    beforeEach(() => setViewport(factor as any));

    it('renders the deck-cards-container without overflow clipping', () => {
        // setup config matching mode
        const container = screen.getByTestId('deck-cards-container');
        expect(container.scrollHeight).toBeLessThanOrEqual(window.innerHeight * 1.5);
    });

    it('preserves card state across rotation (portrait → landscape)', () => {
        // place 1 card; rotate; assert it's still placed
        useResponseStore.getState().placeCardInGrid(1, 0);
        setViewport(factor === 'tablet_portrait' ? 'tablet_landscape' : 'tablet_portrait');
        // assert qsort still has card 1 placed at score 0
        expect(useResponseStore.getState().qsort.cards.find((c) => c.id === 1)?.gridPos).not.toBeNull();
    });
});
```

- [ ] **Step 20.7: GATE — run all 8 FineSort/RoughSort tests**

```bash
npm test -- --run "FineSortPage|RoughSortPage|useFineSort|useRoughSort"
```

Expected: every test PASS. New deck-mode and tablet tests included. **If a single existing rough-mode test now fails, the Task 19 hook refactor regressed it — revert and fix before proceeding.**

- [ ] **Step 20.8: Commit**

```bash
git add frontend/src/pages/FineSortPage*.test.tsx
git commit -m "test(participant): FineSortPage deck-mode + form-factor coverage"
```

## Task 20.5: FineSort edge-case hardening (opportunistic)

**Goal:** Since we're already opening every FineSort test file, harden them with edge-case coverage for fragility hot-spots that were never explicitly tested. **These tests apply to both modes** unless noted; the new tests must pass in both `rough_sort_enabled=true` and `=false`.

**Files:**
- Modify: `frontend/src/pages/FineSortPage.test.tsx`
- Modify: `frontend/src/pages/FineSortPage.reconciliation.test.tsx`
- Modify: `frontend/src/hooks/participant/useFineSort.test.ts`

- [ ] **Step 20.5.1: Q-set size edge cases**

In `FineSortPage.test.tsx` add:

```typescript
describe.each([true, false])('FineSortPage Q-set sizes (rough=%s)', (roughEnabled) => {
    it('handles very small Q-set (3 statements)', () => {
        // already covered by existing fixtures; assert no warnings/errors
    });

    it('handles medium Q-set (40 statements) without virtual scroll', () => {
        // generate 40 statements; assert all 40 cards reachable in DOM
        const stmts = Array.from({ length: 40 }, (_, i) => ({
            id: i + 1, code: String(i + 1), text: `Statement ${i + 1}`,
        }));
        // setup config with these
        // assert: all 40 cards rendered (count <li> or [data-card-id] elements)
    });

    it('handles large Q-set (60 statements) without DOM explosion', () => {
        // similar but with 60 statements
        // assert render time < 500ms (use performance.now bracketing)
    });
});
```

- [ ] **Step 20.5.2: Statement text edge cases**

```typescript
it('renders RTL text correctly in deck-cards-container', () => {
    // setup config with statements: [{ id: 1, text: 'هذا بيان' }]
    // assert: card has dir="auto" or proper rendering
});

it('renders long statement (300 chars) without breaking layout', () => {
    const longText = 'x'.repeat(300);
    // setup; assert: container scrollHeight reasonable
});

it('escapes HTML in statement text (no XSS)', () => {
    const malicious = '<script>window.__pwned=true</script>';
    // setup; assert: window.__pwned undefined; raw text rendered as text
});
```

- [ ] **Step 20.5.3: Interaction edge cases**

```typescript
it('rapid double-click on a card does not place it twice', () => {
    // setup; click same unplaced card twice in <50ms
    // assert: card placed once, not duplicated
});

it('Escape during drag cancels the drag without placing', () => {
    // setup; start drag; press Escape mid-drag
    // assert: card not placed, selection cleared
});

it('placing into a full column is rejected (forced mode)', () => {
    // setup forced grid with capacity 1 per column; place card; try to place another into same column
    // assert: second placement rejected, original card unchanged
});

it('over-fills allowed in flexible mode (capacity 1, 2 cards in same column)', () => {
    // setup flexible mode
    // assert: both cards visible in same column slot
});
```

- [ ] **Step 20.5.4: Resilience / state-restore edge cases**

In `FineSortPage.reconciliation.test.tsx`:

```typescript
test.each([true, false])('reconciles when draft has rough but study has rough_sort_enabled=%s', (roughEnabled) => {
    // setup: study with rough_sort_enabled=roughEnabled
    // setup: draft_responses contains a stale `rough` slice with 5 cards
    // mount FineSortPage
    // if roughEnabled=true: assert cards distributed into rough piles
    // if roughEnabled=false: assert rough slice ignored, cards in flat deck, no error
});

test('resume after browser tab close: qsort + draft restored on mount', () => {
    // setup: simulate stored draft state with 2 placed cards + selectedCardId
    // mount fresh; assert: 2 cards placed, selection restored
});

test('resume code mid-flow: participant returns at last_step_reached=4', () => {
    // setup: participant.last_step_reached=4 (deck mode), partial qsort
    // mount; assert: lands on /fine-sort, deck shows unplaced ids
});

test('config change mid-session: rough_sort_enabled flipped after participant started', () => {
    // setup: participant started with rough=true; config now reports false (admin flipped despite lock — defensive)
    // mount: assert no crash; participant should see ROUGH layout (their snapshot wins)
    // NOTE: backend lock prevents this, but the frontend must not crash if it ever happens
});
```

- [ ] **Step 20.5.5: Viewport rotation mid-sort**

```typescript
it('rotation portrait → landscape preserves placedIds and selection', () => {
    setViewport('mobile_portrait');
    // place card 1; select card 2
    setViewport('mobile_landscape');
    // assert: card 1 still placed, card 2 still selected
});

it('rotation landscape → portrait does not unplace cards', () => {
    setViewport('tablet_landscape');
    // place 3 cards
    setViewport('tablet_portrait');
    // assert: all 3 still placed
});

it('zoom 50% → 200% does not break drag handles', () => {
    // simulate via document.body.style.zoom or CSS transform
    // assert: card elements still have data-dnd-id attributes intact
});
```

- [ ] **Step 20.5.6: Distribution mode edge cases**

```typescript
it.each(['forced', 'flexible'] as const)('handles capacity-0 column in %s mode', (mode) => {
    // grid_config with one column having capacity: 0
    // assert: column rendered but rejects placement
});

it('handles non-symmetric grid (asymmetric distribution)', () => {
    // grid_config: [-3 cap 1, -2 cap 2, -1 cap 3, 0 cap 4, 1 cap 3, 2 cap 2, 3 cap 1]
    // place all 16 cards; assert isAllPlaced=true
});
```

- [ ] **Step 20.5.7: GATE — run full FineSort suite**

```bash
npm test -- --run "FineSortPage|RoughSortPage|useFineSort|useRoughSort"
```

Expected: every new edge-case test PASS. **If a new test reveals a real bug** (e.g. capacity-0 crashes, rotation loses state) — surface it: do NOT skip the test. Fix the bug first, then come back to this plan.

- [ ] **Step 20.5.8: Commit**

```bash
git add frontend/src/pages/FineSortPage*.test.tsx frontend/src/hooks/participant/useFineSort.test.ts
git commit -m "test(participant): FineSort edge-case hardening (Q-set sizes, RTL, resilience, rotation)"
```

## Task 21: Router guard for /rough-sort

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/AppRouter.test.tsx`

- [ ] **Step 21.1: Write failing test**

```typescript
it('redirects /rough-sort to /fine-sort when study has rough_sort_enabled=false', async () => {
    // setup config store with study.rough_sort_enabled = false
    // navigate to /study/<slug>/rough-sort
    // assert URL becomes /study/<slug>/fine-sort
});
```

- [ ] **Step 21.2: Run — fail**

- [ ] **Step 21.3: Add guard component**

Create `frontend/src/components/participant/RoughSortGuard.tsx`:

```typescript
import { Navigate, useParams } from 'react-router-dom';
import RoughSortPage from '../../pages/RoughSortPage';
import { useConfigStore } from '../../store/useConfigStore';

export function RoughSortGuard() {
    const { slug } = useParams();
    const config = useConfigStore((s) => s.config);

    if (config && !config.rough_sort_enabled) {
        return <Navigate to={`/study/${slug}/fine-sort`} replace />;
    }
    return <RoughSortPage />;
}
```

In `App.tsx` line 249:

```typescript
{ path: 'rough-sort', element: <RoughSortGuard /> },
```

- [ ] **Step 21.4: Run — pass**

- [ ] **Step 21.5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/participant/RoughSortGuard.tsx frontend/src/AppRouter.test.tsx
git commit -m "feat(participant): redirect /rough-sort to /fine-sort when disabled"
```

## Task 22: E2E flows with screenshot capture (both modes × form factors)

**Goal:** Cover the full participant flow end-to-end in both modes, with **screenshot capture** at every key transition. Screenshots act as the visual regression baseline (committed to the repo). Subsequent runs flag pixel diffs above threshold.

**Files:**
- Create: `frontend/e2e/participant/fine-sort-no-rough.spec.ts`
- Create: `frontend/e2e/participant/fine-sort-with-rough.spec.ts`
- Create: `frontend/e2e/participant/fine-sort-screenshots/` (directory for committed baseline PNGs)

- [ ] **Step 22.1: Write E2E for deck mode with screenshots at every transition**

```typescript
import { test, expect, devices } from '@playwright/test';

const VIEWPORTS = [
    { name: 'mobile_portrait', ...devices['iPhone 13'] },
    { name: 'tablet_portrait', viewport: { width: 768, height: 1024 } },
    { name: 'tablet_landscape', viewport: { width: 1024, height: 768 } },
    { name: 'desktop', viewport: { width: 1280, height: 800 } },
];

for (const vp of VIEWPORTS) {
    test.describe(`participant flow without rough — ${vp.name}`, () => {
        test.use(vp);

        test('walks consent → presort → fine-sort (deck) → post-sort with screenshots', async ({
            page, request,
        }) => {
            // 1. Create study with rough_sort_enabled=false
            const study = await createStudy(request, {
                slug: `e2e-no-rough-${vp.name}`,
                rough_sort_enabled: false,
                // 12 statements, 9-col forced distribution 1-2-3-2-3-2-3-2-1 = sums to 12
            });
            await activateStudy(request, study.slug);

            // 2. Welcome
            await page.goto(`/study/${study.slug}/welcome`);
            await expect(page).toHaveURL(/\/welcome$/);
            await page.screenshot({
                path: `e2e/participant/fine-sort-screenshots/${vp.name}-deck-01-welcome.png`,
            });

            // 3. Consent
            await page.click('text=Start');
            await page.click('text=I consent');
            await page.screenshot({
                path: `e2e/participant/fine-sort-screenshots/${vp.name}-deck-02-after-consent.png`,
            });

            // 4. Presort questionnaire
            await page.click('text=Continue');
            await page.screenshot({
                path: `e2e/participant/fine-sort-screenshots/${vp.name}-deck-03-presort.png`,
            });

            // 5. CRITICAL: assert direct landing on /fine-sort (NOT /rough-sort)
            await page.click('text=Submit');
            await expect(page).toHaveURL(/\/fine-sort$/);
            await page.screenshot({
                path: `e2e/participant/fine-sort-screenshots/${vp.name}-deck-04-empty-grid.png`,
            });

            // 6. Assert flat deck visible, no pile labels
            const container = page.getByTestId('deck-cards-container');
            await expect(container).toBeVisible();
            await expect(page.getByText(/Pile d.accord|agree pile|disagree pile|neutral pile/i)).not.toBeVisible();

            // 7. Place 6 of 12 cards (mid-state screenshot)
            await placeCardsViaDrag(page, 6);
            await page.screenshot({
                path: `e2e/participant/fine-sort-screenshots/${vp.name}-deck-05-half-placed.png`,
            });

            // 8. Place all 12
            await placeCardsViaDrag(page, 6); // remaining
            await page.screenshot({
                path: `e2e/participant/fine-sort-screenshots/${vp.name}-deck-06-all-placed.png`,
            });

            // 9. Submit
            await expect(page.getByRole('button', { name: /finish sorting/i })).toBeEnabled();
            await page.click('text=Finish Sorting');
            await expect(page).toHaveURL(/\/post-sort$/);
            await page.screenshot({
                path: `e2e/participant/fine-sort-screenshots/${vp.name}-deck-07-post-sort.png`,
            });
        });

        test('rotation mid-sort preserves placement state (deck mode)', async ({ page, request }) => {
            // tablet only — skip on mobile/desktop
            test.skip(!vp.name.startsWith('tablet'), 'rotation only on tablet');
            const study = await createStudy(request, {
                slug: `e2e-rot-${vp.name}`, rough_sort_enabled: false,
            });
            // ... place 3 cards in portrait, rotate to landscape, assert all 3 still placed
        });
    });
}
```

(Helpers `createStudy`, `activateStudy`, `placeCardsViaDrag` go in `frontend/e2e/helpers.ts` — pattern matches existing e2e tests in the project.)

- [ ] **Step 22.2: Write E2E for rough mode (parity baseline)**

`fine-sort-with-rough.spec.ts` mirrors the above but for `rough_sort_enabled: true`. Same 4 form factors, screenshots named `${vp}-rough-NN-...png`. **Critical**: this validates the existing flow STILL works after the refactor.

- [ ] **Step 22.3: Run E2E**

```bash
cd /home/julien/tools/qualis && make e2e -- --grep "fine-sort"
```

Expected: 8 tests pass (4 viewports × 2 modes). Screenshot files generated.

- [ ] **Step 22.4: Review and commit screenshots**

```bash
ls frontend/e2e/participant/fine-sort-screenshots/ | wc -l
```

Expected: ≥56 PNG files (4 viewports × 2 modes × 7 transitions = 56).

Open each in an image viewer; visually verify:
- Welcome looks right per viewport
- Consent page renders all controls
- Presort form is reachable
- Fine-sort grid + deck looks correct (deck/3-piles depending on mode)
- All-placed state visually matches the empty-deck or all-piles-empty expected layout
- Post-sort renders

```bash
git add frontend/e2e/participant/fine-sort-no-rough.spec.ts frontend/e2e/participant/fine-sort-with-rough.spec.ts frontend/e2e/helpers.ts frontend/e2e/participant/fine-sort-screenshots/
git commit -m "test(e2e): participant fine-sort flows × 4 form factors × 2 modes with screenshot baselines"
```

## Task 22.5: Manual smoke matrix (HUMAN GATE before PR 3 merge)

**Goal:** Even with comprehensive automated tests, FineSort's drag-and-drop nuances + responsive layouts have repeatedly surfaced issues that automated tests didn't catch. This task is a **20-cell manual verification** that a human (the author of the PR) must complete before merge. Output: a checked-off matrix posted in the PR description.

**Files:**
- Create: `docs/superpowers/audits/2026-04-30-finesort-manual-smoke.md` — the matrix template + completion artefact

- [ ] **Step 22.5.1: Start dev server**

```bash
cd /home/julien/tools/qualis && make dev
```

Open the app in two browser windows:
- Window A: regular Chrome (desktop)
- Window B: Chrome DevTools "Toolbar" → Device Mode (iPhone 13 + iPad + iPad landscape)

- [ ] **Step 22.5.2: Create 4 test studies via the admin UI**

| Study | Distribution | Rough enabled | Q-set size |
|---|---|---|---|
| smoke-A | forced 9-col (2-3-5-6-7-6-5-3-2 = 39) | true | 39 statements |
| smoke-B | forced 9-col same shape | false | 39 statements |
| smoke-C | flexible 7-col | true | 21 statements |
| smoke-D | flexible 7-col | false | 21 statements |

Set each to `active`. Open the participant link.

- [ ] **Step 22.5.3: Walk the matrix (20 cells)**

Open `docs/superpowers/audits/2026-04-30-finesort-manual-smoke.md` and tick each cell after manual verification:

```markdown
# FineSort manual smoke matrix — PR #<n>

| Form factor | Mode | Distribution | Status | Notes |
|---|---|---|---|---|
| mobile_portrait | rough | forced | [ ] | Tap-to-Swap works; piles scroll vertically; finish enabled when full |
| mobile_portrait | deck | forced | [ ] | Flat deck scrolls; all cards reachable; finish enabled when full |
| mobile_portrait | rough | flexible | [ ] | Same as forced + over-fill allowed |
| mobile_portrait | deck | flexible | [ ] | Same |
| mobile_landscape | rough | forced | [ ] | Layout adapts (no piles cut off); landscape doesn't break drag |
| mobile_landscape | deck | forced | [ ] | Deck row remains horizontally scrollable |
| mobile_landscape | rough | flexible | [ ] | (verify) |
| mobile_landscape | deck | flexible | [ ] | (verify) |
| tablet_portrait | rough | forced | [ ] | Hybrid layout: drag works, vertical space adequate |
| tablet_portrait | deck | forced | [ ] | Flat deck either grid_cols-2 or single column — verify which |
| tablet_portrait | rough | flexible | [ ] | (verify) |
| tablet_portrait | deck | flexible | [ ] | (verify) |
| tablet_landscape | rough | forced | [ ] | Closest-to-desktop; lg:grid-cols-2 deck applies |
| tablet_landscape | deck | forced | [ ] | (verify) |
| tablet_landscape | rough | flexible | [ ] | (verify) |
| tablet_landscape | deck | flexible | [ ] | (verify) |
| desktop | rough | forced | [ ] | Existing baseline — unchanged |
| desktop | deck | forced | [ ] | New deck UX |
| desktop | rough | flexible | [ ] | (verify) |
| desktop | deck | flexible | [ ] | (verify) |

## Rotation tests (4 cells, tablet only)

| From | To | Mode | Status | Notes |
|---|---|---|---|---|
| tablet_portrait | tablet_landscape | rough | [ ] | Mid-sort rotation: 3 placed cards stay placed |
| tablet_portrait | tablet_landscape | deck | [ ] | Same |
| tablet_landscape | tablet_portrait | rough | [ ] | Same |
| tablet_landscape | tablet_portrait | deck | [ ] | Same |

## Resilience tests (3 cells)

| Scenario | Status | Notes |
|---|---|---|
| Browser back button mid-sort | [ ] | Prompt or graceful return — does not lose draft |
| Tab switch + return after 30s | [ ] | Draft state preserved |
| Resume code mid-sort | [ ] | Closing tab and returning via resume_code lands on /fine-sort with deck/piles state restored |

## Admin views (4 cells)

| View | Mode | Status | Notes |
|---|---|---|---|
| Data page step filter | rough | [ ] | 5 options shown, including "Preliminary sort" |
| Data page step filter | deck | [ ] | 4 options, no "Preliminary sort" |
| Recent activity card | rough | [ ] | Progress bars 25/50/75/100 across 5 steps |
| Recent activity card | deck | [ ] | Progress bars 25/50/75/100 across 4 steps |
| Participant detail timeline | rough | [ ] | 5 timeline entries |
| Participant detail timeline | deck | [ ] | 4 timeline entries |
| StudyDesignPage toggle | unlocked | [ ] | Editable when no participants started |
| StudyDesignPage toggle | locked | [ ] | Disabled with banner showing count |
```

- [ ] **Step 22.5.4: Document and commit**

After ticking all cells, save the file with author + date + any notes. Reference this file from the PR description ("Manual smoke matrix completed — see docs/superpowers/audits/2026-04-30-finesort-manual-smoke.md"). Commit:

```bash
git add docs/superpowers/audits/2026-04-30-finesort-manual-smoke.md
git commit -m "docs(audit): FineSort manual smoke matrix completed for optional rough_sort"
```

**PR 3 ENTRY GATE: this file must be committed with all checkboxes ticked before opening the PR.**

## Task 23: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 23.1: Locate the participant flow section**

```bash
grep -n -E "rough|preliminary|3.piles|three.pile" /home/julien/tools/qualis/README.md
```

- [ ] **Step 23.2: Add a sentence**

In the relevant section, add:

```markdown
The rough-sort step (3-pile triage) is **optional per study**: only ~38% of
published Q studies use it (Dieteren et al. 2023). When disabled, participants
see the full Q-set as a horizontally-scrollable deck and place items directly
into the grid.
```

- [ ] **Step 23.3: Commit**

```bash
git add README.md
git commit -m "docs: note optional rough sort"
```

## Task 24: Phase 3 closure — full CI gates

- [ ] **Step 24.1: Full CI**

```bash
cd /home/julien/tools/qualis && make ci
```

Expected: PASS — including all FineSort tests (8 files), all admin tests with both-mode fixtures, all backend tests.

- [ ] **Step 24.2: E2E full**

```bash
make e2e
```

Expected: 8 fine-sort E2E tests (4 viewports × 2 modes) + existing E2E suite all PASS. Screenshots committed to `frontend/e2e/participant/fine-sort-screenshots/`.

- [ ] **Step 24.3: Verify Task 22.5 manual smoke matrix is complete**

```bash
test -f docs/superpowers/audits/2026-04-30-finesort-manual-smoke.md
grep -cE "^\| .*\[x\]" docs/superpowers/audits/2026-04-30-finesort-manual-smoke.md
```

Expected: ≥27 cells ticked (20 form-factor + 4 rotation + 3 resilience + 8 admin = 35 cells minimum). Refer back to Task 22.5 if any cell uncovered.

- [ ] **Step 24.4: Type-check + dead-code scan**

```bash
make check
```

Expected: PASS. Specifically verify:
- No new mypy errors
- No unused i18n keys (`npm run i18n-check`)
- No vulture warnings on the new backend modules

- [ ] **Step 24.5: Verify legacy hardcoded constants are gone**

```bash
grep -rE "STEP_LABEL_KEYS|STEP_INFO" /home/julien/tools/qualis/frontend/src
grep -rE 'stepIdMap\[3\] *= *.rough' /home/julien/tools/qualis/frontend/src
```

Expected: zero matches anywhere. The only references to literal step numbers should now be in `frontend/src/utils/studySteps.ts` (the canonical map).

- [ ] **Step 24.6: Open PR 3**

Title: `feat(study): optional rough sort step + deck UX (phase 3/3)`

Body template:

```markdown
## Phase 3 of optional-rough-sort plan

Plan: docs/superpowers/plans/2026-04-30-optional-rough-sort.md

### Highlights
- New toggle in Study Design > Methodology section
- Lock-when-started policy with informational banner
- Deck UX in fine-sort when rough disabled (reuses existing `deck-cards-container`)
- Router guard redirects /rough-sort → /fine-sort when disabled
- 4 new i18n keys × 3 locales

### Test coverage
- All 8 FineSort/RoughSort test files extended with deck-mode fixtures
- Form-factor matrix: 5 viewports × 2 modes (auto via `setViewport` helper)
- 8 new E2E tests (4 viewports × 2 modes) with screenshot baselines
- 4 rotation tests (tablet portrait ↔ landscape mid-sort)
- Edge cases: Q-set sizes, RTL text, XSS, double-click, capacity-0, asymmetric grids

### Manual QA
See `docs/superpowers/audits/2026-04-30-finesort-manual-smoke.md` — all cells ticked.

### Risk
FineSort is the most fragile UI. Refactor reuses the existing `deck-cards-container`
rather than introducing a parallel component, minimising surface area. Pre-flight
contract inventory (Task 18.0) and per-task verification gates ensure no rough-mode
behaviour regresses.

### Backwards compatibility
- All existing studies default to `rough_sort_enabled=True` — zero behaviour change.
- In-flight participants protected by toggle lock.
- Stale `rough` keys in drafts silently dropped (no client-error).
```

---

# Self-review checklist

Before submitting any PR, run this checklist:

1. **Spec coverage** — every requirement from the conversation is in a task:
   - [x] Backend column + migration → Task 1
   - [x] Schema fields → Task 2
   - [x] State-machine validator → Tasks 3, 4
   - [x] Drafts validator → Task 5
   - [x] Defaults builder → Task 6
   - [x] Toggle-lock → Task 7
   - [x] API regen → Task 8
   - [x] Frontend utility → Task 9
   - [x] InteractiveDataView → Task 11
   - [x] RecentActivityCard → Task 12
   - [x] ParticipantDetailsPage → Task 13
   - [x] HelpOverlay → Task 14
   - [x] AnalysisPage audit → Task 15
   - [x] StudyDesignPage toggle + lock UI → Task 17
   - [x] **Pre-flight contract inventory** → Task 18.0
   - [x] **Form-factor test fixture** → Task 18.5
   - [x] **FineSortPage refactor (reuse deck-cards-container)** → Task 18
   - [x] useFineSort branching with form-factor + edge-case coverage → Task 19
   - [x] FineSortPage tests deck mode + tablet/rotation tests → Task 20
   - [x] **FineSort edge-case hardening (Q-set sizes, RTL, XSS, rotation)** → Task 20.5
   - [x] Router guard → Task 21
   - [x] **E2E with screenshot baselines × 4 form factors × 2 modes** → Task 22
   - [x] **Manual smoke matrix (35-cell human gate)** → Task 22.5
   - [x] README → Task 23
   - [x] Phase 3 closure with multi-gate verification → Task 24

2. **Placeholders** — searched the plan for "TBD", "TODO", "(verify)" — only legitimate matches in the smoke matrix table where "(verify)" is the action the author takes (not a plan placeholder).

3. **Type consistency** — these names appear consistently across all references:
   - `getEnabledSteps()`, `mapPersistedStepToKey()`, `useRoughSortLock()`
   - `validate_step_transition()`, `build_process_steps()`, `build_step_help()`, `build_methodology_tips()`, `enabled_steps()`
   - `setViewport()`, `FORM_FACTORS`, `rotateViewport()`
   - `deck-cards-container` testid (reused, not duplicated)

4. **Migration safety** — `server_default=text("true")` (DB) + Pydantic default `True` + TS form default `true`. Existing rows preserved.

5. **Fragility coverage** — every Phase 3 task touching FineSort has:
   - A pre-condition gate (run all 8 fine-sort test files in both modes)
   - A post-condition gate (no regression in existing rough-mode tests)
   - Form-factor coverage where the layout depends on viewport
   - Edge-case coverage in Task 20.5
   - A manual smoke verification artefact in Task 22.5

6. **PR size** —
   - Phase 1 ≈ 7h (8 tasks): backend foundation, util, API regen
   - Phase 2 ≈ 5h (5 tasks): admin refactor with both-mode fixtures
   - Phase 3 ≈ **15h** (10 tasks): pre-flight inventory, form-factor helper, FineSort refactor + extension tests + edge cases + E2E with screenshots + manual smoke matrix + closure
   - **Total ≈ 27h ≈ 3-4 jours dev** (revised up from 22h after adding fragility gates).

---

# Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-optional-rough-sort.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
