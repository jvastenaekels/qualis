# NOTICE

This file lists upstream contributors whose work is incorporated into Qualis
under their respective licenses.

## qmethod (R package)

Several functions in Qualis's analysis module are derivative works of the R
`qmethod` package, translated from R to Python with structural fidelity to the
original implementations. Per GPL §1 and §5, copyright notices are preserved
here and modifications are stated.

- **Upstream**: <https://github.com/aiorazabala/qmethod>
- **Original authors**: Aiora Zabala (maintainer, primary author); Frans Hermans
  (centroid extraction in `centroid.R`, January 2021).
- **Original license**: GNU General Public License, version 2 or later (GPL-2+),
  as declared in qmethod's `DESCRIPTION` file (`License: GPL (>= 2)`).
- **Modifications**: translated from R to Python in 2026 by Julien Vastenaekels
  for Qualis. The Python translations remain subject to GPL-2+ as derivative
  works; Qualis distributes them under AGPL-3.0 via the GPL-3 upgrade path
  permitted by GPL-2+.

The following functions in `backend/app/services/analysis_service.py` are
derivative works of qmethod source:

| Qualis function (Python) | Source (qmethod, R) | Original author | Translation |
| --- | --- | --- | --- |
| `extract_centroid` | `centroid.R` | Frans Hermans (2021) | Close translation |
| `compute_factor_characteristics` | `qfcharact()` | Aiora Zabala et al. | Close translation |
| `flag_sorts` | `qflag()` | Aiora Zabala et al. | Close translation |
| `compute_factor_scores` | `qzscores()` | Aiora Zabala et al. | Idiomatic rewrite preserving structure |
| `classify_statements` | `qdc()` | Aiora Zabala et al. | Idiomatic rewrite preserving structure |

Independent Qualis implementations (not derivative of qmethod source code; based
on published algorithm descriptions or canonical methods):

- `extract_pca` — PCA via `numpy.linalg.eigh` with scaling
- `rotate_varimax` — Kaiser (1958) textbook implementation
- `compute_bootstrap_stability` — independent design referencing Zabala & Pascual
  (2016) conceptually, not as code source
- `apply_judgmental_rotations`, `compute_parallel_analysis_n`,
  `compute_velicer_map_n`, `standardize_factor_signs`, `compute_eigenvalues`,
  `apply_manual_flags`, `_distribution_from_grid_config`, `build_sort_matrix`,
  `correlation_matrix`, `compute_preview_range` — Qualis-original

## References

- Zabala, A. (2014). qmethod: A package to explore human perspectives using
  Q methodology. *The R Journal*, 6(2), 163–173.
  <https://doi.org/10.32614/RJ-2014-032>
- Zabala, A., & Pascual, U. (2016). Bootstrapping Q methodology to improve the
  understanding of human perspectives. *PLOS ONE*, 11(2), e0148087.
  <https://doi.org/10.1371/journal.pone.0148087>
