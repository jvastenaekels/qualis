# Regenerate the frozen qmethod reference solution for the Lipset (1963)
# Q dataset (validation/lipset/qmethod_reference.json).
#
# This establishes chain-of-custody for the reference: the JSON committed
# next to this script is produced verbatim by qmethod on its own bundled
# `lipset` dataset. Anyone with R + qmethod can re-derive it.
#
#   Rscript validation/lipset/qmethod_reference.R > /tmp/loa.csv
#
# Requires: R, qmethod (CRAN, GPL-2-or-later). The committed JSON was
# produced with qmethod 1.8.4.
suppressMessages(library(qmethod))
data(lipset)
invisible(capture.output(
  q <- qmethod(lipset[[1]], nfactors = 3, rotation = "varimax", forced = TRUE)
))
cat("# qmethod", as.character(packageVersion("qmethod")), "\n")
cat("# rotated loadings (qsort x factor)\n")
write.csv(round(q$loa, 6), stdout())
cat("# automatic flags (qsort x factor)\n")
write.csv(q$flagged, stdout())
