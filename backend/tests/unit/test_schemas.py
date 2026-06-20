from app.schemas import (
    ProjectCreate,
    StudyTranslationBase,
    StatementBase,
    RecruitmentLinkBase,
    RecruitmentLinkCreate,
)
import pytest
from pydantic import ValidationError


def test_project_create_validation():
    # Valid
    wc = ProjectCreate(title="Valid Project", slug="valid-slug")
    assert wc.title == "Valid Project"
    assert wc.slug == "valid-slug"

    # Whitespace title
    with pytest.raises(ValidationError) as exc:
        ProjectCreate(title="   ", slug="valid-slug")
    assert "String cannot be empty" in str(exc.value)

    # Empty title
    with pytest.raises(ValidationError) as exc:
        ProjectCreate(title="", slug="valid-slug")
    assert "String cannot be empty" in str(exc.value)

    # Max length title
    with pytest.raises(ValidationError) as exc:
        ProjectCreate(title="a" * 101, slug="valid-slug")
    assert "String should have at most 100 characters" in str(exc.value)


def test_study_translation_validation():
    # Valid
    st = StudyTranslationBase(language_code="en", title="Valid Title")
    assert st.title == "Valid Title"

    # Relaxed for drafts - empty/whitespace title now allowed in schema
    st = StudyTranslationBase(language_code="en", title="  ")
    assert st.title == "  "

    # Description defaults to empty string and is not subject to non-empty validation
    st = StudyTranslationBase(language_code="en", title="Title")
    assert st.description == ""

    # Optional fields default to None
    assert st.instructions is None
    assert st.subtitle is None


def test_statement_base_validation():
    # Relaxed for drafts
    sb = StatementBase(code="   ")
    assert sb.code == "   "


def test_recruitment_link_validation():
    # Name is optional
    rl = RecruitmentLinkBase(name=None)
    assert rl.name is None

    # Name with whitespace
    with pytest.raises(ValidationError):
        RecruitmentLinkBase(name="   ")

    # Name valid
    rl = RecruitmentLinkBase(name="  Valid Name  ")
    assert rl.name == "Valid Name"

    # Capacity must be > 0 (use a non-public type so capacity is allowed)
    with pytest.raises(ValidationError):
        RecruitmentLinkBase(type="limited", capacity=0)

    with pytest.raises(ValidationError):
        RecruitmentLinkBase(type="limited", capacity=-1)

    rl = RecruitmentLinkBase(type="limited", capacity=1)
    assert rl.capacity == 1

    # Capacity is optional (None is valid)
    rl = RecruitmentLinkBase(capacity=None)
    assert rl.capacity is None

    # Public links are unlimited: a capacity here is rejected, not silently dropped
    with pytest.raises(ValidationError):
        RecruitmentLinkBase(type="public", capacity=10)


def test_recruitment_link_create_excludes_server_fields():
    # RecruitmentLinkCreate should not accept expires_at or is_active
    link = RecruitmentLinkCreate(name="Test", type="public")
    assert not hasattr(link, "expires_at") or "expires_at" not in link.model_fields
    assert not hasattr(link, "is_active") or "is_active" not in link.model_fields
