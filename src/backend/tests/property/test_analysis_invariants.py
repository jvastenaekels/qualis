"""Hypothesis property-based invariant tests for the Q-method analysis service.

Quality roadmap Phase 4 item E.

Six invariants are tested:
  1. Correlation matrix is bounded in [-1, 1] with unit diagonal.
  2. Communalities (sum of squared loadings per row) are bounded by n_factors.
  3. Sign polarity is deterministic: identical inputs → identical rotated_loadings.
  4. Z-scores are standardised per factor (mean ≈ 0, std ≈ 1) for non-NaN factors.
  5. Factor arrays values belong to the supplied grid_config distribution.
  6. Distinguishing statements' z-scores actually differ by more than the SED
     threshold at p < 0.05, for at least one factor pair.

Strategy: generate Q-sort matrices with n_statements ∈ [10, 30] and
n_participants ∈ [5, 25] using integer scores in [-3, 3].  Matrices with
zero-variance columns (all identical scores) are rejected via assume().

Performance budget: max_examples=30, deadline=10 000 ms per test.
"""

from __future__ import annotations

import numpy as np
import pytest
from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st
from hypothesis.extra.numpy import arrays

from app.services.analysis_service import (
    classify_statements,
    compute_factor_characteristics,
    compute_factor_scores,
    compute_preview_range,
    correlation_matrix,
    extract_pca,
    flag_sorts,
    rotate_varimax,
    run_analysis,
    standardize_factor_signs,
)

# ---------------------------------------------------------------------------
# Strategy helpers
# ---------------------------------------------------------------------------

# Scores drawn from a typical 7-point forced-distribution range.
SCORE_RANGE = st.integers(min_value=-3, max_value=3)


@st.composite
def q_sort_matrix(draw: st.DrawFn) -> np.ndarray:
    """Draw a valid Q-sort matrix of shape (n_statements, n_participants).

    Constraints:
    - n_statements ∈ [10, 30]
    - n_participants ∈ [5, 25]
    - Integer scores in [-3, 3]
    - Each participant column has at least 2 distinct values (non-zero variance).
    - At least 2 participants survive the variance filter.
    """
    n_statements = draw(st.integers(min_value=10, max_value=30))
    n_participants = draw(st.integers(min_value=5, max_value=25))

    matrix = draw(
        arrays(
            dtype=np.float64,
            shape=(n_statements, n_participants),
            elements=SCORE_RANGE,
        )
    )

    # Reject any participant column whose values are all identical (zero variance).
    # build_sort_matrix does this too, but here we do it so assume() can
    # steer Hypothesis away from pathological inputs rather than having the
    # SUT raise a ValueError that would be mis-counted as a failure.
    valid_cols = [j for j in range(n_participants) if len(set(matrix[:, j].tolist())) > 1]
    assume(len(valid_cols) >= 2)

    return matrix[:, valid_cols]


@st.composite
def q_sort_matrix_small(draw: st.DrawFn) -> np.ndarray:
    """Like q_sort_matrix but limited to n_participants ∈ [5, 10] for fast tests."""
    n_statements = draw(st.integers(min_value=10, max_value=20))
    n_participants = draw(st.integers(min_value=5, max_value=10))

    matrix = draw(
        arrays(
            dtype=np.float64,
            shape=(n_statements, n_participants),
            elements=SCORE_RANGE,
        )
    )

    valid_cols = [j for j in range(n_participants) if len(set(matrix[:, j].tolist())) > 1]
    assume(len(valid_cols) >= 2)

    return matrix[:, valid_cols]


def _safe_n_factors(matrix: np.ndarray) -> int:
    """Choose a safe n_factors: min(2, n_participants, n_statements) ensuring >= 1."""
    n_statements, n_participants = matrix.shape
    return max(1, min(2, n_participants, n_statements))


def _make_grid_config(n_statements: int) -> list[dict]:
    """Build a simple symmetric grid_config of capacity == n_statements.

    Produces a balanced distribution over scores {-3, -2, -1, 0, 1, 2, 3}
    whose total capacity equals n_statements.  The middle score gets the
    remainder so that total capacity always matches n_statements exactly.
    """
    scores = [-3, -2, -1, 0, 1, 2, 3]
    n_scores = len(scores)
    base = n_statements // n_scores
    remainder = n_statements % n_scores
    config = []
    for i, score in enumerate(scores):
        cap = base + (1 if i == 3 and remainder > 0 else 0)
        # distribute remaining among outer scores
        if i < remainder // 2 or i >= n_scores - remainder // 2:
            cap = base + 1 if remainder > 0 and i < remainder else base
        config.append({"score": score, "capacity": cap})
    # Fix: ensure total capacity == n_statements
    total = sum(c["capacity"] for c in config)
    diff = n_statements - total
    # adjust the middle bucket
    config[3]["capacity"] += diff
    return config


# ---------------------------------------------------------------------------
# 1. Correlation matrix bounded [-1, 1] with unit diagonal
# ---------------------------------------------------------------------------

@given(matrix=q_sort_matrix())
@settings(max_examples=30, deadline=10_000, suppress_health_check=[HealthCheck.too_slow])
def test_correlation_matrix_bounded(matrix: np.ndarray) -> None:
    """Correlation matrix is square, values in [-1, 1], diagonal == 1."""
    n_statements, n_participants = matrix.shape

    # Reject matrices where corrcoef would produce NaN (should not happen
    # given our assume() in the strategy, but belt-and-suspenders).
    try:
        cor = correlation_matrix(matrix)
    except ValueError:
        assume(False)
        return  # unreachable but satisfies type checker

    assert cor.shape == (n_participants, n_participants), (
        f"Expected shape ({n_participants}, {n_participants}), got {cor.shape}"
    )
    assert np.all(cor >= -1.0 - 1e-9), "Correlation below -1 detected"
    assert np.all(cor <= 1.0 + 1e-9), "Correlation above +1 detected"
    np.testing.assert_allclose(
        np.diag(cor),
        np.ones(n_participants),
        atol=1e-9,
        err_msg="Diagonal of correlation matrix must be 1",
    )


# ---------------------------------------------------------------------------
# 2. Communalities bounded by n_factors
# ---------------------------------------------------------------------------

@given(matrix=q_sort_matrix())
@settings(max_examples=30, deadline=10_000, suppress_health_check=[HealthCheck.too_slow])
def test_communalities_bounded(matrix: np.ndarray) -> None:
    """Sum of squared loadings per row (communality) is <= n_factors + epsilon."""
    try:
        cor = correlation_matrix(matrix)
    except ValueError:
        assume(False)
        return

    n_factors = _safe_n_factors(matrix)
    loadings = extract_pca(cor, n_factors)

    communalities = np.sum(loadings ** 2, axis=1)
    max_comm = float(np.max(communalities))

    assert max_comm <= n_factors + 1e-6, (
        f"Max communality {max_comm:.6f} exceeds n_factors={n_factors}"
    )


# ---------------------------------------------------------------------------
# 3. Sign polarity deterministic across identical inputs (guards F-06-006)
# ---------------------------------------------------------------------------

@given(matrix=q_sort_matrix_small())
@settings(max_examples=30, deadline=10_000, suppress_health_check=[HealthCheck.too_slow])
def test_sign_polarity_deterministic(matrix: np.ndarray) -> None:
    """Calling run_analysis() twice with identical inputs yields identical
    rotated_loadings (sign included).

    This is the direct property-test for the F-06-006 sign-polarity audit
    finding: without standardize_factor_signs, repeated calls on the same
    matrix could return loadings that differ by column-sign flips, leading
    to inverted factor arrays.
    """
    n_factors = _safe_n_factors(matrix)

    try:
        r1 = run_analysis(matrix, n_factors=n_factors, extraction="pca", rotation="varimax")
        r2 = run_analysis(matrix, n_factors=n_factors, extraction="pca", rotation="varimax")
    except ValueError:
        assume(False)
        return

    np.testing.assert_array_equal(
        r1["rotated_loadings"],
        r2["rotated_loadings"],
        err_msg="rotated_loadings differ between two identical run_analysis() calls",
    )


# ---------------------------------------------------------------------------
# 4. Z-scores standardised per factor (mean ≈ 0, std ≈ 1)
# ---------------------------------------------------------------------------

@given(matrix=q_sort_matrix())
@settings(max_examples=30, deadline=10_000, suppress_health_check=[HealthCheck.too_slow])
def test_z_scores_standardized_per_factor(matrix: np.ndarray) -> None:
    """For each factor with at least one flagged participant, z-scores have
    mean ≈ 0 and std ≈ 1 (within tolerance 0.05).

    Factors whose flagging matrix is all-False produce all-NaN z-scores and
    are skipped.
    """
    n_factors = _safe_n_factors(matrix)

    try:
        cor = correlation_matrix(matrix)
    except ValueError:
        assume(False)
        return

    loadings = extract_pca(cor, n_factors)
    rotated = rotate_varimax(loadings)
    rotated = standardize_factor_signs(rotated)
    n_statements = matrix.shape[0]
    flags = flag_sorts(rotated, n_statements)

    # Need at least one flagged participant somewhere to have a meaningful test
    assume(np.any(flags))

    z_scores, _ = compute_factor_scores(matrix, rotated, flags)

    tol = 0.05  # generous tolerance for small matrices
    for f in range(n_factors):
        col = z_scores[:, f]
        if np.all(np.isnan(col)):
            # Factor has no flagged participants — standardisation is N/A
            continue
        mean_f = float(np.nanmean(col))
        std_f = float(np.nanstd(col, ddof=1))
        assert abs(mean_f) < tol, (
            f"Factor {f}: mean={mean_f:.4f} outside tolerance ±{tol}"
        )
        # std may deviate more when all statements yield the same weighted sum
        # (degenerate case with very few flagged participants).  We only check
        # std when it is non-trivially small.
        if std_f > 1e-6:
            assert abs(std_f - 1.0) < tol, (
                f"Factor {f}: std={std_f:.4f} outside tolerance [1±{tol}]"
            )


# ---------------------------------------------------------------------------
# 5. Factor arrays values belong to the grid_config distribution
# ---------------------------------------------------------------------------

@given(matrix=q_sort_matrix())
@settings(max_examples=30, deadline=10_000, suppress_health_check=[HealthCheck.too_slow])
def test_factor_arrays_match_grid(matrix: np.ndarray) -> None:
    """Every non-zero value in factor_arrays is drawn from the grid_config
    distribution.

    When grid_config is provided, compute_factor_scores() maps z-scores onto
    the sorted distribution.  The resulting factor_array for each factor must
    be a multiset drawn from that distribution (ties may collapse some values,
    but every value that appears must belong to the distribution).
    """
    n_statements, _ = matrix.shape
    n_factors = _safe_n_factors(matrix)
    grid_config = _make_grid_config(n_statements)
    allowed_scores = frozenset(entry["score"] for entry in grid_config)

    try:
        result = run_analysis(
            matrix,
            n_factors=n_factors,
            extraction="pca",
            rotation="varimax",
            grid_config=grid_config,
        )
    except ValueError:
        assume(False)
        return

    factor_arrays = result["factor_arrays"]
    flags = result["flags"]

    for f in range(n_factors):
        if not np.any(flags[:, f]):
            # Factor has no flagged participants — factor_arrays stays at default 0
            continue
        for s in range(n_statements):
            val = int(factor_arrays[s, f])
            assert val in allowed_scores, (
                f"Factor {f}, statement {s}: value {val} not in distribution {sorted(allowed_scores)}"
            )


# ---------------------------------------------------------------------------
# 6. Distinguishing-statement z-scores actually differ by SED threshold
# ---------------------------------------------------------------------------

@given(matrix=q_sort_matrix())
@settings(max_examples=30, deadline=10_000, suppress_health_check=[HealthCheck.too_slow])
def test_distinguishing_zscores_actually_differ(matrix: np.ndarray) -> None:
    """For every statement classified as distinguishing, at least one pair of
    factors has |z_i - z_j| > SED[i,j] * 1.960 (the p < 0.05 threshold used
    in classify_statements).

    This verifies that the classify_statements function is internally
    consistent: the statements it labels 'distinguishing' genuinely satisfy
    the criterion it claims to use.
    """
    n_factors = _safe_n_factors(matrix)
    # At least 2 factors are needed for distinguishing classification to be
    # meaningful.  With 1 factor there are no pairs → everything is consensus.
    assume(n_factors >= 2)

    try:
        cor = correlation_matrix(matrix)
    except ValueError:
        assume(False)
        return

    loadings = extract_pca(cor, n_factors)
    rotated = rotate_varimax(loadings)
    rotated = standardize_factor_signs(rotated)
    n_statements = matrix.shape[0]
    flags = flag_sorts(rotated, n_statements)

    assume(np.any(flags))

    z_scores, _ = compute_factor_scores(matrix, rotated, flags)
    _, _, sed = compute_factor_characteristics(rotated, flags, z_scores)

    distinguishing, _ = classify_statements(z_scores, sed, n_factors)

    # z_critical for p<0.05
    z_05 = 1.960

    for entry in distinguishing:
        s = entry["statement_idx"]
        found_significant_pair = False
        for i in range(n_factors):
            for j in range(i + 1, n_factors):
                if np.isnan(z_scores[s, i]) or np.isnan(z_scores[s, j]):
                    continue
                sed_val = sed[i, j]
                if sed_val <= 0:
                    continue
                diff = abs(z_scores[s, i] - z_scores[s, j])
                if diff > sed_val * z_05:
                    found_significant_pair = True
                    break
            if found_significant_pair:
                break

        assert found_significant_pair, (
            f"Statement {s} classified as distinguishing but no factor pair has "
            f"|z_i - z_j| > SED * {z_05:.3f}. z_scores={z_scores[s]}, sed={sed}"
        )


# ---------------------------------------------------------------------------
# 7. compute_preview_range row matches a real run_analysis run
# ---------------------------------------------------------------------------


@given(matrix=q_sort_matrix_small())
@settings(max_examples=10, deadline=15_000, suppress_health_check=[HealthCheck.too_slow])
def test_preview_range_matches_run_analysis(matrix: np.ndarray) -> None:
    """For a given k, preview-range row equals a real run_analysis(k) on counts.

    This pins the contract that preview-range is N real runs, not a single-pass
    approximation. n_distinguishing and n_consensus must agree.
    """
    n_statements, n_participants = matrix.shape
    k = _safe_n_factors(matrix)
    grid_config = _make_grid_config(n_statements)

    # Build a minimal SortDataDump that round-trips through build_sort_matrix.
    # The keys required by build_sort_matrix are:
    #   dump["study"]["statements"] (list of n_statements StatementDumpRecord-shaped dicts)
    #   dump["participants"] (list of dicts with "scores", "status", "is_discarded")
    # We give each participant status="completed" and is_discarded=False so the
    # variance filter keeps them all (the strategy already filters zero-variance).
    dump = {
        "study": {
            "id": 1,
            "grid_config": grid_config,
            "statements": [
                {
                    "id": j,
                    "code": f"S{j}",
                    "translations": [{"language_code": "en", "text": f"s{j}"}],
                }
                for j in range(n_statements)
            ],
        },
        "participants": [
            {
                "id": i,
                "label": f"P{i}",
                "scores": matrix[:, i].tolist(),
                "status": "completed",
                "is_discarded": False,
            }
            for i in range(n_participants)
        ],
    }

    rows = compute_preview_range(
        dump,  # type: ignore[arg-type]  # minimal dict, structurally matches SortDataDump
        [k],
        "pca",
        "varimax",
        "auto",
    )
    real = run_analysis(
        matrix,
        n_factors=k,
        extraction="pca",
        rotation="varimax",
        flagging="auto",
        grid_config=grid_config,
    )
    assert rows[0]["n_distinguishing"] == len(real["distinguishing"])
    assert rows[0]["n_consensus"] == len(real["consensus"])
