"""Q-methodology factor analysis service.

Implements the standard Q-method analysis pipeline at feature parity with
the R 'qmethod' package (Zabala, 2014). Algorithms follow Brown (1980)
for centroid extraction and standard statistical methods for PCA,
varimax rotation, flagging, z-scores, and statement classification.

References:
    - Brown, S.R. (1980). Political Subjectivity. Yale University Press.
    - Watts, S. & Stenner, P. (2012). Doing Q Methodological Research. Sage.
    - Zabala, A. (2014). qmethod: A Package to Explore Human Perspectives
      Using Q Methodology. The R Journal, 6(2), 163-173.
"""

import logging
from itertools import combinations
from typing import TypedDict, cast

import numpy as np
from numpy.typing import NDArray

from app.types.wire import (
    SortDataDump,
    SortParticipantRecord,
    StatementDumpRecord,
    StudyDump,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Cluster 1 — Analysis wire types (private to this module)
# ---------------------------------------------------------------------------


class GridSlot(TypedDict):
    """One entry in a study's grid_config: {"score": int, "capacity": int}."""

    score: int
    capacity: int


class FactorCharacteristicDict(TypedDict):
    """Per-factor statistical characteristics built by compute_factor_characteristics."""

    factor: int
    eigenvalue: float
    variance_explained: float
    n_flagged: int
    avg_rel_coef: float
    composite_reliability: float
    se_factor_scores: float
    cumulative_variance: float


class StatementClassEntry(TypedDict):
    """One entry in the distinguishing/consensus lists from classify_statements."""

    statement_idx: int
    significance: dict[str, str]


class BootstrapStatementEntry(TypedDict):
    """Stability of one statement on one factor across the bootstrap.

    Output of ``compute_bootstrap_stability``. ``statement_idx`` is the
    row-index in the dataset matrix; the router maps it to the real
    statement_id (matching the regular ``z_scores`` -> ``statement_scores``
    translation).
    """

    statement_idx: int
    factor: int
    z_mean: float
    z_se: float
    ci_lower: float
    ci_upper: float


class BootstrapStabilityResult(TypedDict):
    """Return type of ``compute_bootstrap_stability``.

    Per-iteration distributions of z-scores are summarised into mean, SE
    and 95% empirical CI per (statement, factor). ``factor_mean_se``
    powers the per-factor mean-SE column in the factor characteristics
    table; the per-statement breakdown drives statement-level CI display.
    """

    n_iterations: int
    n_converged: int
    statements: list[BootstrapStatementEntry]
    factor_mean_se: list[float]


class PreviewSummary(TypedDict):
    """Per-k summary returned by compute_preview_range.

    All fields are descriptive — see the Phase Explorer spec for usage.
    `min_defining_sorts` is the minimum across factors of the count of
    flagged participants on each factor; `has_empty_factor` is True when
    at least one factor has zero defining sorts (over-factorisation).
    """

    n_factors: int
    cumulative_variance: float
    pct_flagged: float
    n_distinguishing: int
    n_cross_loaders: int
    n_consensus: int
    min_defining_sorts: int
    has_empty_factor: bool


class AnalysisRunResult(TypedDict):
    """Return type of run_analysis().

    All numpy arrays are kept as NDArray here; the router converts them to
    Python lists before serialisation (see admin/analysis.py).
    """

    n_participants: int
    n_statements: int
    n_factors: int
    extraction: str
    rotation: str
    eigenvalues: list[float]
    total_variance_explained: float
    unrotated_loadings: NDArray[np.float64]
    rotated_loadings: NDArray[np.float64]
    flags: NDArray[np.bool_]
    z_scores: NDArray[np.float64]
    factor_arrays: NDArray[np.int64]
    factor_characteristics: list[FactorCharacteristicDict]
    factor_correlation: NDArray[np.float64]
    distinguishing: list[StatementClassEntry]
    consensus: list[StatementClassEntry]
    manual_rotations: list[dict[str, object]]


def build_sort_matrix(
    dump: "SortDataDump | StudyDump",
) -> tuple[NDArray[np.float64], list[SortParticipantRecord], list[StatementDumpRecord]]:
    """Build the (n_statements x n_participants) sort matrix from a study dump.

    Accepts a ``SortDataDump`` or ``StudyDump`` TypedDict.

    Only includes completed, non-discarded, non-test participants with
    complete Q-sort data (no missing scores).

    Returns:
        Tuple of (matrix, valid_participants, statements) where:
        - matrix: shape (n_statements, n_participants)
        - valid_participants: list of SortParticipantRecord dicts that were included
        - statements: list of StatementDumpRecord dicts from the study
    """
    statements: list[StatementDumpRecord] = dump["study"]["statements"]
    n_statements = len(statements)

    valid_participants: list[SortParticipantRecord] = []
    columns: list[list[float]] = []

    for p in dump["participants"]:
        if p.get("is_discarded"):
            continue
        if p.get("status") != "completed":
            continue

        scores = p.get("scores", [])
        if len(scores) != n_statements:
            continue
        if any(s is None for s in scores):
            continue

        columns.append([float(s) for s in scores if s is not None])
        valid_participants.append(p)

    # Filter out zero-variance participants (all scores identical)
    filtered_columns: list[list[float]] = []
    filtered_participants: list[SortParticipantRecord] = []
    for col, p in zip(columns, valid_participants):
        if len(set(col)) > 1:
            filtered_columns.append(col)
            filtered_participants.append(p)
        else:
            logger.warning(
                "Excluding participant %s: zero-variance (all scores identical)",
                p.get("id", "unknown"),
            )
    columns = filtered_columns
    valid_participants = filtered_participants

    if len(valid_participants) < 2:
        raise ValueError(
            f"Need at least 2 valid participants for analysis, got {len(valid_participants)}"
        )

    # Shape: (n_statements, n_participants) — qmethod convention
    matrix = np.array(columns, dtype=np.float64).T
    return matrix, valid_participants, statements


def correlation_matrix(dataset: NDArray[np.float64]) -> NDArray[np.float64]:
    """Compute person-by-person Pearson correlation matrix.

    Args:
        dataset: shape (n_statements, n_participants)

    Returns:
        Correlation matrix of shape (n_participants, n_participants)

    Raises:
        ValueError: If the resulting matrix contains NaN (e.g. zero-variance
            columns that slipped past the build_sort_matrix filter).
    """
    cor = np.asarray(np.corrcoef(dataset, rowvar=False))
    if np.any(np.isnan(cor)):
        raise ValueError(
            "Correlation matrix contains NaN values. "
            "This usually means some participants have zero variance in their sorts."
        )
    return cor


def extract_pca(cor_mat: NDArray[np.float64], n_factors: int) -> NDArray[np.float64]:
    """Extract factors using Principal Component Analysis.

    Performs eigendecomposition of the correlation matrix and returns
    the top n_factors loadings (eigenvectors scaled by sqrt of eigenvalues).

    Args:
        cor_mat: Correlation matrix (n x n)
        n_factors: Number of factors to extract

    Returns:
        Loadings matrix of shape (n_participants, n_factors)
    """
    eigenvalues, eigenvectors = np.linalg.eigh(cor_mat)

    # eigh returns in ascending order; reverse to descending
    idx = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[idx]
    eigenvectors = eigenvectors[:, idx]

    # Select top n_factors
    eigenvalues = eigenvalues[:n_factors]
    eigenvectors = eigenvectors[:, :n_factors]

    # Clamp negative eigenvalues (rounding artifacts)
    eigenvalues = np.maximum(eigenvalues, 0.0)

    # Loadings = eigenvectors * sqrt(eigenvalues)
    loadings = eigenvectors * np.sqrt(eigenvalues)[np.newaxis, :]
    return cast(NDArray[np.float64], loadings)


def extract_centroid(
    cor_mat: NDArray[np.float64], n_factors: int, spc: float = 1e-5
) -> NDArray[np.float64]:
    """Extract factors using Brown's centroid method.

    Based on Brown (1980), Political Subjectivity, pp. 208-224.
    Iteratively extracts factors by maximizing the positive manifold
    and computing centroids of the correlation matrix.

    Args:
        cor_mat: Correlation matrix (n x n)
        n_factors: Number of factors to extract
        spc: Convergence threshold

    Returns:
        Loadings matrix of shape (n_participants, n_factors)

    Translated to Python in 2026 by Julien Vastenaekels from the R `qmethod`
    package (centroid.R, Frans Hermans, 2021), used under GPL-2+.
    See repository NOTICE.md for full attribution.
    """
    n = cor_mat.shape[0]
    tmat = cor_mat.copy()
    loadings = np.zeros((n, n_factors))

    for f in range(n_factors):
        np.fill_diagonal(tmat, 0.0)

        # Step 1: Maximize positive manifold by reflecting columns/rows
        refvec: list[int] = []
        col_sums = tmat.sum(axis=0)
        max_reflections = n * n

        for _ref_iter in range(max_reflections):
            if not np.any(col_sums < 0):
                break
            oo = int(np.argmin(col_sums))
            tmat[oo, :] *= -1
            tmat[:, oo] *= -1
            np.fill_diagonal(tmat, 0.0)
            refvec.append(oo)
            col_sums = tmat.sum(axis=0)
        else:
            logger.warning(
                "Centroid factor %d: reflection loop did not converge after %d iterations",
                f + 1,
                max_reflections,
            )

        # Step 2: Initial factor estimate
        col_sums = tmat.sum(axis=0)
        rmean = col_sums / (n - 1)
        t1 = rmean + col_sums
        sum_t1 = np.sum(t1)
        if sum_t1 <= 0:
            logger.warning(
                "Centroid factor %d: degenerate initial estimate (sum <= 0)",
                f + 1,
            )
            break
        f1 = t1 / np.sqrt(sum_t1)

        # Step 3: Iterate until convergence
        max_iter = 1000
        converged = False
        for _ in range(max_iter):
            rmean_new = f1**2
            sum_t2 = np.sum(tmat.sum(axis=0) + rmean_new)
            if sum_t2 <= 0:
                logger.warning(
                    "Centroid factor %d: degenerate matrix (sum <= 0)", f + 1
                )
                break
            t2 = tmat.sum(axis=0) + rmean_new
            f2 = t2 / np.sqrt(sum_t2)

            if np.all(np.abs(rmean_new - f2**2) < spc):
                f1 = f2
                converged = True
                break
            f1 = f2

        if not converged:
            logger.warning(
                "Centroid factor %d: did not converge after %d iterations",
                f + 1,
                max_iter,
            )

        # Step 4: Reverse reflections on the factor
        tfac = f1.copy()
        for idx in refvec:
            tfac[idx] *= -1

        loadings[:, f] = tfac

        # Step 5: Compute residual matrix
        # Subtract the outer product of the factor from the (reflected) matrix
        residual = tmat - np.outer(f1, f1)

        # Reverse reflections on the residual
        for idx in reversed(refvec):
            residual[idx, :] *= -1
            residual[:, idx] *= -1

        tmat = residual

    return loadings


def rotate_varimax(
    loadings: NDArray[np.float64], max_iter: int = 1000, tol: float = 1e-6
) -> NDArray[np.float64]:
    """Apply varimax rotation to factor loadings.

    Implements Kaiser's (1958) varimax criterion: orthogonal rotation
    that maximizes the variance of squared loadings within each factor.

    Args:
        loadings: Unrotated loadings (n x k)
        max_iter: Maximum iterations
        tol: Convergence tolerance

    Returns:
        Rotated loadings matrix (n x k)
    """
    n, k = loadings.shape
    if k < 2:
        return loadings.copy()

    # Kaiser normalization: normalize each row by its communality
    communalities = np.sqrt(np.sum(loadings**2, axis=1, keepdims=True))
    communalities = np.maximum(communalities, 1e-10)  # avoid division by zero
    rotated = loadings / communalities

    rotation = np.eye(k)

    for _ in range(max_iter):
        d = 0.0
        for i, j in combinations(range(k), 2):
            # Columns to rotate (copy to avoid aliasing during update)
            x = rotated[:, i].copy()
            y = rotated[:, j].copy()

            u = x**2 - y**2
            v = 2 * x * y

            # Varimax criterion angle
            a = np.sum(u)
            b = np.sum(v)
            c = np.sum(u**2 - v**2)
            d_val = 2 * np.sum(u * v)

            num = d_val - 2 * a * b / n
            den = c - (a**2 - b**2) / n

            angle = 0.25 * np.arctan2(num, den)
            d += abs(angle)

            # Apply rotation
            cos_a = np.cos(angle)
            sin_a = np.sin(angle)
            rotated[:, i] = x * cos_a + y * sin_a
            rotated[:, j] = -x * sin_a + y * cos_a

            # Update rotation matrix
            rot_i = rotation[:, i].copy()
            rot_j = rotation[:, j].copy()
            rotation[:, i] = rot_i * cos_a + rot_j * sin_a
            rotation[:, j] = -rot_i * sin_a + rot_j * cos_a

        if d < tol:
            break

    # Denormalize: restore original communalities
    rotated = rotated * communalities
    return cast(NDArray[np.float64], rotated)


def apply_judgmental_rotations(
    unrotated: NDArray[np.float64],
    manual_rotations: list[dict[str, object]],
) -> NDArray[np.float64]:
    """Apply a sequence of judgmental rotations to factor loadings.

    Each rotation is a 2-D Givens rotation on the column pair
    (factor_a-1, factor_b-1) by the specified angle in degrees, applied
    using the same sign convention as ``rotate_varimax`` (lines 363-364):

        col_a' =  col_a * cos(θ) + col_b * sin(θ)
        col_b' = -col_a * sin(θ) + col_b * cos(θ)

    Rotations are applied in list order. Used for "judgmental" rotation:
    the researcher specifies rotations to align factors with substantively
    meaningful positions rather than relying on automatic varimax
    (Brown 1980; Watts & Stenner 2012).

    Args:
        unrotated: Loadings matrix (n_participants x n_factors)
        manual_rotations: List of dicts with keys 'factor_a' (1-indexed),
            'factor_b' (1-indexed, distinct), 'angle_deg' (-180 to 180).

    Returns:
        Rotated loadings matrix, same shape as ``unrotated``.

    Raises:
        ValueError: If a factor index is out of range or factor_a == factor_b.
    """
    n_factors = unrotated.shape[1]
    rotated = unrotated.copy()
    for rotation in manual_rotations:
        # Cast through cast() — values from JSON columns / Pydantic dumps
        # arrive typed as ``object`` but are guaranteed to be ints/floats by
        # the schema-level validators that run before this function.
        a = int(cast(int, rotation["factor_a"])) - 1  # convert to 0-indexed
        b = int(cast(int, rotation["factor_b"])) - 1
        if not (0 <= a < n_factors) or not (0 <= b < n_factors):
            raise ValueError(
                f"manual rotation factor indices ({a + 1}, {b + 1}) out of range "
                f"for {n_factors}-factor solution"
            )
        if a == b:
            raise ValueError("manual rotation requires distinct factors")
        angle_rad = np.radians(float(cast(float, rotation["angle_deg"])))
        cos_a = np.cos(angle_rad)
        sin_a = np.sin(angle_rad)
        col_a = rotated[:, a].copy()
        col_b = rotated[:, b].copy()
        rotated[:, a] = col_a * cos_a + col_b * sin_a
        rotated[:, b] = -col_a * sin_a + col_b * cos_a
    return rotated


def standardize_factor_signs(
    loadings: NDArray[np.float64],
) -> NDArray[np.float64]:
    """Standardize factor polarity so the largest absolute loading is positive.

    Follows the R ``varimax()`` convention: for each factor column, if the
    element with the largest absolute value is negative the entire column is
    reflected (multiplied by -1).  This eliminates arbitrary sign
    indeterminacy introduced by eigenvector decomposition and rotation.

    Args:
        loadings: Loadings matrix (n_participants x n_factors)

    Returns:
        Sign-standardized loadings matrix (same shape, new array).
    """
    result = loadings.copy()
    for f in range(result.shape[1]):
        col = result[:, f]
        if col[np.argmax(np.abs(col))] < 0:
            result[:, f] = -col
    return result


def flag_sorts(loadings: NDArray[np.float64], n_statements: int) -> NDArray[np.bool_]:
    """Auto-flag Q-sorts to factors.

    A Q-sort is flagged on a factor when BOTH conditions are met:
    1. |loading| > 1.96 / sqrt(n_statements)  (significant at p < 0.05)
    2. loading^2 > sum of squared loadings on all OTHER factors

    Args:
        loadings: (Rotated) loadings matrix (n_participants x n_factors)
        n_statements: Number of statements in the study

    Returns:
        Boolean flagging matrix (n_participants x n_factors)

    Translated to Python in 2026 by Julien Vastenaekels from the R `qmethod`
    package (qflag, Aiora Zabala et al.), used under GPL-2+.
    See repository NOTICE.md for full attribution.
    """
    threshold = 1.96 / np.sqrt(n_statements)
    squared = loadings**2
    row_sums = squared.sum(axis=1, keepdims=True)

    # Condition 1: significant loading
    cond1 = np.abs(loadings) > threshold

    # Condition 2: squared loading > sum of all other squared loadings
    cond2 = squared > (row_sums - squared)

    return cast(NDArray[np.bool_], cond1 & cond2)


def apply_manual_flags(
    n_participants: int,
    n_factors: int,
    manual_flags: dict[int, int],
    participant_db_ids: list[int],
) -> NDArray[np.bool_]:
    """Build a flagging matrix from manual participant-to-factor assignments.

    Args:
        n_participants: Number of participants
        n_factors: Number of factors
        manual_flags: Mapping of participant_db_id → factor_number (1-indexed)
        participant_db_ids: List of db_ids in matrix column order

    Returns:
        Boolean flagging matrix (n_participants x n_factors)

    Raises:
        ValueError: If a manual flag references a participant outside the
            included analysis matrix, a factor outside the requested range, or
            if no valid defining sort remains after validation.
    """
    flags = np.zeros((n_participants, n_factors), dtype=bool)
    id_to_idx = {db_id: i for i, db_id in enumerate(participant_db_ids)}

    for db_id, factor_num in manual_flags.items():
        if db_id not in id_to_idx:
            raise ValueError(f"manual_flags contains unknown participant id {db_id}")
        if not 1 <= factor_num <= n_factors:
            raise ValueError(
                f"manual_flags factor {factor_num} out of range for "
                f"{n_factors}-factor solution"
            )
        flags[id_to_idx[db_id], factor_num - 1] = True

    if not np.any(flags):
        raise ValueError("manual_flags must define at least one participant")

    return flags


def compute_factor_scores(
    dataset: NDArray[np.float64],
    loadings: NDArray[np.float64],
    flagged: NDArray[np.bool_],
    distribution: NDArray[np.int64] | None = None,
) -> tuple[NDArray[np.float64], NDArray[np.int64]]:
    """Compute z-scores and factor arrays (integer scores) per factor.

    Follows the weighted averaging method from Brown (1980) and
    the qmethod R package's qzscores() function.

    Args:
        dataset: Sort matrix (n_statements x n_participants)
        loadings: (Rotated) loadings matrix (n_participants x n_factors)
        flagged: Flagging matrix (n_participants x n_factors)
        distribution: Forced distribution from grid_config. If None, inferred
            from the first participant's data (fallback).

    Returns:
        Tuple of (z_scores, factor_arrays) where:
        - z_scores: shape (n_statements, n_factors)
        - factor_arrays: shape (n_statements, n_factors) — integer scores

    Translated to Python in 2026 by Julien Vastenaekels from the R `qmethod`
    package (qzscores, Aiora Zabala et al.), used under GPL-2+.
    See repository NOTICE.md for full attribution.
    """
    n_statements, n_participants = dataset.shape
    n_factors = loadings.shape[1]

    z_scores = np.full((n_statements, n_factors), np.nan)
    factor_arrays = np.full((n_statements, n_factors), 0, dtype=np.int64)

    # Use provided distribution or fall back to first participant's data
    if distribution is None:
        distribution = np.sort(dataset[:, 0]).astype(np.int64)

    for f in range(n_factors):
        # Flagged loadings for this factor
        f_flags = flagged[:, f]
        if not np.any(f_flags):
            continue

        f_loadings = loadings[:, f] * f_flags

        # Factor weights: w = loading / (1 - loading^2)
        # Clamp to avoid division by zero when |loading| = 1
        f_weights = np.zeros(n_participants)
        nonzero = f_loadings != 0
        clamped = np.clip(f_loadings[nonzero], -0.999999, 0.999999)
        f_weights[nonzero] = clamped / (1 - clamped**2)

        # Weighted sum for each statement
        weighted_sum = dataset @ f_weights  # (n_statements,)

        # Standardize to z-scores
        mean = np.mean(weighted_sum)
        std = np.std(weighted_sum, ddof=1)
        if std > 0:
            z_scores[:, f] = (weighted_sum - mean) / std
        else:
            z_scores[:, f] = 0.0

        # Map z-scores to forced distribution (factor arrays)
        # Sort statements by z-score and assign distribution values
        sorted_dist = np.sort(distribution)
        order = np.argsort(z_scores[:, f])
        for rank, stmt_idx in enumerate(order):
            factor_arrays[stmt_idx, f] = sorted_dist[rank]

        # Handle ties: for tied z-scores, assign the minimum of tied rank values.
        # This matches qmethod's qzscores() behavior (R: min(zsc_n[izscn,f])).
        # Use tolerance-based comparison to handle floating-point imprecision.
        zs = z_scores[:, f]
        order_by_z = np.argsort(zs)
        i = 0
        while i < len(order_by_z):
            j = i + 1
            while j < len(order_by_z) and np.isclose(
                zs[order_by_z[i]], zs[order_by_z[j]]
            ):
                j += 1
            if j > i + 1:
                tied = order_by_z[i:j]
                min_val = min(int(factor_arrays[idx, f]) for idx in tied)
                for idx in tied:
                    factor_arrays[idx, f] = min_val
            i = j

    return z_scores, factor_arrays


def compute_factor_characteristics(
    loadings: NDArray[np.float64],
    flagged: NDArray[np.bool_],
    z_scores: NDArray[np.float64],
    av_rel_coef: float = 0.8,
) -> tuple[list[FactorCharacteristicDict], NDArray[np.float64], NDArray[np.float64]]:
    """Compute factor characteristics, correlation, and SED matrix.

    Args:
        loadings: (Rotated) loadings matrix (n_participants x n_factors)
        flagged: Flagging matrix (n_participants x n_factors)
        z_scores: Z-scores matrix (n_statements x n_factors)
        av_rel_coef: Average reliability coefficient (default 0.8)

    Returns:
        Tuple of (characteristics, factor_correlation, sed_matrix)

    Translated to Python in 2026 by Julien Vastenaekels from the R `qmethod`
    package (qfcharact, Aiora Zabala et al.), used under GPL-2+.
    See repository NOTICE.md for full attribution.
    """
    n_participants, n_factors = loadings.shape
    characteristics: list[FactorCharacteristicDict] = []

    se_scores = np.zeros(n_factors)

    for f in range(n_factors):
        n_flagged = int(np.sum(flagged[:, f]))
        eigenvalue = float(np.sum(loadings[:, f] ** 2))
        expl_var = 100.0 * eigenvalue / n_participants

        # Spearman-Brown reliability
        if 1 + (n_flagged - 1) * av_rel_coef > 0:
            reliability = (av_rel_coef * n_flagged) / (
                1 + (n_flagged - 1) * av_rel_coef
            )
        else:
            reliability = 0.0

        # Standard error of factor scores
        if not np.all(np.isnan(z_scores[:, f])):
            clamped_rel = min(reliability, 1.0)
            se = float(
                np.std(z_scores[:, f], ddof=1) * np.sqrt(max(1 - clamped_rel, 0.0))
            )
        else:
            se = 0.0
        se_scores[f] = se

        characteristics.append(
            FactorCharacteristicDict(
                factor=f + 1,
                eigenvalue=eigenvalue,
                variance_explained=expl_var,
                n_flagged=n_flagged,
                avg_rel_coef=av_rel_coef,
                composite_reliability=reliability,
                se_factor_scores=se,
                cumulative_variance=0.0,  # filled below
            )
        )

    # Cumulative variance
    cumulative = 0.0
    for c in characteristics:
        cumulative += c["variance_explained"]
        c["cumulative_variance"] = cumulative

    # Factor correlation matrix (correlation between z-score columns)
    # Drop rows with any NaN to avoid silent NaN propagation in np.corrcoef
    valid_cols = [f for f in range(n_factors) if not np.all(np.isnan(z_scores[:, f]))]
    full_cor = np.eye(n_factors)
    if len(valid_cols) >= 2:
        subset = z_scores[:, valid_cols]
        valid_rows = ~np.any(np.isnan(subset), axis=1)
        if np.sum(valid_rows) >= 2:
            factor_cor = np.asarray(np.corrcoef(subset[valid_rows], rowvar=False))
            # Replace any residual NaN (e.g. zero-variance column) with 0
            factor_cor = np.nan_to_num(factor_cor, nan=0.0)
            for i, vi in enumerate(valid_cols):
                for j, vj in enumerate(valid_cols):
                    full_cor[vi, vj] = factor_cor[i, j]

    # SED matrix
    sed = np.zeros((n_factors, n_factors))
    for i in range(n_factors):
        for j in range(n_factors):
            if i != j:
                sed[i, j] = np.sqrt(se_scores[i] ** 2 + se_scores[j] ** 2)

    return characteristics, full_cor, sed


def classify_statements(
    z_scores: NDArray[np.float64],
    sed: NDArray[np.float64],
    n_factors: int,
) -> tuple[list[StatementClassEntry], list[StatementClassEntry]]:
    """Classify statements as distinguishing or consensus.

    Uses the Standard Error of Differences (SED) to test whether
    z-score differences between factors are statistically significant.

    Args:
        z_scores: Z-scores matrix (n_statements x n_factors)
        sed: SED matrix (n_factors x n_factors)
        n_factors: Number of factors

    Returns:
        Tuple of (distinguishing, consensus) where each is a list of dicts
        with keys: statement_idx, significance (dict of pair→level)

    Translated to Python in 2026 by Julien Vastenaekels from the R `qmethod`
    package (qdc, Aiora Zabala et al.), used under GPL-2+.
    See repository NOTICE.md for full attribution.
    """
    n_statements = z_scores.shape[0]
    pairs = list(combinations(range(n_factors), 2))

    z_critical = {
        "p<0.05": 1.960,
        "p<0.01": 2.576,
        "p<0.001": 3.291,
        "p<0.000001": 4.8916,
    }

    distinguishing: list[StatementClassEntry] = []
    consensus: list[StatementClassEntry] = []

    for s in range(n_statements):
        sig_pairs: dict[str, str] = {}
        any_significant = False

        for i, j in pairs:
            if np.isnan(z_scores[s, i]) or np.isnan(z_scores[s, j]):
                continue

            diff = abs(z_scores[s, i] - z_scores[s, j])
            sed_val = sed[i, j]

            if sed_val <= 0:
                continue

            pair_key = f"{i + 1}-{j + 1}"

            # Test against thresholds (most to least significant)
            if diff > sed_val * z_critical["p<0.000001"]:
                sig_pairs[pair_key] = "p<0.000001"
                any_significant = True
            elif diff > sed_val * z_critical["p<0.001"]:
                sig_pairs[pair_key] = "p<0.001"
                any_significant = True
            elif diff > sed_val * z_critical["p<0.01"]:
                sig_pairs[pair_key] = "p<0.01"
                any_significant = True
            elif diff > sed_val * z_critical["p<0.05"]:
                sig_pairs[pair_key] = "p<0.05"
                any_significant = True

        entry = StatementClassEntry(statement_idx=s, significance=sig_pairs)

        if any_significant:
            distinguishing.append(entry)
        else:
            consensus.append(entry)

    return distinguishing, consensus


def compute_eigenvalues(
    cor_mat: NDArray[np.float64],
) -> tuple[list[float], int]:
    """Compute all eigenvalues from the correlation matrix.

    Used for the scree plot before running the full analysis.

    Args:
        cor_mat: Correlation matrix (n x n)

    Returns:
        Tuple of (eigenvalues descending, suggested_n_factors by Kaiser criterion)
    """
    eigenvalues = np.linalg.eigvalsh(cor_mat)
    eigenvalues = np.sort(eigenvalues)[::-1]
    eigenvalues = np.maximum(eigenvalues, 0.0)  # clamp rounding artifacts
    eigenvalues_list = [float(e) for e in eigenvalues]
    suggested = int(np.sum(eigenvalues > 1.0))
    return eigenvalues_list, max(suggested, 1)


def compute_parallel_analysis_n(
    dataset: NDArray[np.float64],
    n_simulations: int = 1000,
    seed: int = 42,
) -> int:
    """Horn (1965) parallel analysis on the participant-correlation matrix.

    Compares observed eigenvalues against the 95th percentile of eigenvalues
    from random Gaussian datasets of matching shape. Returns the count of
    factors whose observed eigenvalue exceeds the simulated threshold,
    floored at 1 (the analysis always needs at least one factor).

    Args:
        dataset: (n_statements x n_participants) Q-sort matrix.
        n_simulations: Monte-Carlo iterations. Default 1000.
        seed: RNG seed for reproducibility.

    Returns:
        Number of factors retained (>= 1).
    """
    n_statements, n_participants = dataset.shape
    rng = np.random.default_rng(seed)
    sim_eigs = np.zeros((n_simulations, n_participants))
    # Q-method convention: dataset is (n_statements, n_participants). Random
    # matrices preserve that shape so the simulated participant-correlation
    # eigenvalue distribution is shape-matched to the observed one.
    for i in range(n_simulations):
        sim = rng.standard_normal(size=(n_statements, n_participants))
        sim_cor = correlation_matrix(sim)
        evs = np.linalg.eigvalsh(sim_cor)
        sim_eigs[i] = np.sort(evs)[::-1]
    threshold = np.percentile(sim_eigs, 95, axis=0)
    obs_cor = correlation_matrix(dataset)
    obs_eigs = np.sort(np.linalg.eigvalsh(obs_cor))[::-1]
    return max(int(np.sum(obs_eigs > threshold)), 1)


def compute_velicer_map_n(cor_mat: NDArray[np.float64]) -> int:
    """Velicer (1976) Minimum Average Partial.

    For each candidate k from 1 to min(n-1, 8), extract k principal
    components, deflate the correlation matrix, then compute the average
    squared off-diagonal of the resulting partial correlation matrix.
    The k that minimises this average is the optimal number of factors.

    Args:
        cor_mat: Participant-correlation matrix (n x n).

    Returns:
        Optimal number of factors (>= 1).
    """
    n = cor_mat.shape[0]
    if n < 2:
        return 1
    eigenvalues, eigenvectors = np.linalg.eigh(cor_mat)
    idx = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[idx]
    eigenvectors = eigenvectors[:, idx]

    map_values: list[float] = []
    for k in range(1, min(n, 9)):
        evs_k = np.maximum(eigenvalues[:k], 0.0)
        loadings = eigenvectors[:, :k] * np.sqrt(evs_k)
        residual = cor_mat - loadings @ loadings.T
        diag = np.sqrt(np.maximum(np.diag(residual), 1e-10))
        partial = residual / np.outer(diag, diag)
        np.fill_diagonal(partial, 0.0)
        avg_sq = float(np.sum(partial**2) / (n * (n - 1)))
        map_values.append(avg_sq)

    return int(np.argmin(map_values)) + 1


def _distribution_from_grid_config(
    grid_config: list[dict[str, object]],
) -> NDArray[np.int64]:
    """Build the forced distribution array from the study's grid_config.

    Each entry in grid_config has {"score": int, "capacity": int}.
    Returns a sorted array of all score values repeated by their count.

    Raises:
        ValueError: If grid_config entries are missing required keys.

    ``grid_config`` uses ``dict[str, object]`` (not ``dict[str, Any]``) because
    values arrive from the ORM JSON column as plain Python objects.  The
    ``int()`` casts below are defensive; ``GridSlot`` is the semantic shape
    but cannot be used here because ORM JSON bypass mypy's narrowing.
    """
    dist: list[int] = []
    for i, entry in enumerate(grid_config):
        if "score" not in entry or "capacity" not in entry:
            raise ValueError(f"grid_config entry {i} missing 'score' or 'capacity' key")
        score = entry["score"]
        capacity = entry["capacity"]
        if not isinstance(score, (int, float)) or not isinstance(
            capacity, (int, float)
        ):
            raise ValueError(
                f"grid_config entry {i} 'score' and 'capacity' must be numeric"
            )
        dist.extend([int(score)] * int(capacity))
    if not dist:
        raise ValueError("grid_config produced an empty distribution")
    return np.sort(np.array(dist, dtype=np.int64))


def _factor_array_distribution(
    dataset: NDArray[np.float64],
    grid_config: list[dict[str, object]] | None,
    distribution_mode: str | None,
) -> NDArray[np.int64] | None:
    """Return the distribution used to project z-scores to factor arrays.

    Forced and flexible grids have a design distribution whose total capacity
    should equal the Q-set size. Free grids only define allowed score columns
    and soft capacity hints, so overcapacity grids must not be interpreted as
    the factor-array shape; falling back to the observed sort distribution
    avoids biasing arrays toward the lowest grid scores.
    """
    if distribution_mode == "free":
        return None
    if not grid_config:
        return None

    distribution = _distribution_from_grid_config(grid_config)
    n_statements = dataset.shape[0]
    if distribution.shape[0] != n_statements:
        raise ValueError(
            "grid_config capacity must match the number of statements for "
            f"factor-array projection (capacity={distribution.shape[0]}, "
            f"statements={n_statements})"
        )
    return distribution


def run_analysis(
    dataset: NDArray[np.float64],
    n_factors: int,
    extraction: str = "pca",
    rotation: str = "varimax",
    flagging: str = "auto",
    manual_flags_matrix: NDArray[np.bool_] | None = None,
    manual_rotations: list[dict[str, object]] | None = None,
    grid_config: list[dict[str, object]] | None = None,
    distribution_mode: str | None = None,
) -> AnalysisRunResult:
    """Run the complete Q-method factor analysis pipeline.

    Orchestrates: correlation → extraction → rotation → flagging →
    z-scores → factor arrays → characteristics → statement classification.

    Args:
        dataset: Sort matrix (n_statements x n_participants)
        n_factors: Number of factors to extract
        extraction: 'pca' or 'centroid'
        rotation: 'varimax', 'none', or 'judgmental'
        flagging: 'auto' or 'manual'
        manual_flags_matrix: Required if flagging='manual'
        manual_rotations: Required if rotation='judgmental'. List of dicts
            with keys 'factor_a' (1-indexed), 'factor_b' (1-indexed,
            distinct), 'angle_deg' (-180 to 180). Rotations are applied
            in list order (Brown 1980; Watts & Stenner 2012).
        grid_config: Study grid configuration for the forced distribution.
            If None, distribution is inferred from the first participant.
        distribution_mode: Study distribution mode. In "free" mode, grid
            capacities are not treated as a forced distribution.

    Returns:
        Dictionary with all analysis results
    """
    n_statements, n_participants = dataset.shape

    if n_factors > n_participants:
        raise ValueError(
            f"n_factors ({n_factors}) cannot exceed n_participants ({n_participants})"
        )
    if n_factors > n_statements:
        raise ValueError(
            f"n_factors ({n_factors}) cannot exceed n_statements ({n_statements})"
        )
    if n_factors < 1:
        raise ValueError("n_factors must be at least 1")

    # Step 1: Correlation matrix
    cor_mat = correlation_matrix(dataset)

    # Step 2: All eigenvalues (for reporting)
    all_eigenvalues, _ = compute_eigenvalues(cor_mat)

    # Step 3: Factor extraction
    if extraction == "pca":
        unrotated = extract_pca(cor_mat, n_factors)
    elif extraction == "centroid":
        unrotated = extract_centroid(cor_mat, n_factors)
    else:
        raise ValueError(f"Unknown extraction method: {extraction}")

    # Step 4: Rotation
    if rotation == "varimax" and n_factors >= 2:
        rotated = rotate_varimax(unrotated)
    elif rotation == "judgmental" and n_factors >= 2:
        if not manual_rotations:
            raise ValueError(
                "rotation='judgmental' requires a non-empty manual_rotations list"
            )
        rotated = apply_judgmental_rotations(unrotated, manual_rotations)
    else:
        rotated = unrotated.copy()

    # Step 4b: Standardize factor signs (largest absolute loading positive)
    # Eliminates arbitrary sign indeterminacy from eigenvector decomposition
    # and rotation, which otherwise causes inverted factor polarity
    # (e.g. -5 ↔ +5 in factor arrays).
    rotated = standardize_factor_signs(rotated)

    # Step 5: Flagging
    if flagging == "manual" and manual_flags_matrix is not None:
        flags = manual_flags_matrix
    else:
        flags = flag_sorts(rotated, n_statements)

    # Step 6: Z-scores and factor arrays
    distribution = _factor_array_distribution(dataset, grid_config, distribution_mode)
    z_scores, factor_arrays = compute_factor_scores(
        dataset, rotated, flags, distribution=distribution
    )

    # Step 7: Factor characteristics
    characteristics, factor_cor, sed = compute_factor_characteristics(
        rotated, flags, z_scores
    )

    # Step 8: Statement classification
    dist_list, cons_list = classify_statements(z_scores, sed, n_factors)

    # Total variance explained
    total_var = sum(c["variance_explained"] for c in characteristics)

    return AnalysisRunResult(
        n_participants=n_participants,
        n_statements=n_statements,
        n_factors=n_factors,
        extraction=extraction,
        rotation=rotation,
        eigenvalues=all_eigenvalues,
        total_variance_explained=total_var,
        unrotated_loadings=unrotated,
        rotated_loadings=rotated,
        flags=flags,
        z_scores=z_scores,
        factor_arrays=factor_arrays,
        factor_characteristics=characteristics,
        factor_correlation=factor_cor,
        distinguishing=dist_list,
        consensus=cons_list,
        manual_rotations=list(manual_rotations) if manual_rotations else [],
    )


def compute_bootstrap_stability(
    dataset: NDArray[np.float64],
    n_iterations: int,
    *,
    n_factors: int,
    extraction: str,
    rotation: str,
    manual_rotations: list[dict[str, object]] | None,
    grid_config: list[dict[str, object]] | None,
    distribution_mode: str | None = None,
    rng_seed: int = 42,
) -> BootstrapStabilityResult:
    """Non-parametric bootstrap of Q-sorts (Zabala & Pascual 2016).

    For each iteration, resamples the participant columns of the dataset
    with replacement, re-runs the full analysis pipeline, and accumulates
    z-scores per (statement, factor). Returns SE and 95% CI per
    statement-factor cell, plus the per-factor mean SE.

    Manual flagging is dropped during resampling (the resample destroys
    the participant identity required for manual flags); flagging falls
    back to 'auto' even when the calling run used 'manual'. Judgmental
    rotation is preserved (the rotation list is replayed unchanged on
    each resample), so bootstrap stability reflects the rotated solution
    the analyst actually saw.

    Iterations whose resample produces a degenerate correlation matrix
    (or otherwise fails the pipeline) are skipped; the count of usable
    iterations is reported as ``n_converged``.

    The ``statement_idx`` in the per-statement entries is the row-index
    of the dataset (0-indexed); the router maps it to the real statement
    id (the same translation used for the regular result).

    Args:
        dataset: Sort matrix (n_statements x n_participants).
        n_iterations: B, the number of bootstrap iterations.
        n_factors: Number of factors to extract on each iteration.
        extraction: 'pca' or 'centroid' (must match the calling run).
        rotation: 'varimax', 'none', or 'judgmental'.
        manual_rotations: Replayed when rotation='judgmental'.
        grid_config: Forced distribution (passed through to run_analysis).
        distribution_mode: Study distribution mode (passed through to run_analysis).
        rng_seed: Seed for the resampling RNG; deterministic given the
            same dataset and seed.

    Returns:
        BootstrapStabilityResult with per-(statement, factor) SE/CI and
        per-factor mean SE.
    """
    rng = np.random.default_rng(rng_seed)
    n_statements, n_participants = dataset.shape

    # Accumulators of z-scores per (statement, factor) across iterations.
    z_acc: list[list[list[float]]] = [
        [[] for _ in range(n_factors)] for _ in range(n_statements)
    ]
    n_converged = 0

    for _ in range(n_iterations):
        cols = rng.integers(0, n_participants, size=n_participants)
        boot = dataset[:, cols]
        try:
            # Pathological resamples (e.g. all-zero columns from a degenerate
            # dataset) trigger 0/0 inside np.corrcoef. Those iterations are
            # filtered out below by the LinAlgError/ValueError catch; scope the
            # divide-by-zero RuntimeWarning here so a future *unexpected* numpy
            # warning elsewhere stays visible in the test output.
            with np.errstate(divide="ignore", invalid="ignore"):
                res = run_analysis(
                    boot,
                    n_factors=n_factors,
                    extraction=extraction,
                    rotation=rotation,
                    flagging="auto",
                    manual_flags_matrix=None,
                    manual_rotations=manual_rotations,
                    grid_config=grid_config,
                    distribution_mode=distribution_mode,
                )
        except (ValueError, np.linalg.LinAlgError):
            # Skip iterations whose resample is too degenerate to factor —
            # tracked via n_converged so the caller can flag a low-quality
            # bootstrap.
            continue
        n_converged += 1
        z = res["z_scores"]
        for s in range(n_statements):
            for f in range(n_factors):
                value = z[s, f]
                if not np.isnan(value):
                    z_acc[s][f].append(float(value))

    statement_stab: list[BootstrapStatementEntry] = []
    factor_se_acc: list[list[float]] = [[] for _ in range(n_factors)]
    for s in range(n_statements):
        for f in range(n_factors):
            samples = z_acc[s][f]
            if not samples:
                continue
            arr = np.array(samples, dtype=np.float64)
            z_mean = float(np.mean(arr))
            z_se = float(np.std(arr, ddof=1)) if arr.size > 1 else 0.0
            ci_lo = float(np.percentile(arr, 2.5))
            ci_hi = float(np.percentile(arr, 97.5))
            statement_stab.append(
                BootstrapStatementEntry(
                    statement_idx=s,
                    factor=f + 1,
                    z_mean=z_mean,
                    z_se=z_se,
                    ci_lower=ci_lo,
                    ci_upper=ci_hi,
                )
            )
            factor_se_acc[f].append(z_se)

    factor_mean_se = [
        float(np.mean(factor_se_acc[f])) if factor_se_acc[f] else 0.0
        for f in range(n_factors)
    ]

    return BootstrapStabilityResult(
        n_iterations=n_iterations,
        n_converged=n_converged,
        statements=statement_stab,
        factor_mean_se=factor_mean_se,
    )


def compute_preview_range(
    dump: SortDataDump,
    n_factors_range: list[int],
    extraction: str,
    rotation: str,
    flagging: str,
) -> list[PreviewSummary]:
    """Run analysis once per k and summarise each result.

    Used by POST /analysis/preview-range to populate the Phase Explorer
    preview table. The function deliberately calls run_analysis N times
    rather than truncating a single high-k extraction — centroid is
    iterative on residuals (Brown 1980) and judgmental rotation is
    path-dependent, so a single-pass shortcut would silently misrepresent
    those configurations. Caller is responsible for gating the extraction
    and rotation values upstream (see router validation).

    Args:
        dump: SortDataDump as returned by _get_analysis_dump.
        n_factors_range: Sorted list of candidate k values.
        extraction: 'pca' or 'centroid'.
        rotation: 'varimax', 'none', or 'judgmental'.
        flagging: 'auto' or 'manual' (manual treated as auto here — preview
            is exploratory only; manual flagging is committed-run territory).

    Returns:
        One PreviewSummary per k, in the input order.
    """
    dataset, _participants, _statements = build_sort_matrix(dump)
    grid_config = dump["study"]["grid_config"]
    distribution_mode = dump["study"].get("distribution_mode", "forced")
    rows: list[PreviewSummary] = []
    for k in n_factors_range:
        result = run_analysis(
            dataset,
            n_factors=k,
            extraction=extraction,
            rotation=rotation,
            flagging="auto",
            grid_config=grid_config,
            distribution_mode=distribution_mode,
        )
        flags = result["flags"]
        n_participants = flags.shape[0]
        any_flag = flags.any(axis=1)
        cross = flags.sum(axis=1) >= 2
        per_factor_flagged = flags.sum(axis=0)
        cumulative_variance = (
            float(result["factor_characteristics"][-1]["cumulative_variance"])
            if result["factor_characteristics"]
            else 0.0
        )
        rows.append(
            PreviewSummary(
                n_factors=k,
                cumulative_variance=cumulative_variance,
                pct_flagged=float(any_flag.sum()) / max(n_participants, 1),
                n_distinguishing=len(result["distinguishing"]),
                n_cross_loaders=int(cross.sum()),
                n_consensus=len(result["consensus"]),
                min_defining_sorts=int(per_factor_flagged.min()),
                has_empty_factor=bool((per_factor_flagged == 0).any()),
            )
        )
    return rows
