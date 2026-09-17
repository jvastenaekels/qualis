"""The orchestration that used to live inside the run_factor_analysis handler.

277 lines, cyclomatic complexity 37: request validation, manual-flag matrix,
the numeric run, three near-identical statement mapping loops, the optional
bootstrap, response assembly and ORM persistence, all in one route. None of
it was callable, or testable, without an HTTP request. These tests exercise
the pieces the extraction made addressable; the route itself stays covered
by tests/integration/test_analysis.py.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.schemas import AnalysisRequest
from app.services.analysis_run_service import (
    AnalysisInputError,
    build_manual_flags,
    statement_payload,
    validate_request,
)

STATEMENT = {
    "id": 7,
    "code": "S07",
    "translations": [
        {"lang": "en", "text": "English text"},
        {"lang": "fr", "text": "Texte français"},
    ],
}


def _request(**overrides: object) -> AnalysisRequest:
    base: dict[str, object] = {
        "n_factors": 2,
        "extraction": "pca",
        "rotation": "varimax",
        "flagging": "auto",
    }
    base.update(overrides)
    return AnalysisRequest.model_validate(base)


def test_validate_request_rejects_more_factors_than_participants() -> None:
    with pytest.raises(AnalysisInputError, match="valid participants"):
        validate_request(_request(n_factors=5), n_statements=30, n_participants=4)


def test_validate_request_rejects_more_factors_than_statements() -> None:
    with pytest.raises(AnalysisInputError, match="number of statements"):
        validate_request(_request(n_factors=5), n_statements=4, n_participants=30)


def test_validate_request_requires_manual_flags_for_manual_flagging() -> None:
    with pytest.raises(AnalysisInputError, match="manual_flags is required"):
        validate_request(
            _request(flagging="manual"), n_statements=30, n_participants=30
        )


def test_validate_request_accepts_a_sound_request() -> None:
    validate_request(_request(), n_statements=30, n_participants=30)


def test_build_manual_flags_is_none_unless_manual() -> None:
    assert build_manual_flags(_request(), n_participants=3, participant_db_ids=[1, 2, 3]) is None


def test_build_manual_flags_builds_the_matrix_from_db_ids() -> None:
    body = _request(flagging="manual", manual_flags={2: 1, 3: 2})
    matrix = build_manual_flags(body, n_participants=3, participant_db_ids=[1, 2, 3])
    assert matrix is not None
    assert matrix.shape == (3, 2)
    assert bool(matrix[1, 0]) and bool(matrix[2, 1])
    assert not matrix[0].any()


def test_statement_payload_uses_the_study_language_and_maps_nan_to_none() -> None:
    z = np.array([[0.5, np.nan], [1.0, -1.0]])
    arrays = np.array([[2, 0], [-1, 1]], dtype=np.int64)

    payload = statement_payload(STATEMENT, 0, z, arrays, n_factors=2, lang="fr")  # type: ignore[arg-type]

    assert payload == {
        "statement_id": 7,
        "code": "S07",
        "text": "Texte français",
        "z_scores": [0.5, None],
        "factor_arrays": [2, 0],
    }


def test_statement_payload_falls_back_to_first_translation_then_code() -> None:
    z = np.zeros((1, 1))
    arrays = np.zeros((1, 1), dtype=np.int64)
    assert statement_payload(STATEMENT, 0, z, arrays, 1, "de")["text"] == "English text"  # type: ignore[arg-type]
    bare = {"id": 1, "code": "S01", "translations": []}
    assert statement_payload(bare, 0, z, arrays, 1, "en")["text"] == "S01"  # type: ignore[arg-type]
