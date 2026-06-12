"""Offline regression guard for the qmethod-R numerical equivalence claim.

The manuscript (and ``validation/lipset/README.md``) claim that Qualis'
factor engine reproduces the canonical qmethod-R solution for the Lipset
(1963) Q dataset. That claim was previously enforced *only* by
``validation/lipset/compare.py``, which requires a running Docker stack and a
live API (``make demo-up && make demo-lipset && python …/compare.py``) and is
therefore run by no CI job. This module enforces it **offline, in the standard
pytest suite**: it calls the analysis pipeline (``run_analysis``) directly on
the committed Lipset Q-sort matrix and compares to the frozen
``qmethod_reference.json`` oracle. Any change to extraction, rotation,
sign-standardisation, flagging, z-scoring, or the numpy/scipy/LAPACK stack that
breaks the documented equivalence now fails CI on every commit, instead of
silently drifting until someone runs the manual Docker ritual.

The oracle freezes two qmethod solutions (regenerate both with
``validation/lipset/qmethod_reference.R``):

  * **PCA / varimax / auto-flag** (the default, modal configuration): rotated
    loadings, auto-flags, per-statement z-scores, factor arrays, and per-factor
    composite reliability / SE of factor scores / eigenvalue.
  * **Centroid / varimax / auto-flag** (Brown's classical extraction): loadings,
    auto-flags, z-scores, factor arrays — so the advertised classical method is
    externally anchored, not only shape-checked.

Observed maxima at authoring (qmethod 1.8.4, numpy/scipy current):
  PCA      — loadings 6.4e-5, z-scores 5.0e-5, reliability 7.7e-8, se 9.8e-8;
  centroid — loadings 1.1e-4, z-scores 1.3e-4 (iterative extraction, hence the
  wider 2e-4 bound); factor arrays and flag matrices match exactly for both.

If a future qmethod/numpy/LAPACK bump makes a bound borderline-fail, widen it
one notch (and keep ``validation/lipset/compare.py``'s ``LOADING_TOL`` in step)
rather than silently loosening — a large jump means a real regression.

Source of truth:
  * oracle   : ``validation/lipset/qmethod_reference.json``  (qmethod 1.8.4)
  * Q-sorts  : ``backend/data/lipset-democracy.sorts.json``
  * live twin: ``validation/lipset/compare.py``  (loadings/partition, via the API)
"""

from __future__ import annotations

import itertools
import json
from pathlib import Path

import numpy as np
import pytest

from app.services.analysis_service import run_analysis

# Repo root from backend/tests/integration/<this file>.
REPO_ROOT = Path(__file__).resolve().parents[3]
REFERENCE_PATH = REPO_ROOT / "validation" / "lipset" / "qmethod_reference.json"
SORTS_PATH = REPO_ROOT / "backend" / "data" / "lipset-democracy.sorts.json"

N_FACTORS = 3

# PCA is exact (eigendecomposition); the manuscript / compare.py bound is 1e-4.
PCA_LOADING_TOL = 1e-4
PCA_ZSCORE_TOL = 1e-4
PCA_EIGENVALUE_TOL = 1e-3
PCA_RELIABILITY_TOL = 1e-5
# Centroid is iterative (Brown 1980); convergence noise lands at ~1e-4, so the
# externally-benchmarked bound is one notch wider.
CENTROID_LOADING_TOL = 2e-4
CENTROID_ZSCORE_TOL = 2e-4


def _load_reference() -> dict:
    with REFERENCE_PATH.open() as fh:
        return json.load(fh)


def _build_dataset(qsorts: list[str], sorts: dict) -> np.ndarray:
    """Build the (n_statements, n_participants) sort matrix in ``qsorts`` order.

    Statement (row) order is irrelevant to the person-by-person correlation as
    long as it is consistent across columns; we sort statement ids for
    determinism. The committed Q-sort matrix is identical (element-wise) to
    qmethod's bundled ``lipset[[1]]``, so z-scores / factor arrays align to the
    reference by row index.
    """
    statement_ids = sorted(next(iter(sorts.values())).keys())
    columns = [[float(sorts[q][sid]) for sid in statement_ids] for q in qsorts]
    return np.array(columns, dtype=np.float64).T


def _best_alignment(
    loadings: np.ndarray, ref_loadings: np.ndarray
) -> tuple[tuple[int, ...], tuple[int, ...]]:
    """Return the (permutation, signs) of Qualis factor columns that best match
    the reference, resolving factor analysis' order/sign indeterminacy by
    minimising total squared error (identical strategy to compare.py)."""
    best: tuple[float, tuple[int, ...], tuple[int, ...]] | None = None
    for perm in itertools.permutations(range(N_FACTORS)):
        for signs in itertools.product((1, -1), repeat=N_FACTORS):
            aligned = np.column_stack(
                [loadings[:, perm[j]] * signs[j] for j in range(N_FACTORS)]
            )
            sse = float(np.sum((aligned - ref_loadings) ** 2))
            if best is None or sse < best[0]:
                best = (sse, perm, signs)
    assert best is not None
    return best[1], best[2]


def _solve(extraction: str, ref_block: dict, qsorts: list[str], sorts: dict) -> dict:
    """Run one extraction through the pipeline and align it (factor order + sign)
    to the reference block, returning aligned Qualis outputs alongside the
    reference arrays for direct comparison."""
    dataset = _build_dataset(qsorts, sorts)
    result = run_analysis(
        dataset,
        n_factors=N_FACTORS,
        extraction=extraction,
        rotation="varimax",
        flagging="auto",
    )
    loadings = np.asarray(result["rotated_loadings"], dtype=np.float64)
    z_scores = np.asarray(result["z_scores"], dtype=np.float64)
    factor_arrays = np.asarray(result["factor_arrays"], dtype=np.int64)
    flags = np.asarray(result["flags"], dtype=bool)

    ref_loadings = np.array(
        [ref_block["loadings"][q] for q in qsorts], dtype=np.float64
    )
    ref_flags = np.array([ref_block["flagged"][q] for q in qsorts], dtype=bool)
    ref_z = np.array(ref_block["z_scores"], dtype=np.float64)
    ref_factor_arrays = np.array(ref_block["factor_arrays"], dtype=np.int64)

    perm, signs = _best_alignment(loadings, ref_loadings)

    def col_perm_sign(mat: np.ndarray) -> np.ndarray:
        return np.column_stack([mat[:, perm[j]] * signs[j] for j in range(N_FACTORS)])

    return {
        "qsorts": qsorts,
        "perm": perm,
        "characteristics": result["factor_characteristics"],
        "aligned_loadings": col_perm_sign(loadings),
        "aligned_z": col_perm_sign(z_scores),
        # factor arrays flip sign with the factor (a +4 idealised position mirrors)
        "aligned_factor_arrays": col_perm_sign(factor_arrays).astype(np.int64),
        "aligned_flags": np.column_stack([flags[:, perm[j]] for j in range(N_FACTORS)]),
        "ref_loadings": ref_loadings,
        "ref_flags": ref_flags,
        "ref_z": ref_z,
        "ref_factor_arrays": ref_factor_arrays,
    }


@pytest.fixture(scope="module")
def _ref() -> dict:
    return _load_reference()


@pytest.fixture(scope="module")
def _sorts() -> dict:
    with SORTS_PATH.open() as fh:
        return json.load(fh)


@pytest.fixture(scope="module")
def pca(_ref: dict, _sorts: dict) -> dict:
    return _solve("pca", _ref, _ref["qsorts"], _sorts)


@pytest.fixture(scope="module")
def centroid(_ref: dict, _sorts: dict) -> dict:
    return _solve("centroid", _ref["centroid"], _ref["qsorts"], _sorts)


# --------------------------------------------------------------------------- #
# Data-file integrity
# --------------------------------------------------------------------------- #
def test_lipset_dataset_matches_reference_shape(_ref: dict, _sorts: dict) -> None:
    """Guard the committed data/oracle files: 9 Q-sorts, 33 statements, key
    order aligned, and the extended oracle present (both extractions)."""
    assert list(_sorts.keys()) == _ref["qsorts"], (
        "lipset-democracy.sorts.json key order drifted from the reference qsorts"
    )
    assert len(_ref["qsorts"]) == 9
    assert len(next(iter(_sorts.values()))) == 33
    assert len(_ref["z_scores"]) == 33
    assert len(_ref["factor_arrays"]) == 33
    assert {"loadings", "flagged", "z_scores", "factor_arrays"} <= set(_ref["centroid"])


# --------------------------------------------------------------------------- #
# PCA / varimax / auto-flag — the default, modal configuration
# --------------------------------------------------------------------------- #
def test_pca_loadings_match_qmethod(pca: dict) -> None:
    """Rotated loadings reproduce qmethod-R within 1e-4 — the CI-backed form of
    the manuscript's headline numerical claim."""
    max_diff = float(np.max(np.abs(pca["aligned_loadings"] - pca["ref_loadings"])))
    assert max_diff <= PCA_LOADING_TOL, (
        f"max abs rotated-loading difference {max_diff:.8f} exceeds "
        f"{PCA_LOADING_TOL}; the qmethod-R equivalence no longer holds — "
        f"investigate extraction/rotation/sign changes before widening."
    )


def test_pca_factor_partition_matches_qmethod(pca: dict) -> None:
    """Each Q-sort's dominant factor matches the factor qmethod flagged it on
    (the factor-assignment assertion from compare.py)."""
    dominant = np.argmax(np.abs(pca["aligned_loadings"]), axis=1)
    ref_dominant = np.array(
        [int(np.flatnonzero(row)[0]) for row in pca["ref_flags"]], dtype=np.int64
    )
    mismatches = [
        (pca["qsorts"][i], int(dominant[i]) + 1, int(ref_dominant[i]) + 1)
        for i in range(len(dominant))
        if dominant[i] != ref_dominant[i]
    ]
    assert not mismatches, f"dominant-factor partition diverged: {mismatches}"


def test_pca_autoflags_match_qmethod(pca: dict) -> None:
    """Qualis' own auto-flag matrix reproduces qmethod's qflag exactly."""
    assert np.array_equal(pca["aligned_flags"], pca["ref_flags"]), (
        "auto-flag matrix diverged from qmethod's qflag."
    )


def test_pca_zscores_match_qmethod(pca: dict) -> None:
    """Per-statement factor z-scores — what researchers actually interpret —
    reproduce qmethod within 1e-4."""
    max_diff = float(np.max(np.abs(pca["aligned_z"] - pca["ref_z"])))
    assert max_diff <= PCA_ZSCORE_TOL, (
        f"max abs z-score difference {max_diff:.8f} exceeds {PCA_ZSCORE_TOL}."
    )


def test_pca_factor_arrays_match_qmethod(pca: dict) -> None:
    """The idealised factor sorts (z-scores mapped onto the forced grid) match
    qmethod exactly."""
    assert np.array_equal(pca["aligned_factor_arrays"], pca["ref_factor_arrays"]), (
        "factor arrays diverged from qmethod's zsc_n."
    )


def test_pca_reliability_and_se_match_qmethod(pca: dict, _ref: dict) -> None:
    """Per-factor composite reliability and SE of factor scores reproduce
    qmethod — statistics the recon flagged as externally validated nowhere."""
    perm = pca["perm"]
    chars = pca["characteristics"]
    fc = _ref["factor_characteristics"]
    for j in range(N_FACTORS):
        c = chars[perm[j]]
        assert abs(c["composite_reliability"] - fc["composite_reliability"][j]) <= (
            PCA_RELIABILITY_TOL
        ), f"factor {j + 1} composite reliability diverged"
        assert abs(c["se_factor_scores"] - fc["se_factor_scores"][j]) <= (
            PCA_RELIABILITY_TOL
        ), f"factor {j + 1} SE of factor scores diverged"


def test_pca_eigenvalues_match_qmethod(pca: dict, _ref: dict) -> None:
    """Per-factor eigenvalues reproduce qmethod within 1e-3."""
    perm = pca["perm"]
    chars = pca["characteristics"]
    ref_eig = _ref["factor_characteristics"]["eigenvalue"]
    for j in range(N_FACTORS):
        assert abs(chars[perm[j]]["eigenvalue"] - ref_eig[j]) <= PCA_EIGENVALUE_TOL, (
            f"factor {j + 1} eigenvalue diverged"
        )


# --------------------------------------------------------------------------- #
# Centroid / varimax / auto-flag — Brown's classical extraction
# --------------------------------------------------------------------------- #
def test_centroid_loadings_match_qmethod(centroid: dict) -> None:
    """Brown's centroid loadings reproduce qmethod within 2e-4 — externally
    anchoring the classical extraction the docs advertise."""
    max_diff = float(
        np.max(np.abs(centroid["aligned_loadings"] - centroid["ref_loadings"]))
    )
    assert max_diff <= CENTROID_LOADING_TOL, (
        f"max abs centroid loading difference {max_diff:.8f} exceeds "
        f"{CENTROID_LOADING_TOL}; the centroid port diverged from qmethod."
    )


def test_centroid_autoflags_match_qmethod(centroid: dict) -> None:
    """Centroid auto-flag matrix reproduces qmethod exactly (including correctly
    leaving an unflagged Q-sort unflagged)."""
    assert np.array_equal(centroid["aligned_flags"], centroid["ref_flags"]), (
        "centroid auto-flag matrix diverged from qmethod."
    )


def test_centroid_zscores_match_qmethod(centroid: dict) -> None:
    """Centroid z-scores reproduce qmethod within 2e-4."""
    max_diff = float(np.max(np.abs(centroid["aligned_z"] - centroid["ref_z"])))
    assert max_diff <= CENTROID_ZSCORE_TOL, (
        f"max abs centroid z-score difference {max_diff:.8f} exceeds "
        f"{CENTROID_ZSCORE_TOL}."
    )


def test_centroid_factor_arrays_match_qmethod(centroid: dict) -> None:
    """Centroid factor arrays match qmethod exactly."""
    assert np.array_equal(
        centroid["aligned_factor_arrays"], centroid["ref_factor_arrays"]
    ), "centroid factor arrays diverged from qmethod's zsc_n."
