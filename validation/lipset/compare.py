#!/usr/bin/env python3
"""Validate Qualis' factor analysis against the qmethod reference.

Runs a PCA / Varimax / auto-flag 3-factor analysis on the seeded
``lipset-democracy`` study via the running Qualis API, aligns the factor
solution to the frozen qmethod reference (factor order and sign are
indeterminate in factor analysis), and asserts:

  * an identical factor assignment for all nine Q-sorts, and
  * rotated loadings agreeing within a small tolerance.

No R is required: the reference is the committed
``qmethod_reference.json`` (regenerate it with ``qmethod_reference.R``).

This script is the **live-API twin** of
``backend/tests/integration/test_lipset_validation.py``, which enforces the
same ``1e-4`` bound and factor partition **offline in CI** (calling the
pipeline directly, no Docker/API). Keep ``LOADING_TOL`` below in lockstep with
that test. Use this script to confirm the numbers also survive the full
deployed request path.

Prerequisites (a reviewer runs):

    make demo-up
    make demo-lipset
    python validation/lipset/compare.py

Exit code 0 = validation passed, 1 = failed. Pure standard library.
"""

from __future__ import annotations

import itertools
import json
import os
import sys
import urllib.parse
import urllib.request

BASE = os.environ.get("QUALIS_URL", "http://localhost:3000")
EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
SLUG = "lipset-democracy"
# Manuscript §3 claims rotated loadings agree "within 0.0001"; this gate enforces
# that bound so the paper's number is CI-backed. Last verified observed maximum:
# 1e-4 (see validation/lipset/README.md). If a future qmethod/numpy bump makes
# this borderline-fail, widen to 2e-4 rather than silently loosening to 1e-3.
LOADING_TOL = 1e-4
HERE = os.path.dirname(os.path.abspath(__file__))


def _call(path: str, token: str | None = None, data=None, form: bool = False):
    headers = {}
    body = None
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=90) as resp:  # noqa: S310
        return json.loads(resp.read())


def main() -> int:
    ref = json.load(open(os.path.join(HERE, "qmethod_reference.json")))
    # Submission order == sorts JSON key order == participant db_id order.
    sorts_path = os.path.join(
        HERE, "..", "..", "backend", "data", "lipset-democracy.sorts.json"
    )
    submission_order = list(json.load(open(sorts_path)).keys())

    token = _call(
        "/api/token", data={"username": EMAIL, "password": PASSWORD}, form=True
    )["access_token"]
    result = _call(
        f"/api/admin/studies/{SLUG}/analysis/run",
        token=token,
        data={
            "extraction": "pca",
            "n_factors": 3,
            "rotation": "varimax",
            "flagging": "auto",
        },
    )
    parts = sorted(result["participants"], key=lambda p: p["db_id"])
    if len(parts) != len(submission_order):
        print(
            f"FAIL: expected {len(submission_order)} Q-sorts, "
            f"got {len(parts)} — did you run `make demo-lipset`?"
        )
        return 1
    qualis = {
        submission_order[i]: parts[i]["loadings"] for i in range(len(parts))
    }

    qsorts = ref["qsorts"]
    ref_loa = ref["loadings"]
    ref_factor = {
        s: [i for i, f in enumerate(ref["flagged"][s]) if f] for s in qsorts
    }

    # Align Qualis factor columns to the reference by the permutation +
    # sign that minimises total squared error (factor indeterminacy).
    best = None
    for perm in itertools.permutations(range(3)):
        for signs in itertools.product((1, -1), repeat=3):
            sse = 0.0
            for col, (ref_col, sign) in enumerate(zip(perm, signs)):
                for s in qsorts:
                    sse += (
                        qualis[s][col] * sign - ref_loa[s][ref_col]
                    ) ** 2
            if best is None or sse < best[0]:
                best = (sse, perm, signs)
    _, perm, signs = best

    max_diff = 0.0
    partition_ok = True
    rows = []
    for s in qsorts:
        aligned = [0.0, 0.0, 0.0]
        for col, (ref_col, sign) in enumerate(zip(perm, signs)):
            aligned[ref_col] = qualis[s][col] * sign
        diff = max(abs(aligned[j] - ref_loa[s][j]) for j in range(3))
        max_diff = max(max_diff, diff)
        q_factor = sorted(
            range(3), key=lambda j: -abs(aligned[j])  # noqa: B023
        )[0]
        same = [q_factor] == ref_factor[s]
        partition_ok &= same
        rows.append((s, aligned, ref_loa[s], ref_factor[s], q_factor, same))

    print(f"Factor alignment: Qualis cols -> ref {[p + 1 for p in perm]}, "
          f"signs {signs}")
    print(f"{'sort':5} {'Qualis (aligned)':28} {'qmethod':28} factor")
    for s, aln, rl, rf, qf, ok in rows:
        print(
            f"{s:5} {str([round(x, 4) for x in aln]):28} "
            f"{str([round(x, 4) for x in rl]):28} "
            f"ref f{rf[0] + 1} / Qualis f{qf + 1} {'OK' if ok else 'DIFF'}"
        )
    print(f"\nmax abs loading diff: {max_diff:.6f} (tol {LOADING_TOL})")
    print(f"identical factor partition: {partition_ok}")

    passed = partition_ok and max_diff <= LOADING_TOL
    print("\nVALIDATION " + ("PASSED" if passed else "FAILED"))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
