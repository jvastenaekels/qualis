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
                "is_test_run": False,
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

    def test_excludes_test_runs(self, sample_dump):
        sample_dump["participants"][0]["is_test_run"] = True
        matrix, participants, _ = build_sort_matrix(sample_dump)
        assert matrix.shape == (9, 7)

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
        """Factor arrays should use the same distribution as the original data."""
        cor = correlation_matrix(dataset)
        loadings = extract_pca(cor, 2)
        rotated = rotate_varimax(loadings)
        flags = flag_sorts(rotated, n_statements=9)
        _, factor_arrays = compute_factor_scores(dataset, rotated, flags)

        original_dist = sorted(dataset[:, 0].astype(int))  # [-2,-1,-1,0,0,0,1,1,2]
        for f in range(2):
            if not np.all(np.isnan(factor_arrays[:, f])):
                result_dist = sorted(factor_arrays[:, f])
                assert result_dist == original_dist

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
        np.testing.assert_array_equal(
            result["unrotated_loadings"], result["rotated_loadings"]
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
