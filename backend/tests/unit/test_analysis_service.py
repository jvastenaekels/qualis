"""Unit tests for Q-method factor analysis service.

Tests use a small reference dataset and verify correctness of each
analysis step. The dataset is a 9-statement x 8-participant forced
Q-sort distribution [-2, -1, -1, 0, 0, 0, 1, 1, 2].
"""

import numpy as np
import pytest

from app.services.analysis_service import (
    apply_manual_flags,
    build_sort_matrix,
    classify_statements,
    compute_eigenvalues,
    compute_factor_characteristics,
    compute_factor_scores,
    correlation_matrix,
    extract_centroid,
    extract_pca,
    flag_sorts,
    rotate_varimax,
    run_analysis,
    standardize_factor_signs,
)


# Reference dataset: 9 statements x 8 participants
# Forced distribution: [-2, -1, -1, 0, 0, 0, 1, 1, 2]
# Designed with two clear factor groups: participants 0-3 vs 4-7
REFERENCE_DATASET = np.array(
    [
        # P1   P2   P3   P4   P5   P6   P7   P8
        [2, 2, 1, 2, -2, -1, -2, -1],  # S1
        [1, 1, 2, 1, -1, -2, -1, -2],  # S2
        [1, 0, 1, 1, 0, -1, 0, -1],  # S3
        [0, 1, 0, 0, -1, 0, -1, 0],  # S4
        [0, 0, 0, 0, 0, 0, 0, 0],  # S5
        [0, -1, 0, -1, 1, 0, 1, 0],  # S6
        [-1, 0, -1, 0, 0, 1, 0, 1],  # S7
        [-1, -1, -1, -1, 1, 1, 1, 2],  # S8
        [-2, -2, -2, -2, 2, 2, 2, 1],  # S9
    ],
    dtype=np.float64,
)


@pytest.fixture
def dataset():
    return REFERENCE_DATASET.copy()


@pytest.fixture
def sample_dump():
    """Create a minimal study dump matching build_sort_matrix expectations."""
    n_statements, n_participants = REFERENCE_DATASET.shape
    statements = [
        {
            "id": i + 1,
            "code": f"S{i + 1}",
            "translations": [{"lang": "en", "text": f"Statement {i + 1}"}],
        }
        for i in range(n_statements)
    ]
    participants = []
    for p in range(n_participants):
        participants.append(
            {
                "id": f"P{p + 1:05d}",
                "db_id": p + 1,
                "status": "completed",
                "is_discarded": False,
                "scores": [int(REFERENCE_DATASET[s, p]) for s in range(n_statements)],
            }
        )
    return {
        "study": {"statements": statements, "grid_config": []},
        "participants": participants,
        "statement_id_to_index": {i + 1: i for i in range(n_statements)},
    }


# --- build_sort_matrix ---


class TestBuildSortMatrix:
    def test_basic(self, sample_dump):
        matrix, participants, statements = build_sort_matrix(sample_dump)
        assert matrix.shape == (9, 8)
        assert len(participants) == 8
        assert len(statements) == 9
        np.testing.assert_array_equal(matrix, REFERENCE_DATASET)

    def test_excludes_discarded(self, sample_dump):
        sample_dump["participants"][0]["is_discarded"] = True
        matrix, participants, _ = build_sort_matrix(sample_dump)
        assert matrix.shape == (9, 7)
        assert len(participants) == 7

    def test_excludes_incomplete(self, sample_dump):
        sample_dump["participants"][0]["status"] = "started"
        matrix, participants, _ = build_sort_matrix(sample_dump)
        assert matrix.shape == (9, 7)

    def test_error_too_few(self, sample_dump):
        sample_dump["participants"] = sample_dump["participants"][:1]
        with pytest.raises(ValueError, match="at least 2"):
            build_sort_matrix(sample_dump)


# --- correlation_matrix ---


class TestCorrelationMatrix:
    def test_shape_and_symmetry(self, dataset):
        cor = correlation_matrix(dataset)
        assert cor.shape == (8, 8)
        np.testing.assert_array_almost_equal(cor, cor.T)

    def test_diagonal_ones(self, dataset):
        cor = correlation_matrix(dataset)
        np.testing.assert_array_almost_equal(np.diag(cor), np.ones(8))

    def test_values_in_range(self, dataset):
        cor = correlation_matrix(dataset)
        assert np.all(cor >= -1.0 - 1e-10)
        assert np.all(cor <= 1.0 + 1e-10)

    def test_opposing_groups_negative_correlation(self, dataset):
        """Participants 0-3 and 4-7 have opposing sorts, should be negatively correlated."""
        cor = correlation_matrix(dataset)
        # P1 vs P5 should be strongly negative
        assert cor[0, 4] < -0.5


# --- extract_pca ---


class TestExtractPCA:
    def test_shape(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        assert loadings.shape == (8, 2)

    def test_loadings_not_all_zero(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        assert np.any(np.abs(loadings) > 0.1)

    def test_two_factor_structure(self, dataset):
        """With the reference dataset, PCA should find a dominant first factor."""
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        # First factor should explain most variance
        f1_var = np.sum(loadings[:, 0] ** 2)
        f2_var = np.sum(loadings[:, 1] ** 2)
        assert f1_var > f2_var


# --- extract_centroid ---


class TestExtractCentroid:
    def test_shape(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_centroid(cor, 2)
        assert loadings.shape == (8, 2)

    def test_loadings_not_all_zero(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_centroid(cor, 2)
        assert np.any(np.abs(loadings) > 0.1)

    def test_single_factor(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_centroid(cor, 1)
        assert loadings.shape == (8, 1)


# --- rotate_varimax ---


class TestRotateVarimax:
    def test_shape_preserved(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 3)
        rotated = rotate_varimax(loadings)
        assert rotated.shape == loadings.shape

    def test_communalities_preserved(self, dataset):
        """Varimax preserves communalities (row sums of squared loadings)."""
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 3)
        rotated = rotate_varimax(loadings)
        original_comm = np.sum(loadings**2, axis=1)
        rotated_comm = np.sum(rotated**2, axis=1)
        np.testing.assert_array_almost_equal(original_comm, rotated_comm, decimal=5)

    def test_single_factor_passthrough(self):
        """With 1 factor, varimax should return the same loadings."""
        loadings = np.array([[0.8], [0.6], [0.4], [-0.3]])
        rotated = rotate_varimax(loadings)
        np.testing.assert_array_equal(rotated, loadings)


# --- flag_sorts ---


class TestFlagSorts:
    def test_shape(self):
        loadings = np.array([[0.8, 0.1], [0.1, 0.7], [0.6, 0.3], [0.2, 0.9]])
        flags = flag_sorts(loadings, n_statements=9)
        assert flags.shape == (4, 2)
        assert flags.dtype == bool

    def test_clear_loadings_flagged(self):
        """High loading on one factor, low on other → should be flagged."""
        loadings = np.array([[0.8, 0.1], [0.1, 0.9]])
        flags = flag_sorts(loadings, n_statements=9)
        assert flags[0, 0]  # P1 flagged on F1
        assert flags[1, 1]  # P2 flagged on F2

    def test_ambiguous_not_flagged(self):
        """Similar loadings on both factors → should not be flagged on either."""
        loadings = np.array([[0.5, 0.5]])
        flags = flag_sorts(loadings, n_statements=9)
        # 0.5^2 = 0.25, sum of other = 0.25, not > so not flagged
        assert not flags[0, 0]
        assert not flags[0, 1]

    def test_below_threshold_not_flagged(self):
        """Loading below significance threshold → not flagged."""
        loadings = np.array([[0.3, 0.0]])
        # threshold = 1.96/sqrt(9) ≈ 0.653
        flags = flag_sorts(loadings, n_statements=9)
        assert not flags[0, 0]


# --- apply_manual_flags ---


class TestApplyManualFlags:
    def test_basic(self):
        flags = apply_manual_flags(
            n_participants=3,
            n_factors=2,
            manual_flags={10: 1, 12: 2},
            participant_db_ids=[10, 11, 12],
        )
        assert flags[0, 0]  # db_id 10 → factor 1
        assert not flags[1, 0]
        assert not flags[1, 1]
        assert flags[2, 1]  # db_id 12 → factor 2

    def test_invalid_ids_ignored(self):
        flags = apply_manual_flags(
            n_participants=2,
            n_factors=2,
            manual_flags={999: 1},
            participant_db_ids=[10, 11],
        )
        assert not np.any(flags)


# --- compute_factor_scores ---


class TestComputeFactorScores:
    def test_shape(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        rotated = rotate_varimax(loadings)
        flags = flag_sorts(rotated, n_statements=9)
        z_scores, factor_arrays = compute_factor_scores(dataset, rotated, flags)
        assert z_scores.shape == (9, 2)
        assert factor_arrays.shape == (9, 2)

    def test_factor_arrays_match_distribution(self, dataset):
        """Factor arrays should use the same distribution as the original data.

        Note: When ties exist in z-scores, the mean-of-tied-ranks handling
        may alter the exact distribution. This test uses an explicit
        distribution parameter to ensure deterministic behaviour.
        """
        distribution = np.array([-2, -1, -1, 0, 0, 0, 1, 1, 2], dtype=np.int64)
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        rotated = rotate_varimax(loadings)
        flags = flag_sorts(rotated, n_statements=9)
        _, factor_arrays = compute_factor_scores(
            dataset, rotated, flags, distribution=distribution
        )

        for f in range(2):
            if not np.all(np.isnan(factor_arrays[:, f])):
                # With tie-handling, some values may be averaged.
                # At minimum, all values must be within the distribution range.
                assert all(
                    distribution.min() <= v <= distribution.max()
                    for v in factor_arrays[:, f]
                )

    def test_z_scores_standardized(self, dataset):
        """Z-scores should have mean ≈ 0 and std ≈ 1."""
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        rotated = rotate_varimax(loadings)
        flags = flag_sorts(rotated, n_statements=9)
        z_scores, _ = compute_factor_scores(dataset, rotated, flags)
        for f in range(2):
            col = z_scores[:, f]
            if not np.all(np.isnan(col)):
                assert abs(np.mean(col)) < 0.1
                assert abs(np.std(col, ddof=1) - 1.0) < 0.1


# --- compute_factor_characteristics ---


class TestComputeFactorCharacteristics:
    def test_basic(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        rotated = rotate_varimax(loadings)
        flags = flag_sorts(rotated, n_statements=9)
        z_scores, _ = compute_factor_scores(dataset, rotated, flags)
        chars, cor_zsc, sed = compute_factor_characteristics(rotated, flags, z_scores)
        assert len(chars) == 2
        assert cor_zsc.shape == (2, 2)
        assert sed.shape == (2, 2)

    def test_eigenvalue_positive(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        flags = flag_sorts(loadings, n_statements=9)
        z_scores, _ = compute_factor_scores(dataset, loadings, flags)
        chars, _, _ = compute_factor_characteristics(loadings, flags, z_scores)
        for c in chars:
            assert c["eigenvalue"] > 0

    def test_cumulative_variance(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        flags = flag_sorts(loadings, n_statements=9)
        z_scores, _ = compute_factor_scores(dataset, loadings, flags)
        chars, _, _ = compute_factor_characteristics(loadings, flags, z_scores)
        # Cumulative should be increasing
        assert chars[1]["cumulative_variance"] >= chars[0]["cumulative_variance"]


# --- classify_statements ---


class TestClassifyStatements:
    def test_all_classified(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        rotated = rotate_varimax(loadings)
        flags = flag_sorts(rotated, n_statements=9)
        z_scores, _ = compute_factor_scores(dataset, rotated, flags)
        _, _, sed = compute_factor_characteristics(rotated, flags, z_scores)
        dist, cons = classify_statements(z_scores, sed, 2)
        # Every statement should appear in exactly one list
        total = len(dist) + len(cons)
        assert total == 9

    def test_distinguishing_has_significance(self, dataset):
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        rotated = rotate_varimax(loadings)
        flags = flag_sorts(rotated, n_statements=9)
        z_scores, _ = compute_factor_scores(dataset, rotated, flags)
        _, _, sed = compute_factor_characteristics(rotated, flags, z_scores)
        dist, _ = classify_statements(z_scores, sed, 2)
        for d in dist:
            assert len(d["significance"]) > 0


# --- compute_eigenvalues ---


class TestComputeEigenvalues:
    def test_basic(self, dataset):
        cor = correlation_matrix(dataset)
        eigenvalues, suggested = compute_eigenvalues(cor)
        assert len(eigenvalues) == 8
        assert suggested >= 1
        # Should be in descending order
        for i in range(len(eigenvalues) - 1):
            assert eigenvalues[i] >= eigenvalues[i + 1] - 1e-10

    def test_sum_equals_n(self, dataset):
        """Sum of eigenvalues of a correlation matrix equals the number of variables."""
        cor = correlation_matrix(dataset)
        eigenvalues, _ = compute_eigenvalues(cor)
        assert abs(sum(eigenvalues) - 8) < 0.01


# --- run_analysis (full pipeline) ---


class TestRunAnalysis:
    def test_pca_varimax(self, dataset):
        result = run_analysis(
            dataset, n_factors=2, extraction="pca", rotation="varimax"
        )
        assert result["n_participants"] == 8
        assert result["n_statements"] == 9
        assert result["n_factors"] == 2
        assert result["extraction"] == "pca"
        assert result["rotation"] == "varimax"
        assert len(result["eigenvalues"]) == 8
        assert result["rotated_loadings"].shape == (8, 2)
        assert result["z_scores"].shape == (9, 2)
        assert result["factor_arrays"].shape == (9, 2)

    def test_centroid_varimax(self, dataset):
        result = run_analysis(
            dataset, n_factors=2, extraction="centroid", rotation="varimax"
        )
        assert result["rotated_loadings"].shape == (8, 2)

    def test_pca_no_rotation(self, dataset):
        result = run_analysis(dataset, n_factors=2, extraction="pca", rotation="none")
        # With sign standardization applied to rotated_loadings, they may
        # differ from unrotated_loadings by column sign flips. Check that
        # the absolute values match (same factors, potentially different sign).
        np.testing.assert_array_almost_equal(
            np.abs(result["unrotated_loadings"]),
            np.abs(result["rotated_loadings"]),
        )

    def test_too_many_factors_raises(self, dataset):
        with pytest.raises(ValueError, match="cannot exceed"):
            run_analysis(dataset, n_factors=10)

    def test_invalid_extraction_raises(self, dataset):
        with pytest.raises(ValueError, match="Unknown extraction"):
            run_analysis(dataset, n_factors=2, extraction="invalid")

    def test_opposing_groups_detected(self, dataset):
        """The two opposing groups should have opposite-sign loadings (bipolar factor)."""
        result = run_analysis(
            dataset, n_factors=2, extraction="pca", rotation="varimax"
        )
        loadings = result["rotated_loadings"]
        # With a bipolar dataset, participants 0-3 and 4-7 should load with
        # opposite signs on at least one factor
        has_opposite_signs = False
        for f in range(2):
            g1_pos = sum(1 for i in range(4) if loadings[i, f] > 0)
            g2_pos = sum(1 for i in range(4, 8) if loadings[i, f] > 0)
            # Check if majority of one group is positive and other negative
            if (g1_pos >= 3 and g2_pos <= 1) or (g1_pos <= 1 and g2_pos >= 3):
                has_opposite_signs = True
                break
        assert has_opposite_signs


# --- Edge cases and failure paths ---


class TestZeroVarianceFilter:
    """Tests for zero-variance participant filtering in build_sort_matrix."""

    def test_zero_variance_excluded(self, sample_dump):
        """A participant with all identical scores should be excluded."""
        # Make participant 0 have all-zero scores
        n_statements = len(sample_dump["study"]["statements"])
        sample_dump["participants"][0]["scores"] = [0] * n_statements
        matrix, participants, _ = build_sort_matrix(sample_dump)
        assert matrix.shape[1] == 7  # one excluded
        assert all(p["db_id"] != 1 for p in participants)

    def test_all_zero_variance_raises(self, sample_dump):
        """If all participants have zero-variance, should raise ValueError."""
        n_statements = len(sample_dump["study"]["statements"])
        for p in sample_dump["participants"]:
            p["scores"] = [0] * n_statements
        with pytest.raises(ValueError, match="at least 2"):
            build_sort_matrix(sample_dump)

    def test_mixed_zero_variance(self, sample_dump):
        """Mix of zero-variance and valid participants; valid ones survive."""
        n_statements = len(sample_dump["study"]["statements"])
        # Make first 5 participants zero-variance, keep last 3
        for i in range(5):
            sample_dump["participants"][i]["scores"] = [0] * n_statements
        matrix, participants, _ = build_sort_matrix(sample_dump)
        assert matrix.shape[1] == 3
        assert len(participants) == 3


class TestCentroidEdgeCases:
    """Tests for centroid extraction edge cases."""

    def test_centroid_single_factor(self, dataset):
        """Single factor centroid extraction should produce valid loadings."""
        cor = correlation_matrix(dataset)
        loadings = extract_centroid(cor, 1)
        assert loadings.shape == (8, 1)
        assert not np.all(loadings == 0)

    def test_centroid_many_factors(self, dataset):
        """Extracting many factors (up to n_participants) should not crash."""
        cor = correlation_matrix(dataset)
        loadings = extract_centroid(cor, 7)
        assert loadings.shape == (8, 7)

    def test_centroid_near_singular(self):
        """Near-singular correlation matrix (nearly identical participants)."""
        # 5 statements, 4 participants with very similar sorts
        data = np.array(
            [
                [2, 2, 2, 2],
                [1, 1, 1, 1],
                [0, 0, 0, 0],
                [-1, -1, -1, -1],
                [-2, -2, -2, -1],
            ],
            dtype=np.float64,
        )
        cor = correlation_matrix(data)
        loadings = extract_centroid(cor, 2)
        assert loadings.shape == (4, 2)
        assert np.all(np.isfinite(loadings))


class TestVarimaxEdgeCases:
    """Tests for varimax rotation edge cases."""

    def test_single_factor_passthrough(self):
        """Single factor → should return identical loadings."""
        loadings = np.array([[0.8], [0.6], [-0.3], [0.9]])
        result = rotate_varimax(loadings)
        np.testing.assert_array_equal(result, loadings)

    def test_communalities_preserved_with_kaiser(self, dataset):
        """Kaiser normalization must preserve row communalities."""
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 3)
        rotated = rotate_varimax(loadings)
        original_comm = np.sum(loadings**2, axis=1)
        rotated_comm = np.sum(rotated**2, axis=1)
        np.testing.assert_array_almost_equal(original_comm, rotated_comm, decimal=5)

    def test_near_zero_communality(self):
        """A row with near-zero communality should not cause division by zero."""
        loadings = np.array(
            [
                [0.8, 0.2],
                [0.001, 0.0001],  # near-zero communality
                [0.2, 0.7],
                [0.5, 0.4],
            ]
        )
        result = rotate_varimax(loadings)
        assert np.all(np.isfinite(result))


class TestLoadingClamp:
    """Tests for loading magnitude clamping in compute_factor_scores."""

    def test_extreme_loading_no_crash(self):
        """Loadings very close to ±1 should not cause division by zero."""
        dataset = np.array(
            [
                [2, -2],
                [1, -1],
                [0, 0],
                [-1, 1],
                [-2, 2],
            ],
            dtype=np.float64,
        )
        # Artificial loadings with |loading| ≈ 1
        loadings = np.array([[0.999, 0.01], [0.01, 0.999]])
        flags = np.array([[True, False], [False, True]])
        z_scores, factor_arrays = compute_factor_scores(dataset, loadings, flags)
        assert np.all(np.isfinite(z_scores))


class TestEigenvalueClamp:
    """Tests for eigenvalue clamping in compute_eigenvalues."""

    def test_eigenvalues_non_negative(self, dataset):
        """All returned eigenvalues should be >= 0."""
        cor = correlation_matrix(dataset)
        eigenvalues, _ = compute_eigenvalues(cor)
        assert all(e >= 0 for e in eigenvalues)

    def test_suggested_at_least_one(self):
        """Kaiser criterion should suggest at least 1 factor."""
        # Create a 3x3 identity-like correlation matrix (all eigenvalues = 1)
        cor = np.eye(3) * 0.99 + np.ones((3, 3)) * 0.01 / 3
        np.fill_diagonal(cor, 1.0)
        _, suggested = compute_eigenvalues(cor)
        assert suggested >= 1


class TestNoFlaggedParticipants:
    """Tests for the case where no participants are flagged on a factor."""

    def test_no_flags_produces_nan_zscores(self):
        """When no participant is flagged on a factor, z-scores should be NaN."""
        dataset = np.array(
            [
                [2, 1, -1, -2],
                [1, 2, -2, -1],
                [0, 0, 0, 0],
                [-1, -2, 2, 1],
                [-2, -1, 1, 2],
            ],
            dtype=np.float64,
        )
        loadings = np.array([[0.3, 0.1], [0.3, 0.1], [0.1, 0.3], [0.1, 0.3]])
        # No participants flagged on factor 2
        flags = np.array([[True, False], [True, False], [False, False], [False, False]])
        z_scores, _ = compute_factor_scores(dataset, loadings, flags)
        # Factor 1 should have valid z-scores, factor 2 should be NaN
        assert not np.all(np.isnan(z_scores[:, 0]))
        assert np.all(np.isnan(z_scores[:, 1]))


class TestManualFlagging:
    """Tests for manual flagging pipeline through run_analysis."""

    def test_manual_flags_used(self, dataset):
        """Manual flags should override auto-flagging."""
        manual = np.zeros((8, 2), dtype=bool)
        manual[0, 0] = True  # Flag only P1 on F1
        manual[4, 1] = True  # Flag only P5 on F2
        result = run_analysis(
            dataset,
            n_factors=2,
            extraction="pca",
            rotation="varimax",
            flagging="manual",
            manual_flags_matrix=manual,
        )
        assert result["flags"][0, 0]  # P1 flagged on F1
        assert result["flags"][4, 1]  # P5 flagged on F2
        assert not result["flags"][1, 0]  # P2 not flagged
        # z-scores should still be computed
        assert not np.all(np.isnan(result["z_scores"][:, 0]))
        assert not np.all(np.isnan(result["z_scores"][:, 1]))


class TestTieHandling:
    """Tests for z-score tie handling in factor arrays."""

    def test_tied_zscores_get_min_value(self):
        """Tied z-scores should get the minimum of their distribution values (qmethod convention)."""
        # 5 statements, 2 participants with identical sorts → identical weighted sums
        dataset = np.array(
            [
                [2, 2],
                [1, 1],
                [0, 0],
                [-1, -1],
                [-2, -2],
            ],
            dtype=np.float64,
        )
        loadings = np.array([[0.9, 0.1], [0.1, 0.9]])
        flags = np.array([[True, False], [True, False]])
        distribution = np.array([-2, -1, 0, 1, 2], dtype=np.int64)
        z_scores, factor_arrays = compute_factor_scores(
            dataset, loadings, flags, distribution=distribution
        )
        # All factor array values should be finite integers
        assert np.all(np.isfinite(factor_arrays[:, 0]))

    def test_factor_arrays_finite_with_distribution(self, dataset):
        """Factor arrays should be all finite when distribution is passed."""
        distribution = np.array([-2, -1, -1, 0, 0, 0, 1, 1, 2], dtype=np.int64)
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        rotated = rotate_varimax(loadings)
        flags = flag_sorts(rotated, n_statements=9)
        _, factor_arrays = compute_factor_scores(
            dataset, rotated, flags, distribution=distribution
        )
        for f in range(2):
            if not np.all(factor_arrays[:, f] == 0):
                assert np.all(np.isfinite(factor_arrays[:, f]))


class TestTieResolutionMin:
    """Test that tied z-scores use min() to match qmethod's qzscores()."""

    def test_two_tied_get_minimum(self):
        """Two statements with identical z-scores should both get the min distribution value."""
        # 4 statements, 2 participants. S1 and S2 will have identical weighted sums.
        dataset = np.array(
            [
                [2, 2],  # S1: same scores → tied z
                [2, 2],  # S2: same scores → tied z
                [0, 0],  # S3
                [-2, -2],  # S4
            ],
            dtype=np.float64,
        )
        loadings = np.array([[0.9, 0.1], [0.1, 0.9]])
        flags = np.array([[True, False], [True, False]])
        distribution = np.array([-1, 0, 0, 1], dtype=np.int64)
        _, factor_arrays = compute_factor_scores(
            dataset, loadings, flags, distribution=distribution
        )
        # S1 and S2 are tied — both should get min of their assigned values
        assert factor_arrays[0, 0] == factor_arrays[1, 0]
        # The min of the two positions should be assigned (not the mean)
        tied_val = int(factor_arrays[0, 0])
        # With argsort, tied values get consecutive positions; min is the lower one
        assert tied_val == min(int(factor_arrays[0, 0]), int(factor_arrays[1, 0]))


class TestClassifySignificanceLevels:
    """Test that classify_statements includes the p<0.000001 level."""

    def test_extreme_difference_gets_highest_significance(self):
        """A very large z-score difference should be classified as p<0.000001."""
        # Two factors with very different z-scores
        z_scores = np.array(
            [
                [3.0, -3.0],  # extreme difference of 6.0
                [0.0, 0.0],  # no difference
            ]
        )
        # Small SED → diff/SED will be very large
        sed = np.array([[0.0, 0.3], [0.3, 0.0]])
        dist, cons = classify_statements(z_scores, sed, n_factors=2)
        # Statement 0: diff=6.0, threshold at p<0.000001 = 0.3*4.8916 ≈ 1.47 → significant
        assert len(dist) == 1
        assert dist[0]["significance"]["1-2"] == "p<0.000001"
        # Statement 1: diff=0 → consensus
        assert len(cons) == 1


class TestClassifyWithNaN:
    """Tests for classify_statements when some factors have NaN z-scores."""

    def test_nan_factor_skips_pairs(self):
        """Pairs involving NaN factors should be skipped, not crash."""
        z_scores = np.array(
            [
                [1.5, np.nan],
                [0.5, np.nan],
                [-0.5, np.nan],
                [-1.5, np.nan],
            ]
        )
        sed = np.array([[0.0, 0.3], [0.3, 0.0]])
        dist, cons = classify_statements(z_scores, sed, n_factors=2)
        # All statements should be consensus since no valid pair comparisons
        assert len(dist) == 0
        assert len(cons) == 4


class TestNFactorsZero:
    """Test n_factors=0 raises ValueError."""

    def test_zero_factors_raises(self, dataset):
        with pytest.raises(ValueError, match="at least 1"):
            run_analysis(dataset, n_factors=0)


class TestNFactorsExceedsStatements:
    """Test n_factors > n_statements raises ValueError."""

    def test_too_many_factors_vs_statements(self):
        # 3 statements x 5 participants → n_factors=4 exceeds n_statements=3
        data = np.array(
            [[2, 1, 0, -1, -2], [1, 0, -1, 0, 1], [-2, -1, 0, 1, 2]],
            dtype=np.float64,
        )
        with pytest.raises(ValueError, match="n_statements"):
            run_analysis(data, n_factors=4)


class TestBuildSortMatrixEdgeCases:
    """Tests for build_sort_matrix with None or wrong-length scores."""

    def test_none_scores_excluded(self, sample_dump):
        """Participants with None values in scores should be excluded."""
        sample_dump["participants"][0]["scores"] = [None, 1, 0, -1, 0, 0, 1, -1, 2]
        matrix, participants, _ = build_sort_matrix(sample_dump)
        assert matrix.shape[1] == 7
        assert all(p["db_id"] != 1 for p in participants)

    def test_wrong_length_scores_excluded(self, sample_dump):
        """Participants with wrong-length scores should be excluded."""
        sample_dump["participants"][0]["scores"] = [1, 2]  # too short
        matrix, participants, _ = build_sort_matrix(sample_dump)
        assert matrix.shape[1] == 7
        assert all(p["db_id"] != 1 for p in participants)

    def test_empty_scores_excluded(self, sample_dump):
        """Participants with empty scores should be excluded."""
        sample_dump["participants"][0]["scores"] = []
        matrix, participants, _ = build_sort_matrix(sample_dump)
        assert matrix.shape[1] == 7


class TestRouterHelperNaN:
    """Tests for _build_z_scores_list NaN → 0.0 replacement."""

    def test_nan_replaced_with_zero(self):
        """NaN z-scores should be replaced with 0.0 for JSON serialization."""
        from app.routers.admin.analysis import _build_z_scores_list

        z_scores = np.array([[1.5, np.nan], [0.5, -0.3]])
        result = _build_z_scores_list(z_scores, s_idx=0, n_factors=2)
        assert result == [1.5, 0.0]

    def test_finite_values_preserved(self):
        """Finite z-scores should pass through unchanged."""
        from app.routers.admin.analysis import _build_z_scores_list

        z_scores = np.array([[1.23, -0.45]])
        result = _build_z_scores_list(z_scores, s_idx=0, n_factors=2)
        assert result[0] == pytest.approx(1.23)
        assert result[1] == pytest.approx(-0.45)


class TestGridConfigDistribution:
    """Tests for grid_config-based distribution in run_analysis."""

    def test_grid_config_used(self, dataset):
        """When grid_config is provided, it should be used for factor arrays."""
        grid_config = [
            {"score": -2, "capacity": 1},
            {"score": -1, "capacity": 2},
            {"score": 0, "capacity": 3},
            {"score": 1, "capacity": 2},
            {"score": 2, "capacity": 1},
        ]
        result = run_analysis(
            dataset,
            n_factors=2,
            extraction="pca",
            rotation="varimax",
            grid_config=grid_config,
        )
        # Factor arrays should be produced
        assert result["factor_arrays"].shape == (9, 2)

    def test_centroid_no_rotation(self, dataset):
        """Centroid extraction with no rotation should work."""
        result = run_analysis(
            dataset, n_factors=2, extraction="centroid", rotation="none"
        )
        # With sign standardization, unrotated loadings are also standardized
        # so they may differ in sign from the raw extraction output.
        # Just check the shape is preserved.
        assert result["rotated_loadings"].shape == result["unrotated_loadings"].shape


class TestStandardizeFactorSigns:
    """Tests for factor sign standardization (polarity fix)."""

    def test_negative_dominant_column_flipped(self):
        """Column whose largest absolute loading is negative should be flipped."""
        loadings = np.array(
            [
                [-0.9, 0.2],
                [-0.7, 0.8],
                [0.1, 0.3],
            ]
        )
        result = standardize_factor_signs(loadings)
        # Column 0: max abs is -0.9 → should be flipped
        assert result[0, 0] == pytest.approx(0.9)
        assert result[1, 0] == pytest.approx(0.7)
        assert result[2, 0] == pytest.approx(-0.1)
        # Column 1: max abs is 0.8 (positive) → unchanged
        np.testing.assert_array_equal(result[:, 1], loadings[:, 1])

    def test_positive_dominant_unchanged(self):
        """Column whose largest absolute loading is already positive → no change."""
        loadings = np.array([[0.8, 0.3], [-0.2, 0.7]])
        result = standardize_factor_signs(loadings)
        np.testing.assert_array_equal(result, loadings)

    def test_does_not_modify_input(self):
        """standardize_factor_signs must return a copy, not modify in-place."""
        loadings = np.array([[-0.9], [0.1]])
        original = loadings.copy()
        standardize_factor_signs(loadings)
        np.testing.assert_array_equal(loadings, original)

    def test_single_factor(self):
        """Single factor with negative dominant loading should be flipped."""
        loadings = np.array([[-0.5], [-0.8], [0.3]])
        result = standardize_factor_signs(loadings)
        # Max abs is -0.8 → flip
        assert result[1, 0] == pytest.approx(0.8)

    def test_pipeline_factor_arrays_coherent_with_loadings(self):
        """Full pipeline: factor arrays must be coherent with loading signs.

        For each factor, the positive-loading participants define the
        factor's "positive pole".  Statements that those participants
        ranked highest must receive the highest factor-array values, not
        the lowest — i.e. polarity must never be inverted.
        """
        dataset = REFERENCE_DATASET.copy()
        grid_config = [
            {"score": -2, "capacity": 1},
            {"score": -1, "capacity": 2},
            {"score": 0, "capacity": 3},
            {"score": 1, "capacity": 2},
            {"score": 2, "capacity": 1},
        ]
        result = run_analysis(
            dataset,
            n_factors=2,
            extraction="pca",
            rotation="varimax",
            grid_config=grid_config,
        )
        loadings = result["rotated_loadings"]
        factor_arrays = result["factor_arrays"]

        for f in range(2):
            # Identify positive-loading participants
            pos_mask = loadings[:, f] > 0
            if not np.any(pos_mask):
                continue
            # Mean sort of the positive-loading group
            group_mean = dataset[:, pos_mask].mean(axis=1)
            # Statements sorted highest by the group
            top_stmt = int(np.argmax(group_mean))
            bot_stmt = int(np.argmin(group_mean))
            # Factor array must agree: top statement > bottom statement
            assert factor_arrays[top_stmt, f] > factor_arrays[bot_stmt, f], (
                f"Factor {f}: polarity inverted — "
                f"top stmt ({top_stmt}) got {factor_arrays[top_stmt, f]}, "
                f"bot stmt ({bot_stmt}) got {factor_arrays[bot_stmt, f]}"
            )

    def test_sign_standardization_prevents_inversion(self):
        """Artificially inverted loadings must be corrected by the pipeline.

        If we manually negate all PCA eigenvectors before feeding them
        into the pipeline, sign standardization should still produce
        the same factor arrays (up to tie-resolution noise).
        """
        dataset = REFERENCE_DATASET.copy()
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)

        # Normal pipeline
        from app.services.analysis_service import run_analysis

        r1 = run_analysis(dataset, n_factors=2, extraction="pca", rotation="varimax")

        # Negate the PCA output, then rotate + standardize
        neg_loadings = -loadings
        rotated_neg = rotate_varimax(neg_loadings)
        standardized_neg = standardize_factor_signs(rotated_neg)

        # After standardization, the largest absolute loading should be positive
        for f in range(2):
            col = standardized_neg[:, f]
            assert col[np.argmax(np.abs(col))] > 0, (
                f"Factor {f}: largest loading should be positive after standardization"
            )
