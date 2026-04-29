"""Integration tests for ConcourseService."""

import asyncio
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ConflictError, NotFoundError, ValidationError
from app.models import (
    Concourse,
    ConcourseItem,
    ConcourseItemStatus,
    ConcourseItemVersion,
    Project,
    Statement,
    StatementTranslation,
    Study,
    StudyState,
    User,
)
from app.schemas.concourses import (
    ConcourseCreate,
    ConcourseImportToStudy,
    ConcourseItemBulkImport,
    ConcourseItemCreate,
    ConcourseItemTranslationCreate,
    ConcourseItemUpdate,
    ConcourseTagCreate,
    ConcourseUpdate,
)
from app.services.concourse_service import ConcourseService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def concourse(db: AsyncSession, test_project: Project, test_user: User):
    """Create a concourse in the test project."""
    data = ConcourseCreate(title="Test Concourse", description="A test concourse")
    return await ConcourseService.create_concourse(
        db, test_project.id, data, test_user.id
    )


@pytest_asyncio.fixture
async def concourse_item(
    db: AsyncSession, concourse: Concourse, test_user: User
):
    """Create a single concourse item with an English translation."""
    data = ConcourseItemCreate(
        code="Q1",
        translations=[
            ConcourseItemTranslationCreate(language_code="en", text="First item"),
        ],
    )
    return await ConcourseService.create_item(db, concourse.id, data, test_user.id)


async def _reload_study(db: AsyncSession, study_id: int) -> Study:
    """Reload a study with statements eagerly loaded."""
    stmt = (
        select(Study)
        .where(Study.id == study_id)
        .options(
            selectinload(Study.statements).selectinload(Statement.translations),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Concourse CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestConcourseCRUD:
    async def test_create_concourse(
        self, db: AsyncSession, test_project: Project, test_user: User
    ):
        data = ConcourseCreate(title="My Concourse", description="desc")
        c = await ConcourseService.create_concourse(
            db, test_project.id, data, test_user.id
        )
        assert c.id is not None
        assert c.title == "My Concourse"
        assert c.description == "desc"
        assert c.project_id == test_project.id
        assert c.created_by == test_user.id

    async def test_list_concourses_empty(
        self, db: AsyncSession, test_project: Project
    ):
        items, total = await ConcourseService.list_concourses(db, test_project.id)
        assert items == []
        assert total == 0

    async def test_list_concourses_with_item_count(
        self, db: AsyncSession, test_project: Project, test_user: User, concourse: Concourse
    ):
        # Add two items
        for code in ("A1", "A2"):
            await ConcourseService.create_item(
                db,
                concourse.id,
                ConcourseItemCreate(
                    code=code,
                    translations=[
                        ConcourseItemTranslationCreate(language_code="en", text=f"Text {code}"),
                    ],
                ),
                test_user.id,
            )

        items, total = await ConcourseService.list_concourses(db, test_project.id)
        assert total == 1
        assert len(items) == 1
        assert items[0].item_count == 2  # type: ignore[attr-defined]

    async def test_get_concourse(self, db: AsyncSession, concourse: Concourse):
        fetched = await ConcourseService.get_concourse(db, concourse.id)
        assert fetched.id == concourse.id
        assert fetched.title == concourse.title

    async def test_get_concourse_not_found(self, db: AsyncSession):
        with pytest.raises(NotFoundError):
            await ConcourseService.get_concourse(db, 999999)

    async def test_update_concourse(
        self, db: AsyncSession, test_project: Project, concourse: Concourse
    ):
        data = ConcourseUpdate(title="Updated Title")
        updated = await ConcourseService.update_concourse(
            db, test_project.id, concourse.id, data
        )
        assert updated.title == "Updated Title"
        # description should remain unchanged
        assert updated.description == concourse.description

    async def test_create_with_construction_memo_round_trips(
        self, db: AsyncSession, test_project: Project, test_user: User
    ):
        memo = (
            "Sources: 12 semi-structured interviews with farmers in the "
            "Hesbaye region (Oct-Nov 2025), one focus group with extension "
            "agents, and grey literature from regional cooperatives. Voices "
            "intentionally excluded at this stage: industrial agribusiness "
            "lobbies (separate study planned). Sampling rationale: maximum "
            "variation across farm size and tenure status."
        )
        data = ConcourseCreate(
            title="Hesbaye agroecology",
            description="Pilot concourse",
            construction_memo=memo,
        )
        created = await ConcourseService.create_concourse(
            db, test_project.id, data, test_user.id
        )
        assert created.construction_memo == memo
        # Round-trip via GET
        fetched = await ConcourseService.get_concourse(db, created.id)
        assert fetched.construction_memo == memo

    async def test_update_construction_memo_only(
        self, db: AsyncSession, test_project: Project, concourse: Concourse
    ):
        # Original concourse has no memo
        assert concourse.construction_memo is None
        memo = "Initial draft of the construction rationale."
        updated = await ConcourseService.update_concourse(
            db,
            test_project.id,
            concourse.id,
            ConcourseUpdate(construction_memo=memo),
        )
        assert updated.construction_memo == memo
        # Title and description must be untouched
        assert updated.title == concourse.title
        assert updated.description == concourse.description

    async def test_construction_memo_max_length_boundary(self):
        # 10 000 chars is allowed
        ConcourseCreate(title="t", construction_memo="x" * 10000)
        # 10 001 chars must raise
        with pytest.raises(ValueError):
            ConcourseCreate(title="t", construction_memo="x" * 10001)

    async def test_update_concourse_wrong_project(
        self, db: AsyncSession, concourse: Concourse
    ):
        with pytest.raises(NotFoundError):
            await ConcourseService.update_concourse(
                db, 999999, concourse.id, ConcourseUpdate(title="X")
            )

    async def test_delete_concourse(self, db: AsyncSession, concourse: Concourse):
        await ConcourseService.delete_concourse(db, concourse.id)
        with pytest.raises(NotFoundError):
            await ConcourseService.get_concourse(db, concourse.id)

    async def test_delete_concourse_not_found(self, db: AsyncSession):
        with pytest.raises(NotFoundError):
            await ConcourseService.delete_concourse(db, 999999)


# ---------------------------------------------------------------------------
# Item CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestItemCRUD:
    async def test_create_item(
        self, db: AsyncSession, concourse: Concourse, test_user: User
    ):
        data = ConcourseItemCreate(
            code="Q1",
            source="Interview A",
            status=ConcourseItemStatus.proposed,
            translations=[
                ConcourseItemTranslationCreate(language_code="en", text="Hello"),
                ConcourseItemTranslationCreate(language_code="fr", text="Bonjour"),
            ],
        )
        item = await ConcourseService.create_item(db, concourse.id, data, test_user.id)
        assert item.code == "Q1"
        assert item.source == "Interview A"
        assert item.display_order == 0
        assert item.created_by == test_user.id
        assert len(item.translations) == 2

    async def test_create_item_auto_display_order(
        self, db: AsyncSession, concourse: Concourse, test_user: User
    ):
        for i, code in enumerate(("A1", "A2", "A3")):
            item = await ConcourseService.create_item(
                db,
                concourse.id,
                ConcourseItemCreate(
                    code=code,
                    translations=[
                        ConcourseItemTranslationCreate(language_code="en", text=f"T{i}"),
                    ],
                ),
                test_user.id,
            )
            assert item.display_order == i

    async def test_delete_item(
        self, db: AsyncSession, concourse: Concourse, concourse_item: ConcourseItem
    ):
        await ConcourseService.delete_item(db, concourse.id, concourse_item.id)
        # Verify the concourse is now empty
        fetched = await ConcourseService.get_concourse(db, concourse.id)
        assert len(fetched.items) == 0

    async def test_delete_item_wrong_concourse(
        self, db: AsyncSession, concourse_item: ConcourseItem
    ):
        with pytest.raises(NotFoundError):
            await ConcourseService.delete_item(db, 999999, concourse_item.id)

    async def test_delete_item_not_found(self, db: AsyncSession, concourse: Concourse):
        with pytest.raises(NotFoundError):
            await ConcourseService.delete_item(db, concourse.id, 999999)


# ---------------------------------------------------------------------------
# Bulk Import Text
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestBulkImportText:
    async def test_bulk_import_creates_items(
        self, db: AsyncSession, concourse: Concourse, test_user: User
    ):
        data = ConcourseItemBulkImport(
            text_block="Apple\nBanana\nCherry",
            language_code="en",
            code_prefix="F",
        )
        items = await ConcourseService.bulk_import_text(
            db, concourse.id, data, test_user.id
        )
        assert len(items) == 3
        assert items[0].code == "F1"
        assert items[1].code == "F2"
        assert items[2].code == "F3"
        # Verify translations
        assert items[0].translations[0].text == "Apple"
        assert items[0].translations[0].language_code == "en"

    async def test_bulk_import_filters_empty_lines(
        self, db: AsyncSession, concourse: Concourse, test_user: User
    ):
        data = ConcourseItemBulkImport(
            text_block="Line one\n\n   \nLine two\n\n",
            language_code="en",
            code_prefix="X",
        )
        items = await ConcourseService.bulk_import_text(
            db, concourse.id, data, test_user.id
        )
        assert len(items) == 2
        assert items[0].translations[0].text == "Line one"
        assert items[1].translations[0].text == "Line two"

    async def test_bulk_import_code_continues_from_existing(
        self, db: AsyncSession, concourse: Concourse, test_user: User
    ):
        """Codes should continue from the max display_order in the concourse."""
        # Pre-create one item so display_order starts at 1 for the next batch
        await ConcourseService.create_item(
            db,
            concourse.id,
            ConcourseItemCreate(
                code="Z1",
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Existing"),
                ],
            ),
            test_user.id,
        )
        data = ConcourseItemBulkImport(
            text_block="New item",
            language_code="en",
            code_prefix="C",
        )
        items = await ConcourseService.bulk_import_text(
            db, concourse.id, data, test_user.id
        )
        # display_order=1 for the new item, code = prefix + (display_order + 0 + 1) = C2
        assert items[0].code == "C2"
        assert items[0].display_order == 1


# ---------------------------------------------------------------------------
# Optimistic Locking & Version History
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestOptimisticLocking:
    async def test_update_item_success(
        self, db: AsyncSession, concourse: Concourse, concourse_item: ConcourseItem, test_user: User
    ):
        data = ConcourseItemUpdate(
            version=1,
            code="Q1-updated",
            translations=[
                ConcourseItemTranslationCreate(language_code="en", text="Updated text"),
            ],
            change_comment="Fixed wording",
        )
        await ConcourseService.update_item(
            db, concourse.id, concourse_item.id, data, test_user.id
        )
        # Reload to get fresh translations (session cache issue with expire_on_commit=False)
        db.expunge_all()
        updated = await ConcourseService._load_item(db, concourse_item.id)
        assert updated.code == "Q1-updated"
        assert updated.version == 2
        assert updated.translations[0].text == "Updated text"

    async def test_update_item_creates_version_snapshot(
        self, db: AsyncSession, concourse: Concourse, concourse_item: ConcourseItem, test_user: User
    ):
        data = ConcourseItemUpdate(
            version=1,
            code="Q1-v2",
            change_comment="Version test",
        )
        await ConcourseService.update_item(
            db, concourse.id, concourse_item.id, data, test_user.id
        )

        versions = await ConcourseService.list_item_versions(db, concourse_item.id)
        assert len(versions) == 1
        v = versions[0]
        assert v.version_number == 1
        assert v.code == "Q1"  # original code before update
        assert v.change_comment == "Version test"
        assert v.changed_by == test_user.id

    async def test_update_item_version_conflict(
        self, db: AsyncSession, concourse: Concourse, concourse_item: ConcourseItem, test_user: User
    ):
        # First update bumps version from 1 to 2
        await ConcourseService.update_item(
            db,
            concourse.id,
            concourse_item.id,
            ConcourseItemUpdate(version=1, code="Q1-v2"),
            test_user.id,
        )
        # Second update using stale version=1 should conflict
        with pytest.raises(ConflictError, match="modified by another user"):
            await ConcourseService.update_item(
                db,
                concourse.id,
                concourse_item.id,
                ConcourseItemUpdate(version=1, code="Q1-v3"),
                test_user.id,
            )

    async def test_update_item_wrong_concourse(
        self, db: AsyncSession, concourse_item: ConcourseItem, test_user: User
    ):
        with pytest.raises(NotFoundError):
            await ConcourseService.update_item(
                db,
                999999,
                concourse_item.id,
                ConcourseItemUpdate(version=1, code="X"),
                test_user.id,
            )


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestTags:
    async def test_create_and_list_tags(
        self, db: AsyncSession, test_project: Project
    ):
        tag1 = await ConcourseService.create_tag(
            db, test_project.id, ConcourseTagCreate(name="Important", color="#ff0000")
        )
        tag2 = await ConcourseService.create_tag(
            db, test_project.id, ConcourseTagCreate(name="Archive")
        )
        assert tag1.id is not None
        assert tag1.color == "#ff0000"
        assert tag2.color is None

        tags = await ConcourseService.list_tags(db, test_project.id)
        assert len(tags) == 2
        # Should be ordered by name
        assert tags[0].name == "Archive"
        assert tags[1].name == "Important"

    async def test_delete_tag(self, db: AsyncSession, test_project: Project):
        tag = await ConcourseService.create_tag(
            db, test_project.id, ConcourseTagCreate(name="ToDelete")
        )
        await ConcourseService.delete_tag(db, test_project.id, tag.id)
        tags = await ConcourseService.list_tags(db, test_project.id)
        assert len(tags) == 0

    async def test_delete_tag_not_found(self, db: AsyncSession, test_project: Project):
        with pytest.raises(NotFoundError):
            await ConcourseService.delete_tag(db, test_project.id, 999999)

    async def test_delete_tag_wrong_project(
        self, db: AsyncSession, test_project: Project
    ):
        tag = await ConcourseService.create_tag(
            db, test_project.id, ConcourseTagCreate(name="WrongProject")
        )
        with pytest.raises(NotFoundError):
            await ConcourseService.delete_tag(db, 999999, tag.id)

    async def test_create_item_with_tags(
        self, db: AsyncSession, concourse: Concourse, test_project: Project, test_user: User
    ):
        tag = await ConcourseService.create_tag(
            db, test_project.id, ConcourseTagCreate(name="Tagged")
        )
        item = await ConcourseService.create_item(
            db,
            concourse.id,
            ConcourseItemCreate(
                code="T1",
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Tagged item"),
                ],
                tag_ids=[tag.id],
            ),
            test_user.id,
        )
        assert len(item.tags) == 1
        assert item.tags[0].id == tag.id


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestComments:
    async def test_create_and_list_comments(
        self, db: AsyncSession, concourse_item: ConcourseItem, test_user: User
    ):
        c1 = await ConcourseService.create_item_comment(
            db, concourse_item.id, test_user.id, "First comment"
        )
        c2 = await ConcourseService.create_item_comment(
            db, concourse_item.id, test_user.id, "Second comment"
        )
        assert c1.body == "First comment"
        assert c2.user_id == test_user.id

        comments = await ConcourseService.list_item_comments(db, concourse_item.id)
        assert len(comments) == 2
        assert comments[0].body == "First comment"
        assert comments[1].body == "Second comment"

    async def test_get_comment_counts(
        self, db: AsyncSession, concourse: Concourse, concourse_item: ConcourseItem, test_user: User
    ):
        await ConcourseService.create_item_comment(
            db, concourse_item.id, test_user.id, "A comment"
        )
        await ConcourseService.create_item_comment(
            db, concourse_item.id, test_user.id, "Another comment"
        )
        counts = await ConcourseService.get_comment_counts(db, [concourse_item.id])
        assert counts[concourse_item.id] == 2

    async def test_get_comment_counts_empty(self, db: AsyncSession):
        counts = await ConcourseService.get_comment_counts(db, [])
        assert counts == {}

    async def test_get_comment_counts_no_comments(
        self, db: AsyncSession, concourse_item: ConcourseItem
    ):
        counts = await ConcourseService.get_comment_counts(db, [concourse_item.id])
        # Item has no comments, so it won't appear in the dict
        assert concourse_item.id not in counts


# ---------------------------------------------------------------------------
# Import to Study
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestImportToStudy:
    async def test_import_happy_path(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        """Import concourse items into a draft study as statements."""
        # Create items in concourse
        item1 = await ConcourseService.create_item(
            db,
            concourse.id,
            ConcourseItemCreate(
                code="C1",
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Statement 1"),
                    ConcourseItemTranslationCreate(language_code="fr", text="Enonce 1"),
                ],
            ),
            test_user.id,
        )
        item2 = await ConcourseService.create_item(
            db,
            concourse.id,
            ConcourseItemCreate(
                code="C2",
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Statement 2"),
                ],
            ),
            test_user.id,
        )

        # Create a draft study
        study = Study(
            slug="import-test",
            project_id=test_project.id,
            state=StudyState.draft,
            grid_config=[{"score": 0, "capacity": 2}],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.commit()
        await db.refresh(study)

        import_data = ConcourseImportToStudy(
            concourse_id=concourse.id,
            item_ids=[item1.id, item2.id],
        )
        await ConcourseService.import_to_study(db, study, import_data)
        db.expunge_all()
        result = await _reload_study(db, study.id)

        assert len(result.statements) == 2
        codes = {s.code for s in result.statements}
        assert codes == {"C1", "C2"}
        # Check translations were copied
        s1 = next(s for s in result.statements if s.code == "C1")
        assert len(s1.translations) == 2

    async def test_import_with_code_prefix(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        item = await ConcourseService.create_item(
            db,
            concourse.id,
            ConcourseItemCreate(
                code="X1",
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Prefixed"),
                ],
            ),
            test_user.id,
        )

        study = Study(
            slug="prefix-test",
            project_id=test_project.id,
            state=StudyState.draft,
            grid_config=[{"score": 0, "capacity": 1}],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.commit()
        await db.refresh(study)

        import_data = ConcourseImportToStudy(
            concourse_id=concourse.id,
            item_ids=[item.id],
            code_prefix="PRE-",
        )
        await ConcourseService.import_to_study(db, study, import_data)
        db.expunge_all()
        result = await _reload_study(db, study.id)
        assert result.statements[0].code == "PRE-X1"

    async def test_import_replace_existing(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        item = await ConcourseService.create_item(
            db,
            concourse.id,
            ConcourseItemCreate(
                code="R1",
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Replace me"),
                ],
            ),
            test_user.id,
        )

        study = Study(
            slug="replace-test",
            project_id=test_project.id,
            state=StudyState.draft,
            grid_config=[{"score": 0, "capacity": 1}],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.commit()
        await db.refresh(study)

        # First import
        await ConcourseService.import_to_study(
            db,
            study,
            ConcourseImportToStudy(concourse_id=concourse.id, item_ids=[item.id]),
        )

        # Second import with replace_existing=True should not fail on duplicate codes
        db.expunge_all()
        study = await _reload_study(db, study.id)
        await ConcourseService.import_to_study(
            db,
            study,
            ConcourseImportToStudy(
                concourse_id=concourse.id,
                item_ids=[item.id],
                replace_existing=True,
            ),
        )
        db.expunge_all()
        result = await _reload_study(db, study.id)
        assert len(result.statements) == 1
        assert result.statements[0].code == "R1"

    async def test_import_duplicate_code_raises(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        item = await ConcourseService.create_item(
            db,
            concourse.id,
            ConcourseItemCreate(
                code="DUP",
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Duplicate"),
                ],
            ),
            test_user.id,
        )

        study = Study(
            slug="dup-test",
            project_id=test_project.id,
            state=StudyState.draft,
            grid_config=[{"score": 0, "capacity": 1}],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.commit()
        await db.refresh(study)

        # First import
        await ConcourseService.import_to_study(
            db,
            study,
            ConcourseImportToStudy(concourse_id=concourse.id, item_ids=[item.id]),
        )

        # Second import without replace_existing should fail on duplicate code
        study = await _reload_study(db, study.id)
        with pytest.raises(ValidationError, match="already exist"):
            await ConcourseService.import_to_study(
                db,
                study,
                ConcourseImportToStudy(concourse_id=concourse.id, item_ids=[item.id]),
            )

    async def test_import_non_draft_study_raises(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        item = await ConcourseService.create_item(
            db,
            concourse.id,
            ConcourseItemCreate(
                code="ND1",
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Non-draft"),
                ],
            ),
            test_user.id,
        )

        study = Study(
            slug="active-test",
            project_id=test_project.id,
            state=StudyState.active,
            grid_config=[{"score": 0, "capacity": 1}],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.commit()
        await db.refresh(study)

        with pytest.raises(ValidationError, match="non-draft"):
            await ConcourseService.import_to_study(
                db,
                study,
                ConcourseImportToStudy(concourse_id=concourse.id, item_ids=[item.id]),
            )

    async def test_import_wrong_project_raises(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        project_factory,
    ):
        """Concourse must belong to the same project as the study."""
        other_project = await project_factory(owner=test_user, title="Other Project")

        # Concourse in other project
        other_concourse = await ConcourseService.create_concourse(
            db,
            other_project.id,
            ConcourseCreate(title="Other Concourse"),
            test_user.id,
        )
        item = await ConcourseService.create_item(
            db,
            other_concourse.id,
            ConcourseItemCreate(
                code="OP1",
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Other project"),
                ],
            ),
            test_user.id,
        )

        # Study in test_project
        study = Study(
            slug="wrong-project-test",
            project_id=test_project.id,
            state=StudyState.draft,
            grid_config=[{"score": 0, "capacity": 1}],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.commit()
        await db.refresh(study)

        with pytest.raises(ValidationError, match="same project"):
            await ConcourseService.import_to_study(
                db,
                study,
                ConcourseImportToStudy(
                    concourse_id=other_concourse.id, item_ids=[item.id]
                ),
            )

    async def test_import_missing_item_ids_raises(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        study = Study(
            slug="missing-items-test",
            project_id=test_project.id,
            state=StudyState.draft,
            grid_config=[{"score": 0, "capacity": 1}],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.commit()
        await db.refresh(study)

        with pytest.raises(ValidationError, match="Items not found"):
            await ConcourseService.import_to_study(
                db,
                study,
                ConcourseImportToStudy(concourse_id=concourse.id, item_ids=[999999]),
            )


# ---------------------------------------------------------------------------
# Staleness Detection & Sync
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestStalenessAndSync:
    async def _setup_imported_study(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ) -> tuple[Study, ConcourseItem]:
        """Helper: create an item, import it into a draft study, return both."""
        item = await ConcourseService.create_item(
            db,
            concourse.id,
            ConcourseItemCreate(
                code="S1",
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Original text"),
                ],
            ),
            test_user.id,
        )

        study = Study(
            slug="stale-test",
            project_id=test_project.id,
            state=StudyState.draft,
            grid_config=[{"score": 0, "capacity": 1}],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.commit()
        await db.refresh(study)

        await ConcourseService.import_to_study(
            db,
            study,
            ConcourseImportToStudy(concourse_id=concourse.id, item_ids=[item.id]),
        )
        db.expunge_all()
        study = await _reload_study(db, study.id)
        return study, item

    async def test_check_stale_none_when_fresh(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        study, _item = await self._setup_imported_study(
            db, test_project, test_user, concourse
        )
        stale = await ConcourseService.check_stale_statements(db, study)
        assert stale == []

    async def test_check_stale_detects_update(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        study, item = await self._setup_imported_study(
            db, test_project, test_user, concourse
        )

        # Update the concourse item after import
        await ConcourseService.update_item(
            db,
            concourse.id,
            item.id,
            ConcourseItemUpdate(
                version=1,
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Changed text"),
                ],
            ),
            test_user.id,
        )

        stale = await ConcourseService.check_stale_statements(db, study)
        assert len(stale) == 1
        assert stale[0]["source_deleted"] is False
        assert stale[0]["source_concourse_item_id"] == item.id

    async def test_check_stale_detects_deleted_source(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        study, item = await self._setup_imported_study(
            db, test_project, test_user, concourse
        )

        # Delete the concourse item
        await ConcourseService.delete_item(db, concourse.id, item.id)

        stale = await ConcourseService.check_stale_statements(db, study)
        assert len(stale) == 1
        assert stale[0]["source_deleted"] is True

    async def test_sync_statement_from_concourse(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        study, item = await self._setup_imported_study(
            db, test_project, test_user, concourse
        )

        # Update concourse item text
        await ConcourseService.update_item(
            db,
            concourse.id,
            item.id,
            ConcourseItemUpdate(
                version=1,
                translations=[
                    ConcourseItemTranslationCreate(language_code="en", text="Synced text"),
                ],
            ),
            test_user.id,
        )

        statement = study.statements[0]
        await ConcourseService.sync_statement_from_concourse(
            db, study, statement.id
        )
        # Reload to get fresh translations
        db.expunge_all()
        reloaded = await _reload_study(db, study.id)
        synced_stmt = next(s for s in reloaded.statements if s.id == statement.id)
        assert len(synced_stmt.translations) == 1
        assert synced_stmt.translations[0].text == "Synced text"

    async def test_sync_non_draft_study_raises(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        study, _item = await self._setup_imported_study(
            db, test_project, test_user, concourse
        )

        # Activate the study
        study.state = StudyState.active
        await db.commit()
        await db.refresh(study)

        statement = study.statements[0]
        with pytest.raises(ValidationError, match="non-draft"):
            await ConcourseService.sync_statement_from_concourse(
                db, study, statement.id
            )

    async def test_sync_unlinked_statement_raises(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
    ):
        """A statement without a source_concourse_item_id cannot be synced."""
        study = Study(
            slug="unlinked-test",
            project_id=test_project.id,
            state=StudyState.draft,
            grid_config=[{"score": 0, "capacity": 1}],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.flush()

        stmt = Statement(study_id=study.id, code="U1")
        db.add(stmt)
        await db.commit()
        await db.refresh(stmt)

        with pytest.raises(ValidationError, match="not linked"):
            await ConcourseService.sync_statement_from_concourse(db, study, stmt.id)

    async def test_sync_deleted_source_raises(
        self,
        db: AsyncSession,
        test_project: Project,
        test_user: User,
        concourse: Concourse,
    ):
        study, item = await self._setup_imported_study(
            db, test_project, test_user, concourse
        )

        statement = study.statements[0]

        # Delete the concourse item
        await ConcourseService.delete_item(db, concourse.id, item.id)

        with pytest.raises(NotFoundError, match="deleted"):
            await ConcourseService.sync_statement_from_concourse(
                db, study, statement.id
            )


# ---------------------------------------------------------------------------
# Memo cleanup on delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deleting_concourse_cleans_up_memo(
    db: AsyncSession, seed_concourse_id: int, seed_user_id: int
) -> None:
    """Deleting a concourse cascades to memo_entries (no DB-level FK)."""
    from sqlalchemy import func, select

    from app.models import MemoEntry, MemoParentType
    from app.services.memo_service import MemoService

    # Seed a memo entry for the concourse
    await MemoService.add_entry(
        db,
        parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id,
        title="Notes",
        body="cleaned up",
        user_id=seed_user_id,
    )

    # Delete the concourse via the service
    await ConcourseService.delete_concourse(db, concourse_id=seed_concourse_id)

    # Verify no orphan memo_entries remain
    count = (
        await db.execute(
            select(func.count(MemoEntry.id)).where(
                MemoEntry.parent_type == MemoParentType.concourse,
                MemoEntry.parent_id == seed_concourse_id,
            )
        )
    ).scalar()
    assert count == 0
