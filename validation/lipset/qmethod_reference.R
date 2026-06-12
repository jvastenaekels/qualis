# Regenerate the frozen qmethod reference solution for the Lipset (1963)
# Q dataset (validation/lipset/qmethod_reference.json).
#
# This establishes chain-of-custody for the reference: the JSON committed
# next to this script is produced verbatim by qmethod on its own bundled
# `lipset` dataset. Anyone with R + qmethod + jsonlite can re-derive it.
#
#   Rscript validation/lipset/qmethod_reference.R
#
# Requires: R, qmethod (CRAN, GPL-2-or-later), jsonlite. The committed JSON
# was produced with qmethod 1.8.4.
#
# Two solutions are frozen so the offline guard
# (backend/tests/integration/test_lipset_validation.py) can benchmark more of
# Qualis' engine than rotated loadings alone:
#   * PCA / varimax / auto-flag  (the default, modal configuration), plus
#     z-scores, factor arrays, and per-factor reliability / SE / eigenvalue;
#   * centroid / varimax / auto-flag (Brown's classical extraction), with
#     loadings, flags, z-scores and factor arrays — so the advertised
#     classical method is externally anchored, not only shape-checked.

suppressMessages({
  library(qmethod)
  library(jsonlite)
})

data(lipset)
m <- lipset[[1]] # statements x Q-sorts
qsorts <- colnames(m)
statements <- rownames(m)

round6 <- function(x) round(x, 6)
rows_by <- function(mat, names) {
  setNames(lapply(seq_len(nrow(mat)), function(i) unname(mat[i, ])), names)
}
rows <- function(mat) lapply(seq_len(nrow(mat)), function(i) unname(mat[i, ]))

solve_one <- function(extraction) {
  q <- qmethod(
    m,
    nfactors = 3, extraction = extraction,
    rotation = "varimax", forced = TRUE, silent = TRUE
  )
  loa <- round6(as.matrix(q$loa))
  flagged <- as.matrix(q$flagged)
  zsc <- round6(as.matrix(q$zsc))
  zscn <- as.matrix(q$zsc_n)
  ch <- q$f_char$characteristics
  list(
    loadings = rows_by(loa, qsorts),
    flagged = rows_by(flagged, qsorts),
    z_scores = rows(zsc),
    factor_arrays = lapply(rows(zscn), as.integer),
    factor_characteristics = list(
      eigenvalue = round6(unname(ch[, "eigenvals"])),
      composite_reliability = round6(unname(ch[, "reliability"])),
      se_factor_scores = round6(unname(ch[, "se_fscores"]))
    )
  )
}

pca <- solve_one("PCA")
centroid <- solve_one("centroid")

meta <- list(
  description = "Frozen qmethod reference solution for the Lipset (1963) Q dataset.",
  package = "qmethod",
  version = as.character(packageVersion("qmethod")),
  dataset = "lipset",
  pca_call = "qmethod(lipset[[1]], nfactors=3, extraction='PCA', rotation='varimax', forced=TRUE)",
  centroid_call = "qmethod(lipset[[1]], nfactors=3, extraction='centroid', rotation='varimax', forced=TRUE)",
  rotation = "varimax",
  flagging = "automatic",
  schema = 2L,
  frozen = "PCA + centroid: loadings, auto-flags, z-scores, factor arrays; PCA also reliability/SE/eigenvalue.",
  statement_order = "Row order of z_scores/factor_arrays follows `statements` (qmethod rownames), index-aligned to sorted Qualis statement ids S01..S33.",
  provenance = "Lipset (1963), 'The Value Patterns of Democracy'; dataset distributed with the qmethod R package (Zabala 2014) under GPL-2-or-later.",
  regenerate = "validation/lipset/qmethod_reference.R"
)

out <- list(
  meta = meta,
  qsorts = qsorts,
  statements = statements,
  loadings = pca$loadings,
  flagged = pca$flagged,
  z_scores = pca$z_scores,
  factor_arrays = pca$factor_arrays,
  factor_characteristics = pca$factor_characteristics,
  centroid = list(
    loadings = centroid$loadings,
    flagged = centroid$flagged,
    z_scores = centroid$z_scores,
    factor_arrays = centroid$factor_arrays
  )
)

here <- tryCatch(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))),
  error = function(e) "."
)
if (length(here) == 0 || here == "") here <- "validation/lipset"
path <- file.path(here, "qmethod_reference.json")
writeLines(toJSON(out, pretty = TRUE, auto_unbox = TRUE, digits = 6, null = "null"), path)
cat("wrote", path, "— qmethod", as.character(packageVersion("qmethod")), "\n")
