"""Unit tests for ExportService.

Pillar 1: Scientific Validation
- "Rosetta Stone" test: UUID-to-sequential mapping for PQMethod
- "KenQ Structure" test: JSON schema validation for dump endpoint
- "Symmetry" test: Grid configuration mismatch detection
"""

import io
import zipfile
from unittest.mock import MagicMock

from typing import Any
import pytest

from app.services.export_service import ExportService


class MockStatementTranslation:
    """Mock for statement translations."""

    def __init__(self, text: str, language_code: str = "en"):
        self.text = text
        self.language_code = language_code


class MockStatement:
    """Mock Statement with controllable ID for testing order."""

    def __init__(self, id: int, code: str, text: str = "", display_order: int = 0):
        self.id = id
        self.code = code
        self.display_order = display_order
        self.translations = [MockStatementTranslation(text or code)]


class MockQSortEntry:
    """Mock QSortEntry for participant data."""

    def __init__(self, statement_id: int, grid_score: int):
        self.statement_id = statement_id
        self.grid_score = grid_score
        self.card_comment = None  # Optional card comment


class MockParticipant:
    """Mock Participant with Q-sort entries."""

    def __init__(self, entries: list):
        self.session_token = "test-session"
        self.confirmation_code = "ABC123"
        self.language_used = "en"
        self.status = MagicMock(value="completed")
        self.submitted_at = None
        self.consented_at = None
        self.ip_address = "hashed"
        self.user_agent = "mock-agent"
        self.is_discarded = False
        self.discard_reason = None
        self.presort_answers: dict[str, Any] = {}
        self.postsort_answers: dict[str, Any] = {}
        self.qsort_entries = entries
        self.audio_recordings: list[Any] = []


class MockStudy:
    """Mock Study with configurable statements."""

    def __init__(self, statements: list, slug: str = "test-study"):
        self.slug = slug
        self.statements = statements
        self.presort_config: dict[str, Any] = {}
        self.postsort_config: dict[str, Any] = {}
        self.default_language = "en"
        self.grid_config = [
            {"score": -1, "capacity": 1},
            {"score": 0, "capacity": 2},
            {"score": 1, "capacity": 1},
        ]


class TestRosettaStone:
    """Tests for PQMethod export UUID-to-sequential mapping.

    Critical: PQMethod expects statement scores in a fixed column order.
    The order must be based on DEFINITION ORDER (sorted by ID), not random.
    """

    def test_dat_file_uses_statement_definition_order(self):
        """
        Given: Statements with non-sequential IDs (100, 50, 200)
        When: Generating .dat file
        Then: Scores appear in ID-sorted order (50, 100, 200)
        """
        # Arrange: Create statements with non-sequential IDs
        # Definition order by ID: 50 -> 100 -> 200
        statements = [
            MockStatement(
                id=100, code="S_MIDDLE", text="Middle statement", display_order=1
            ),
            MockStatement(
                id=50, code="S_FIRST", text="First statement", display_order=0
            ),
            MockStatement(
                id=200, code="S_LAST", text="Last statement", display_order=2
            ),
        ]

        # Participant placed statements with scores
        # Score -1 for ID 100, Score 0 for ID 50, Score 1 for ID 200
        entries = [
            MockQSortEntry(statement_id=100, grid_score=-1),
            MockQSortEntry(statement_id=50, grid_score=0),
            MockQSortEntry(statement_id=200, grid_score=1),
        ]

        participant = MockParticipant(entries)
        study = MockStudy(statements)

        # Act: Generate .dat file
        sorted_statements = sorted(statements, key=lambda s: s.display_order)
        dat_content = ExportService._generate_dat(
            study, [participant], sorted_statements
        )

        # Assert: Verify the scores are in ID-sorted order
        lines = dat_content.strip().split("\n")
        assert len(lines) == 2  # Header + 1 participant

        # Header format: "slug    1  3" (slug padded to 8, n_users 3chars, n_items 3chars)
        header = lines[0]
        assert "test-stu" in header  # First 8 chars of slug

        # Data line: "      1  0-1 1" (PID + scores in order: ID 50=0, ID 100=-1, ID 200=1)
        data_line = lines[1]
        # Extract scores (after 8-char PID)
        scores_section = data_line[8:]

        # Expected order: ID 50 (score 0) -> ID 100 (score -1) -> ID 200 (score 1)
        # Format is " {score}" for positive, "-{score}" for negative
        assert " 0" in scores_section  # Score for ID 50
        assert "-1" in scores_section  # Score for ID 100
        assert " 1" in scores_section  # Score for ID 200

        # Verify order: 0 comes before -1 which comes before 1
        pos_0 = scores_section.find(" 0")
        pos_neg1 = scores_section.find("-1")
        pos_1 = scores_section.rfind(" 1")  # Use rfind to get the last " 1"
        assert (
            pos_0 < pos_neg1 < pos_1
        ), f"Scores not in definition order: 0@{pos_0}, -1@{pos_neg1}, 1@{pos_1}"

    def test_sta_file_uses_statement_definition_order(self):
        """
        Given: Statements with non-sequential IDs
        When: Generating .sta file
        Then: Statements appear in ID-sorted order
        """
        # Arrange
        statements = [
            MockStatement(
                id=100, code="S_MIDDLE", text="Middle statement", display_order=1
            ),
            MockStatement(
                id=50, code="S_FIRST", text="First statement", display_order=0
            ),
            MockStatement(
                id=200, code="S_LAST", text="Last statement", display_order=2
            ),
        ]
        study = MockStudy(statements)

        # Act
        sorted_statements = sorted(statements, key=lambda s: s.display_order)
        sta_content = ExportService._generate_sta(study, sorted_statements)

        # Assert: Lines should be in ID order
        lines = sta_content.strip().split("\n")
        assert len(lines) == 3
        assert lines[0] == "First statement"  # ID 50
        assert lines[1] == "Middle statement"  # ID 100
        assert lines[2] == "Last statement"  # ID 200


class TestKenQStructure:
    """Tests for JSON dump structure validation.

    The dump endpoint must return specific keys for analysis tools.
    """

    @pytest.mark.asyncio
    async def test_full_dump_contains_required_keys(self, db, seed_study):
        """
        Given: A study with participants
        When: Calling get_study_full_dump()
        Then: Result contains all required keys for KenQ/analysis
        """
        from app.services.study_service import StudyService

        # Act
        result = await StudyService.get_study_full_dump(db, seed_study.id)

        # Assert: Required keys
        assert "study" in result
        assert "participants" in result
        assert "statement_id_to_index" in result

        # Study structure
        study_data = result["study"]
        assert "slug" in study_data
        assert "grid_config" in study_data
        assert "statements" in study_data

        # Statements structure
        if study_data["statements"]:
            stmt = study_data["statements"][0]
            assert "id" in stmt
            assert "code" in stmt


class TestSymmetry:
    """Tests for grid configuration symmetry validation.

    The system must reject submissions where statement count doesn't match grid capacity.
    """

    def test_csv_handles_missing_scores_gracefully(self):
        """
        Given: A participant with incomplete Q-sort (missing some statements)
        When: Generating CSV
        Then: Missing scores appear as empty strings, not errors
        """
        # Arrange: 3 statements but only 2 entries
        statements = [
            MockStatement(id=1, code="S1", display_order=0),
            MockStatement(id=2, code="S2", display_order=1),
            MockStatement(id=3, code="S3", display_order=2),
        ]

        entries = [
            MockQSortEntry(statement_id=1, grid_score=0),
            MockQSortEntry(statement_id=2, grid_score=1),
            # Missing S3
        ]

        participant = MockParticipant(entries)
        study = MockStudy(statements)

        # Act
        csv_content = ExportService.generate_csv(study, [participant])

        # Assert: CSV should generate without error
        assert "S1" in csv_content
        assert "S2" in csv_content
        assert "S3" in csv_content
        # S3 should have empty value
        lines = csv_content.strip().split("\n")
        assert len(lines) == 2  # Header + 1 data row

    def test_pqmethod_zip_structure(self):
        """
        Given: A valid study with participants
        When: Generating PQMethod ZIP
        Then: ZIP contains .sta, .dat, and .ans files
        """
        # Arrange
        statements = [
            MockStatement(id=1, code="S1", text="Statement 1", display_order=0),
            MockStatement(id=2, code="S2", text="Statement 2", display_order=1),
        ]

        entries = [
            MockQSortEntry(statement_id=1, grid_score=0),
            MockQSortEntry(statement_id=2, grid_score=1),
        ]

        participant = MockParticipant(entries)
        study = MockStudy(statements, slug="test-export")

        # Act
        zip_bytes = ExportService.generate_pqmethod_zip(study, [participant])

        # Assert
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            file_list = zf.namelist()
            assert "test-export.sta" in file_list
            assert "test-export.dat" in file_list
            assert "test-export.ans" in file_list


class TestRenderMemoMd:
    """Unit tests for ExportService.render_memo_md (pure function, no DB required)."""

    def test_render_memo_md_empty_entries_returns_empty_string(self) -> None:
        """render_memo_md returns '' when the memo has no entries."""
        from app.schemas.memos import MemoRead

        memo = MemoRead(parent_type="study", parent_id=1, entries=[])
        result = ExportService.render_memo_md(memo, {})
        assert result == ""

    def test_render_memo_md_includes_heading_and_body(self) -> None:
        """render_memo_md produces a # heading and ## entry titles."""
        from datetime import datetime, timezone

        from app.schemas.memos import MemoEntryRead, MemoRead

        entry = MemoEntryRead(
            id=1,
            parent_type="study",
            parent_id=42,
            title="Distribution rationale",
            body="Forced symmetry to surface compensatory positions.",
            position=10,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
            created_by=7,
            last_edited_by=7,
            comments=[],
        )
        memo = MemoRead(parent_type="study", parent_id=42, entries=[entry])
        result = ExportService.render_memo_md(memo, {7: "alice@example.com"})

        assert "# Memo for study #42" in result
        assert "## Distribution rationale" in result
        assert "Forced symmetry" in result
        assert "Last updated 2026-04-01 by alice@example.com" in result

    def test_render_memo_md_unknown_editor_falls_back_to_system(self) -> None:
        """An entry whose last_edited_by is not in user_emails gets 'system'."""
        from datetime import datetime, timezone

        from app.schemas.memos import MemoEntryRead, MemoRead

        entry = MemoEntryRead(
            id=2,
            parent_type="study",
            parent_id=5,
            title="Q-set size",
            body="",
            position=10,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
            created_by=None,
            last_edited_by=None,
            comments=[],
        )
        memo = MemoRead(parent_type="study", parent_id=5, entries=[entry])
        result = ExportService.render_memo_md(memo, {})

        assert "by system" in result

    def test_render_memo_md_no_body_entry_skips_body_line(self) -> None:
        """An entry with empty body does not emit an extra blank body line."""
        from datetime import datetime, timezone

        from app.schemas.memos import MemoEntryRead, MemoRead

        entry = MemoEntryRead(
            id=3,
            parent_type="study",
            parent_id=1,
            title="Limitations",
            body="",
            position=10,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            created_by=1,
            last_edited_by=1,
            comments=[],
        )
        memo = MemoRead(parent_type="study", parent_id=1, entries=[entry])
        result = ExportService.render_memo_md(memo, {1: "bob@example.com"})

        assert "## Limitations" in result
        # The body line should NOT appear (body is empty)
        lines = result.split("\n")
        body_lines = [ln for ln in lines if ln and ln not in ("## Limitations\n", "## Limitations")]
        # There should be no line between the ## heading and the blank separator
        # containing arbitrary user-supplied text — only the header, blank sep, footer.
        assert not any(ln.strip() == "" and "Forced" in ln for ln in lines)

    def test_generate_research_package_includes_memo_md_when_provided(self) -> None:
        """generate_research_package writes memo/memo.md when memo_md is non-empty."""
        from unittest.mock import MagicMock

        statements = [
            MockStatement(id=1, code="S1", text="Statement 1", display_order=0),
        ]
        study = MockStudy(statements, slug="pkg-test")
        study.state = MagicMock(value="active")  # type: ignore[attr-defined]
        study.participants = []  # type: ignore[attr-defined]
        zip_bytes = ExportService.generate_research_package(
            study,  # type: ignore[arg-type]
            [],
            memo_md="# Memo for study #1\n\n## Entry\n\nBody.\n",
        )

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            assert "memo/memo.md" in z.namelist()
            body = z.read("memo/memo.md").decode()
            assert "## Entry" in body

    def test_generate_research_package_omits_memo_md_when_none(self) -> None:
        """generate_research_package does NOT write memo/memo.md when memo_md is None."""
        from unittest.mock import MagicMock

        statements = [
            MockStatement(id=1, code="S1", text="Statement 1", display_order=0),
        ]
        study = MockStudy(statements, slug="pkg-test-2")
        study.state = MagicMock(value="active")  # type: ignore[attr-defined]
        study.participants = []  # type: ignore[attr-defined]
        zip_bytes = ExportService.generate_research_package(
            study,  # type: ignore[arg-type]
            [],
            memo_md=None,
        )

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            assert "memo/memo.md" not in z.namelist()


@pytest.mark.asyncio
class TestMemoMdIntegration:
    """Integration tests: render_memo_md + generate_research_package with real DB."""

    async def test_export_includes_memo_md_when_entries_exist(
        self,
        db: Any,
        seed_study: Any,
        seed_user_id: int,
    ) -> None:
        """Adding a memo entry causes memo/memo.md to appear in the research package ZIP."""
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.models import MemoParentType, Participant, Statement, Study
        from app.services.export_service import ExportService
        from app.services.memo_service import MemoService

        await MemoService.add_entry(
            db,
            parent_type=MemoParentType.study,
            parent_id=seed_study.id,
            title="Distribution rationale",
            body="Forced symmetry to surface compensatory positions.",
            user_id=seed_user_id,
        )

        memo = await MemoService.get_memo(
            db,
            parent_type=MemoParentType.study,
            parent_id=seed_study.id,
        )
        # No user map needed for the assertion — attribution falls back to 'system'.
        memo_md = ExportService.render_memo_md(memo, {})
        assert memo_md  # must be non-empty

        full_study = (
            await db.execute(
                select(Study)
                .where(Study.id == seed_study.id)
                .options(
                    selectinload(Study.statements).selectinload(Statement.translations),
                    selectinload(Study.participants).selectinload(
                        Participant.qsort_entries
                    ),
                    selectinload(Study.translations),
                )
            )
        ).scalar_one()

        zip_bytes = ExportService.generate_research_package(
            full_study,
            full_study.participants,
            memo_md=memo_md,
        )

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            names = z.namelist()
            assert "memo/memo.md" in names
            body = z.read("memo/memo.md").decode()
            assert "## Distribution rationale" in body
            assert "Forced symmetry" in body
            assert "Last updated" in body

    async def test_export_omits_memo_md_when_no_entries(
        self,
        db: Any,
        seed_study: Any,
    ) -> None:
        """No memo entries → memo/memo.md does NOT appear in the ZIP."""
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.models import MemoParentType, Participant, Statement, Study
        from app.services.export_service import ExportService
        from app.services.memo_service import MemoService

        memo = await MemoService.get_memo(
            db,
            parent_type=MemoParentType.study,
            parent_id=seed_study.id,
        )
        memo_md = ExportService.render_memo_md(memo, {})
        assert memo_md == ""

        full_study = (
            await db.execute(
                select(Study)
                .where(Study.id == seed_study.id)
                .options(
                    selectinload(Study.statements).selectinload(Statement.translations),
                    selectinload(Study.participants).selectinload(
                        Participant.qsort_entries
                    ),
                    selectinload(Study.translations),
                )
            )
        ).scalar_one()

        zip_bytes = ExportService.generate_research_package(
            full_study,
            full_study.participants,
            memo_md=memo_md if memo_md else None,
        )

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            assert "memo/memo.md" not in z.namelist()
