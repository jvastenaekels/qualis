# Lipset (1963) — analytical validation

This pins Qualis' factor-analysis engine to an **external, citable
reference** rather than to its own output. Qualis must reproduce the
`qmethod` factor solution on the openly published Lipset (1963)
"Value Patterns of Democracy" Q dataset (33 statements, 9 Q-sorts),
which is redistributed with the [`qmethod`](https://cran.r-project.org/package=qmethod)
R package (Zabala 2014) under GPL-2-or-later.

The frozen oracle covers **two extractions** — PCA and Brown's centroid,
both varimax-rotated and auto-flagged — and, for each, benchmarks not just
rotated loadings but **z-scores, factor arrays, and the flag matrix** (plus
per-factor reliability / SE / eigenvalue for PCA). This anchors the
statistics researchers actually interpret, and externally validates the
classical centroid method the engine advertises.

## Files

| File | Role |
| --- | --- |
| `qmethod_reference.json` | Frozen reference (schema 2): PCA **and** centroid solutions — loadings, auto-flags, z-scores, factor arrays; PCA also reliability/SE/eigenvalue. From `qmethod` 1.8.4. |
| `qmethod_reference.R` | Regenerates the reference from `qmethod` itself (chain-of-custody). Requires `qmethod` + `jsonlite`. |
| `compare.py` | Runs Qualis' analysis via the **live API**, aligns factors, asserts loadings + partition. Pure stdlib, **no R needed**. |
| `backend/tests/integration/test_lipset_validation.py` | The full oracle enforced **offline in CI** — calls the analysis pipeline directly, no Docker/API. |

## Continuous enforcement (CI)

The equivalence is **regression-guarded on every commit**:
`backend/tests/integration/test_lipset_validation.py` runs in the standard
`pytest tests` job (`make ci` / GitHub Actions) and, **offline**, calls
`run_analysis()` on the committed Q-sort matrix and compares to the frozen
`qmethod_reference.json`. For **both** PCA and centroid it asserts rotated
loadings, z-scores, factor arrays and the auto-flag matrix; for PCA it also
asserts per-factor reliability, SE of factor scores, and eigenvalues. Bounds:
`1e-4` for PCA loadings/z-scores (eigendecomposition is exact), `2e-4` for
centroid (iterative extraction), exact for factor arrays and flags.

`compare.py` remains the **live-API twin** (loadings + partition), run on
demand to confirm the same numbers survive the full deployed request path
(serialisation, persisted `AnalysisRun`, DB round-trip).

## Reproduce (no R required)

```bash
make demo-up
make demo-lipset
make validate-lipset        # or: python validation/lipset/compare.py
```

`compare.py` runs a PCA / Varimax / automatic-flagging 3-factor
analysis on the seeded `lipset-democracy` study, aligns the solution
to the reference (factor order and sign are mathematically
indeterminate), and asserts:

- an **identical factor assignment** for all nine Q-sorts, and
- rotated loadings agreeing within `1e-4`.

Exit code `0` = passed, `1` = failed.

## Regenerate the reference (requires R + qmethod + jsonlite)

```bash
Rscript validation/lipset/qmethod_reference.R
```

The script writes `qmethod_reference.json` verbatim from two `qmethod` calls
on its own bundled `lipset` dataset:

- `qmethod(lipset[[1]], nfactors=3, extraction="PCA",      rotation="varimax", forced=TRUE)`
- `qmethod(lipset[[1]], nfactors=3, extraction="centroid", rotation="varimax", forced=TRUE)`

The committed reference was produced with `qmethod` 1.8.4. Last verified,
Qualis reproduces it with: identical nine-sort flag matrices and factor
arrays for both extractions; PCA loadings/z-scores within `6.5e-5`/`5.0e-5`;
centroid loadings/z-scores within `1.1e-4`/`1.3e-4`; reliability/SE within
`1e-7`.
