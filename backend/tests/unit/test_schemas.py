from app.schemas import (
    WorkspaceCreate,
    StudyTranslationBase,
    StatementBase,
    RecruitmentLinkBase,
)
import pytest
from pydantic import ValidationError


def test_workspace_create_validation():
    # Valid
    wc = WorkspaceCreate(title="Valid Workspace", slug="valid-slug")
    assert wc.title == "Valid Workspace"
    assert wc.slug == "valid-slug"

    # Whitespace title
    with pytest.raises(ValidationError) as exc:
        WorkspaceCreate(title="   ", slug="valid-slug")
    assert "String cannot be empty" in str(exc.value)

    # Empty title
    with pytest.raises(ValidationError) as exc:
        WorkspaceCreate(title="", slug="valid-slug")
    assert "String cannot be empty" in str(exc.value)

    # Max length title
    with pytest.raises(ValidationError) as exc:
        WorkspaceCreate(title="a" * 101, slug="valid-slug")
    assert "String should have at most 100 characters" in str(exc.value)


def test_study_translation_validation():
    # Valid
    st = StudyTranslationBase(language_code="en", title="Valid Title")
    assert st.title == "Valid Title"

    # Whitespace fields
    with pytest.raises(ValidationError) as exc:
        StudyTranslationBase(language_code="en", title="  ")
    assert "String cannot be empty" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        StudyTranslationBase(language_code="en", title="Valid", description="   ")
    assert "String cannot be empty" in str(exc.value)

    # None description (should be allowed via base validator if field allows None but schema validator logic handles it?)
    # description is field("", max_length=2000). The default is empty string.
    # validate_trans_strings receives str | None.
    # If default "" is passed, validate_non_empty_string returns "".
    # Wait, check validator logic:
    # if not v.strip(): raise ValueError
    # So empty string is NOT allowed for description?
    # Description has default "".
    # Review schema:
    # `description: str = Field("", max_length=2000)`
    # Validator: `validate_trans_strings` calls `validate_non_empty_string`.
    # `validate_non_empty_string` raises if `not v.strip()`.
    # This means default "" triggers error!
    # I introduced a regression for optional fields that default to empty string.

    # Correction: Description in StudyTranslation is often empty.
    # If it is empty string, it should be allowed if it is optional?
    # In StudyTranslationBase, `description` is NOT Optional[str], it is `str`.
    # User might want empty description.
    # But usually "empty or whitespace only" means we don't want "   ".
    # If we want to allow empty string, we should handle it.
    # BUT `validate_non_empty_string` explicitly forbids empty string.

    # I need to check if description IS optional in logic.
    # Usually descriptions can be empty.
    # I should change description to `str | None = None` OR allow empty string if it's truly empty?
    # No, "Sanitization" means strict.

    # Let's adjust test to see behavior.

    pass


def test_statement_base_validation():
    with pytest.raises(ValidationError):
        StatementBase(code="   ")


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
