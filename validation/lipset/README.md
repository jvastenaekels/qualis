# Lipset (1963) — analytical validation

This pins Qualis' factor-analysis engine to an **external, citable
reference** rather than to its own output. Qualis must reproduce the
`qmethod` factor solution on the openly published Lipset (1963)
"Value Patterns of Democracy" Q dataset (33 statements, 9 Q-sorts),
which is redistributed with the [`qmethod`](https://cran.r-project.org/package=qmethod)
R package (Zabala 2014) under GPL-2-or-later.

## Files

| File | Role |
| --- | --- |
| `qmethod_reference.json` | Frozen reference: rotated loadings + automatic flags from `qmethod` 1.8.4. |
| `qmethod_reference.R` | Regenerates the reference from `qmethod` itself (chain-of-custody). |
| `compare.py` | Runs Qualis' analysis via the API, aligns factors, asserts the match. Pure stdlib, **no R needed**. |

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
- rotated loadings agreeing within `1e-3`.

Exit code `0` = passed, `1` = failed.

## Regenerate the reference (requires R + qmethod)

```bash
Rscript validation/lipset/qmethod_reference.R
```

The committed `qmethod_reference.json` was produced with `qmethod`
1.8.4 (call: `qmethod(lipset[[1]], nfactors=3, rotation="varimax",
forced=TRUE)`). Last verified: Qualis reproduces it with an identical
nine-sort factor assignment and a maximum loading difference of
`0.0001`.
