import pytest
import uuid
from app.models import Study, Statement, StudyTranslation, StudyState
from app.services.study_service import StudyService


@pytest.mark.asyncio
async def test_generate_session_seed_is_deterministic():
    """Seed should be same for same token, different for different tokens."""
    token1 = str(uuid.uuid4())
    token2 = str(uuid.uuid4())

    seed1a = StudyService._generate_session_seed(token1)
    seed1b = StudyService._generate_session_seed(token1)
    seed2 = StudyService._generate_session_seed(token2)

    assert seed1a == seed1b
    assert seed1a != seed2
    assert isinstance(seed1a, int)


@pytest.mark.asyncio
async def test_get_resolved_study_config_randomizes_statements():
    """If enabled, statements should be shuffled deterministically."""
    # Setup
    study = Study(
        id=1,
        slug="test-study",
        state=StudyState.draft,
        randomize_statement_order=True,
        default_language="en",
        translations=[StudyTranslation(language_code="en", title="Test")],
    )

    # 10 statements to ensure shuffle is likely to change order
    statements = [
        Statement(id=i, code=f"S{i}", study_id=1, translations=[]) for i in range(1, 11)
    ]
    study.statements = statements

    session_token = uuid.uuid4()

    config1 = await StudyService.get_resolved_study_config(study, "en", session_token)
    config2 = await StudyService.get_resolved_study_config(study, "en", session_token)

    # Same token -> Same order
    ids1 = [s["id"] for s in config1["statements"]]
    ids2 = [s["id"] for s in config2["statements"]]
    assert ids1 == ids2

    # Shuffled order should differ from original (extremely likely with 10 items)
    original_ids = list(range(1, 11))
    assert ids1 != original_ids


@pytest.mark.asyncio
async def test_get_resolved_study_config_no_randomization_if_disabled():
    """If disabled, statements should remain in original order."""
    study = Study(
        id=1,
        slug="test-study",
        state=StudyState.draft,
        randomize_statement_order=False,
        default_language="en",
        translations=[StudyTranslation(language_code="en", title="Test")],
    )
    statements = [
        Statement(id=i, code=f"S{i}", study_id=1, translations=[]) for i in range(1, 6)
    ]
    study.statements = statements

    session_token = uuid.uuid4()
    config = await StudyService.get_resolved_study_config(study, "en", session_token)

    ids = [s["id"] for s in config["statements"]]
    assert ids == [1, 2, 3, 4, 5]
