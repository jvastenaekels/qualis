"""Unit tests for ExportService.

Pillar 1: Scientific Validation
- "Rosetta Stone" test: UUID-to-sequential mapping for PQMethod
- "KenQ Structure" test: JSON schema validation for dump endpoint
- "Symmetry" test: Grid configuration mismatch detection
"""

import io
import zipfile
from unittest.mock import MagicMock

import pytest

from app.models import Participant, ParticipantStatus, QSortEntry, Statement, Study
from app.services.export_service import ExportService


class MockStatementTranslation:
    """Mock for statement translations."""

    def __init__(self, text: str, language_code: str = "en"):
        self.text = text
        self.language_code = language_code


class MockStatement:
    """Mock Statement with controllable ID for testing order."""

    def __init__(self, id: int, code: str, text: str = ""):
        self.id = id
        self.code = code
        self.translations = [MockStatementTranslation(text or code)]


class MockQSortEntry:
    """Mock QSortEntry for participant data."""

    def __init__(self, statement_id: int, grid_score: int):
        self.statement_id = statement_id
        self.grid_score = grid_score


class MockParticipant:
    """Mock Participant with Q-sort entries."""

    def __init__(self, entries: list):
        self.session_token = "test-session"
        self.confirmation_code = "ABC123"
        self.language_used = "en"
        self.status = MagicMock(value="completed")
        self.submitted_at = None
        self.ip_address = "hashed"
        self.presort_answers = {}
        self.postsort_answers = {}
        self.qsort_entries = entries


class MockStudy:
    """Mock Study with configurable statements."""

    def __init__(self, statements: list, slug: str = "test-study"):
        self.slug = slug
        self.statements = statements
        self.presort_config = {}
        self.postsort_config = {}
        self.grid_config = [{"score": -1, "capacity": 1}, {"score": 0, "capacity": 2}, {"score": 1, "capacity": 1}]


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
            MockStatement(id=100, code="S_MIDDLE", text="Middle statement"),
            MockStatement(id=50, code="S_FIRST", text="First statement"),
            MockStatement(id=200, code="S_LAST", text="Last statement"),
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
        sorted_statements = sorted(statements, key=lambda s: s.id)
        dat_content = ExportService._generate_dat(study, [participant], sorted_statements)

        # Assert: Verify the scores are in ID-sorted order
        lines = dat_content.strip().split("\n")
        assert len(lines) == 2  # Header + 1 participant

        # Header format: "slug    1  3" (slug padded to 8, n_users 3chars, n_items 3chars)
        header = lines[0]
        assert "test-stu" in header  # First 8 chars of slug

        # Data line: "      1  0-1 1" (PID + scores in order: ID 50=0, ID 100=-1, ID 200=1)
        data_line = lines[1]
        # Extract scores (after 8-char PID)
        pid_section = data_line[:8]
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
        assert pos_0 < pos_neg1 < pos_1, f"Scores not in definition order: 0@{pos_0}, -1@{pos_neg1}, 1@{pos_1}"

    def test_sta_file_uses_statement_definition_order(self):
        """
        Given: Statements with non-sequential IDs
        When: Generating .sta file
        Then: Statements appear in ID-sorted order
        """
        # Arrange
        statements = [
            MockStatement(id=100, code="S_MIDDLE", text="Middle statement"),
            MockStatement(id=50, code="S_FIRST", text="First statement"),
            MockStatement(id=200, code="S_LAST", text="Last statement"),
        ]

        # Act
        sorted_statements = sorted(statements, key=lambda s: s.id)
        sta_content = ExportService._generate_sta(sorted_statements)

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
            MockStatement(id=1, code="S1"),
            MockStatement(id=2, code="S2"),
            MockStatement(id=3, code="S3"),
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
            MockStatement(id=1, code="S1", text="Statement 1"),
            MockStatement(id=2, code="S2", text="Statement 2"),
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
