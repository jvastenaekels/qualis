# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Service-level integration tests for StudyService create/update/delete.

Audit findings covered:
- F-04-002 — study_service.py at 52% (create/update/delete service paths)
- F-02-005 — validate_for_activation no tests (CC=31)

These tests hit the StudyService directly (not via the router) so they
exercise the service layer in isolation from HTTP plumbing.
"""

import json
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ConflictError, NotFoundError, ValidationError
from app.models import (
    Participant,
    ParticipantStatus,
    Statement,
    StatementTranslation,
    Study,
    StudyState,
    StudyTranslation,
)
from app.schemas import (
    GridColumn,
    StatementCreate,
    StatementTranslationCreate,
    StudyCreate,
    StudyTranslationCreate,
    StudyUpdate,
)
from app.services.study_service import StudyService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_study_create(slug: str | None = None) -> StudyCreate:
    slug = slug or f"svc-study-{uuid.uuid4().hex[:8]}"
    return StudyCreate(
        slug=slug,
        grid_config=[
            GridColumn(score=-1, capacity=1),
            GridColumn(score=0, capacity=2),
            GridColumn(score=1, capacity=1),
        ],
        presort_config={},
        postsort_config={},
        translations=[
            StudyTranslationCreate(
                language_code="en",
                title="Service Test Study",
                description="desc",
            )
        ],
        statements=[
            StatementCreate(
                code="T1",
                translations=[StatementTranslationCreate(language_code="en", text="T1")],
            ),
            StatementCreate(
                code="T2",
                translations=[StatementTranslationCreate(language_code="en", text="T2")],
            ),
            StatementCreate(
                code="T3",
                translations=[StatementTranslationCreate(language_code="en", text="T3")],
            ),
            StatementCreate(
                code="T4",
                translations=[StatementTranslationCreate(language_code="en", text="T4")],
            ),
        ],
    )


# ---------------------------------------------------------------------------
# F-04-002: create_study
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_study_basic(db: AsyncSession, test_project):
    """StudyService.create_study must persist a study with its translations
    and statements and return a fully populated Study object.
    """
    study_in = _make_study_create()

    study = await StudyService.create_study(db, study_in, test_project.id)

    assert study.id is not None
    assert study.slug == study_in.slug
    assert study.state == StudyState.draft
    assert len(study.translations) == 1
    assert study.translations[0].language_code == "en"
    assert len(study.statements) == 4


@pytest.mark.asyncio
async def test_create_study_sets_default_language_from_first_translation(
    db: AsyncSession, test_project
):
    """When default_language is not provided, it must be inferred from the
    first translation's language_code.
    """
    study_in = _make_study_create()
    # No explicit default_language — should default to "en" (first translation)
    study = await StudyService.create_study(db, study_in, test_project.id)

    assert study.default_language == "en"


@pytest.mark.asyncio
async def test_create_study_duplicate_slug_raises_conflict(
    db: AsyncSession, test_project, seed_study: Study
):
    """Creating a study with an already-used slug must raise ConflictError."""
    study_in = _make_study_create(slug=seed_study.slug)

    with pytest.raises(ConflictError, match="already exists"):
        await StudyService.create_study(db, study_in, test_project.id)


@pytest.mark.asyncio
async def test_create_study_statements_have_display_order(
    db: AsyncSession, test_project
):
    """Statements must be created with sequential display_order values."""
    study_in = _make_study_create()
    study = await StudyService.create_study(db, study_in, test_project.id)

    orders = sorted(s.display_order for s in study.statements)
    assert orders == list(range(len(study.statements)))


# ---------------------------------------------------------------------------
# F-04-002: update_study — PATCH semantics, partial update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_study_partial_preserves_untouched_fields(
    db: AsyncSession, seed_study: Study
):
    """PATCH: updating show_statement_codes must leave slug, grid_config, and
    translations completely untouched.
    """
    original_slug = seed_study.slug
    original_grid = seed_study.grid_config.copy()

    patch = StudyUpdate(show_statement_codes=True)
    updated = await StudyService.update_study(db, seed_study, patch)

    assert updated.show_statement_codes is True
    assert updated.slug == original_slug
    assert updated.grid_config == original_grid


@pytest.mark.asyncio
async def test_update_study_methodology_memo_round_trip(
    db: AsyncSession, seed_study: Study
):
    """methodology_memo: a free-text optional field round-trips through PATCH.

    Mirrors the per-concourse construction_memo pattern. Surfaces the
    rationale behind distribution / conditions of instruction / Q-set size
    for replication and pre-registration documentation.
    """
    assert seed_study.methodology_memo is None

    memo = (
        "Forced distribution chosen per Watts & Stenner 2012; "
        "Q-set size 36 per Sneegas 2020 sampling rationale."
    )
    updated = await StudyService.update_study(
        db, seed_study, StudyUpdate(methodology_memo=memo)
    )
    assert updated.methodology_memo == memo

    cleared = await StudyService.update_study(
        db, seed_study, StudyUpdate(methodology_memo=None)
    )
    # Update with explicit None must clear the memo (not leave it stale).
    assert cleared.methodology_memo is None


@pytest.mark.asyncio
async def test_update_study_translation_sync(
    db: AsyncSession, seed_study: Study
):
    """Updating translations must update the existing EN translation in-place
    (no duplicate row) and add new languages when supplied.
    """
    patch = StudyUpdate(
        translations=[
            StudyTranslationCreate(
                language_code="en",
                title="Updated EN Title",
                description="new desc",
            ),
            StudyTranslationCreate(
                language_code="fr",
                title="Titre FR",
                description="desc fr",
            ),
        ]
    )
    updated = await StudyService.update_study(db, seed_study, patch)

    langs = {t.language_code: t for t in updated.translations}
    assert "en" in langs
    assert langs["en"].title == "Updated EN Title"
    assert "fr" in langs


@pytest.mark.asyncio
async def test_update_study_grid_config_blocked_when_participants_exist(
    db: AsyncSession, seed_study: Study
):
    """Changing grid_config must raise ValidationError when non-test participants
    exist (to protect data integrity).
    """
    # Add a real participant
    p = Participant(
        study_id=seed_study.id,
        session_token=uuid.uuid4(),
        language_used="en",
        status=ParticipantStatus.started,
        last_step_reached=1,
        last_step_reached_at=__import__("datetime").datetime.now(),
    )
    db.add(p)
    await db.commit()

    # Reload with participants loaded (update_study checks _has_real_participants)
    refreshed = (
        await db.execute(
            select(Study)
            .where(Study.id == seed_study.id)
            .options(
                selectinload(Study.translations),
                selectinload(Study.statements).selectinload(Statement.translations),
                selectinload(Study.participants),
            )
        )
    ).scalar_one()

    patch = StudyUpdate(
        grid_config=[
            GridColumn(score=-2, capacity=1),
            GridColumn(score=0, capacity=2),
            GridColumn(score=2, capacity=1),
        ]
    )

    with pytest.raises(ValidationError, match="Cannot modify grid configuration"):
        await StudyService.update_study(db, refreshed, patch)


@pytest.mark.asyncio
async def test_update_study_active_state_raises_validation_error(
    db: AsyncSession, active_study: Study
):
    """update_study on a non-draft study must raise ValidationError."""
    patch = StudyUpdate(show_statement_codes=True)

    with pytest.raises(ValidationError, match="Cannot update study in"):
        await StudyService.update_study(db, active_study, patch)


# ---------------------------------------------------------------------------
# F-04-002: delete_study — cascade verification (via router-level test)
# We also test the service guard: delete is only possible via the router which
# enforces is_superuser + archived.  We test the DB cascade directly.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_study_cascades_to_statements(
    db: AsyncSession, seed_study: Study
):
    """Deleting a study must cascade-delete its statements and translations."""
    study_id = seed_study.id
    statement_ids = [s.id for s in seed_study.statements]
    assert len(statement_ids) == 4

    await db.delete(seed_study)
    await db.commit()

    # Study gone
    result = await db.execute(select(Study).where(Study.id == study_id))
    assert result.scalar_one_or_none() is None

    # Statements gone (CASCADE)
    for sid in statement_ids:
        row = await db.execute(select(Statement).where(Statement.id == sid))
        assert row.scalar_one_or_none() is None

    # Translations gone (CASCADE)
    row = await db.execute(
        select(StudyTranslation).where(StudyTranslation.study_id == study_id)
    )
    assert row.scalars().all() == []


# ---------------------------------------------------------------------------
# F-02-005: validate_for_activation
# ---------------------------------------------------------------------------


def _make_trans_ns(**overrides) -> SimpleNamespace:
    """Build a SimpleNamespace mimicking a StudyTranslation object.

    validate_for_activation only reads attributes, so a plain namespace works
    without triggering SQLAlchemy's instrumented-attribute machinery.
    """
    defaults = dict(
        language_code="en",
        title="Valid Title",
        consent_title="I consent",
        consent_description="Full legal text here.",
        condition_of_instruction="Sort each card",
        process_steps=[
            {"id": "step1", "title": "Step One", "description": "Do this", "icon": "check"}
        ],
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_stmt_ns(code: str, lang: str = "en", text: str | None = None) -> SimpleNamespace:
    """Build a SimpleNamespace mimicking a Statement with one translation."""
    st = SimpleNamespace(language_code=lang, text=text or f"Statement {code}")
    return SimpleNamespace(code=code, translations=[st])


def _build_minimal_study_for_validation() -> SimpleNamespace:
    """Build a study-like namespace (not a real SQLAlchemy model) with all
    required fields set.

    validate_for_activation is a pure static method that only reads attributes,
    so SimpleNamespace avoids SQLAlchemy instrumented-attribute issues when
    constructing objects outside an ORM session.
    """
    trans = _make_trans_ns()
    statements = [_make_stmt_ns(code) for code in ["S1", "S2", "S3", "S4"]]

    return SimpleNamespace(
        default_language="en",
        grid_config=[
            {"score": -1, "capacity": 1},
            {"score": 0, "capacity": 2},
            {"score": 1, "capacity": 1},
        ],
        translations=[trans],
        presort_config={},
        postsort_config={},
        statements=statements,
    )


@pytest.mark.asyncio
async def test_validate_for_activation_valid_study_returns_no_errors():
    """A correctly configured study must return an empty error list."""
    study = _build_minimal_study_for_validation()
    errors = StudyService.validate_for_activation(study)
    assert errors == [], f"Expected no errors, got: {errors}"


@pytest.mark.asyncio
async def test_validate_for_activation_no_statements():
    """Error: no_statements when study has zero statements."""
    study = _build_minimal_study_for_validation()
    study.statements = []

    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("no_statements" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_no_grid():
    """Error: no_grid when grid_config is empty / falsy."""
    study = _build_minimal_study_for_validation()
    study.grid_config = []

    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("no_grid" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_capacity_mismatch():
    """Error: capacity_mismatch when grid total capacity != statement count."""
    study = _build_minimal_study_for_validation()
    # 4 statements but grid only sums to 3
    study.grid_config = [
        {"score": -1, "capacity": 1},
        {"score": 0, "capacity": 1},
        {"score": 1, "capacity": 1},
    ]

    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("capacity_mismatch" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_no_translations():
    """Error: no_translations when the study has no translation rows."""
    study = _build_minimal_study_for_validation()
    study.translations = []

    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("no_translations" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_missing_title():
    """Error: missing_title when a translation has an empty title."""
    study = _build_minimal_study_for_validation()
    study.translations[0].title = ""

    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("missing_title" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_missing_consent_title():
    """Error: missing_consent_title when consent_title is blank."""
    study = _build_minimal_study_for_validation()
    study.translations[0].consent_title = ""

    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("missing_consent_title" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_missing_consent_description():
    """Error: missing_consent_description when consent_description is blank."""
    study = _build_minimal_study_for_validation()
    study.translations[0].consent_description = ""

    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("missing_consent_description" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_missing_grid_instructions():
    """Error: missing_grid_instructions when condition_of_instruction is blank."""
    study = _build_minimal_study_for_validation()
    study.translations[0].condition_of_instruction = ""

    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("missing_grid_instructions" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_missing_step_title():
    """Error: missing_step_title when a process step has an empty title."""
    study = _build_minimal_study_for_validation()
    study.translations[0].process_steps = [
        {"id": "step1", "title": "", "description": "desc", "icon": "check"}
    ]

    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("missing_step_title" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_missing_statement_translation():
    """Error: missing_statement_translation when a statement lacks a translation
    for one of the study's languages.
    """
    study = _build_minimal_study_for_validation()

    # Add a French translation to the study so the validator expects FR for statements
    fr_trans = _make_trans_ns(
        language_code="fr",
        title="Titre FR",
        consent_title="Consentement",
        consent_description="Description légale",
        condition_of_instruction="Trier",
        process_steps=[
            {"id": "s1", "title": "Étape 1", "description": "Faire ceci", "icon": "check"}
        ],
    )
    study.translations.append(fr_trans)

    # Statements only have EN translations (no FR) → should error
    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("missing_statement_translation" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_empty_statement_text():
    """Error: empty_statement_text when a statement translation has blank text."""
    study = _build_minimal_study_for_validation()
    study.statements[0].translations[0].text = "   "

    errors = StudyService.validate_for_activation(study)
    keys = [json.loads(e)["key"] for e in errors]
    assert any("empty_statement_text" in k for k in keys)


@pytest.mark.asyncio
async def test_validate_for_activation_multiple_errors_accumulate():
    """All validation checks must run even after the first failure —
    validate_for_activation must never short-circuit.
    """
    study = _build_minimal_study_for_validation()
    study.statements = []       # → no_statements
    study.grid_config = []      # → no_grid
    study.translations[0].title = ""  # would trigger missing_title but no_translations check runs too

    errors = StudyService.validate_for_activation(study)
    assert len(errors) >= 2
