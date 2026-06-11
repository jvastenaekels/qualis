# Analyzing Results — Refinement

In [Analyzing Results — Foundations](analyzing-results-foundations.md) you ran the standard workflow with defaults. This tutorial covers the iterative tools you reach for when the defaults are not enough — when you need to choose the factor count deliberately, check that minor changes to the analysis produce equivalent results, or build the interpretive narrative for each factor.

Two audiences end up using these tools, often on the same study:

- The methodologist who wants to *validate* a factor solution before publishing. The **Explorer panel** and **Compare** are the quantitative refinement tools.
- The critical-Q researcher who wants to *interpret* factors as situated viewpoints. The **factor canvas with quote picker** and **memos** are the interpretive layering tools.

The four sections below follow the order they typically enter a workflow.

**What you will learn:**

- How to choose the factor count by scanning eigenvalues across a preview range.
- How to compare two analysis runs and read Tucker φ congruence.
- How to use focus mode and the quote picker to anchor a factor narrative in participant voice.
- How to log interpretive decisions as memos for collaboration and reproducibility.

**Time required:** ~30 minutes
**Prerequisites:** A Qualis study with at least one analysis run completed (see Foundations).

---

## 1. Choosing the factor count (Explorer panel)

The Explorer panel sits at the top of the Analysis page once you have loaded a run. It shows eigenvalue and cumulative variance for a preview range from 2 factors up to a cap of 8 (or *n* − 1 valid participants, whichever is smaller). On open, the panel auto-loads a 2…min(6, max) range.

The default Kaiser criterion (eigenvalue > 1) is a starting point, not a verdict. Reasons to deviate:

- **Variance leveling.** If factors 3 and 4 each explain 8% but factor 5 explains 2%, retain four — the marginal factor adds little.
- **Theoretical legibility.** A four-factor solution that maps onto a known theoretical typology may be preferable to a five-factor solution that splits one viewpoint in two for purely statistical reasons.
- **Sample-size constraints.** With small N, retaining many factors over-fits. As a rule of thumb, do not retain more factors than `N / 6`.

The panel automatically previews up to 8 factors (capped at *n* − 1 valid participants); read the scree/elbow from the auto-generated table — looking for an *elbow*, a point where successive eigenvalues drop sharply. That elbow plus the Kaiser line is your starting hypothesis. Re-run the analysis with that factor count.

> **Document your choice.** Open the Methodology memo on the Study Design page (right-side panel) and write one sentence: *« retained 3 factors based on Kaiser + variance elbow at 4 → 5 »*. Memos are study-level, not tied to the Analysis page. This is the kind of decision a reviewer asks about three months later.

---

## 2. Validating stability (Compare)

Once you have a candidate solution, ask whether a small change in the analysis would produce the same factors. Three perturbations worth checking:

1. **Different rotation** — re-run with rotation off, then with Varimax, and Compare them. Strong factors survive both.
2. **Different flagging** — re-run with manual flagging that excludes one or two borderline cases. Stable factors are robust to flagging choices.
3. **Different N** — if you have collected more responses since your initial run, re-run on the larger N.

The Compare panel aligns two analysis runs via Tucker φ congruence (computed in the browser; see `frontend/src/utils/tuckerPhi.ts`). The panel itself flags an **ambiguous match** (amber) only when |φ| < 0.85. As a stricter manual reading convention:

- **φ ≥ 0.95** — factors are essentially identical.
- **0.90 ≤ φ < 0.95** — equivalent, with minor differences in loadings.
- **φ < 0.90** — not the same factor; the perturbation did matter.

The aligned-arrays view reorders + sign-flips the second run's factors to maximise congruence with the first, so you can read the delta columns to see *which statements moved between runs*. Statements whose z-score shifted by |Δz| ≥ 0.5 (the threshold at which the Δz chip is highlighted amber) are worth a second look.

> **Document your choice.** Save a memo: *« compared run 4 (manual flag, 3F) vs run 7 (auto, 3F): φ_diag = 0.97 / 0.94 / 0.91, statements 11 and 23 moved at the boundary — kept run 4 »*.

---

## 3. Building the factor narrative (factor canvas)

The factor array tells you *what* a factor agrees and disagrees with. It does not tell you *why this viewpoint exists* — that is the interpretive layer.

Click into a factor on the Analysis page to enter the **factor canvas** in focus mode. The canvas stacks its panels vertically: the Statements card, then a **voices panel** below it, then the factor-narrative editor. The voices panel pulls participant material for participants flagged on this factor who left a post-sort comment or audio recording:

- Post-sort comments from those participants.
- Audio playback (if your study collected post-sort audio) for the same participants.

Distinguishing statements do not appear in the voices panel; they are marked with a **D** badge in the Statements card, surfaced by |z| ordering (top 12), not at fixed +3/−3 grid positions.

Click the ▸+ button on a comment to insert it as an attributed blockquote into the factor narrative, grounding each interpretive claim about the factor in specific participant material. The result is a panel you can copy-paste into the *Findings* section of a paper, with each claim sourced from one or more participants.

This is where critical-Q practice diverges from purely statistical interpretation. The factor array stops being a finished object: it becomes the starting point for interpretive work where situated participant voices remain visible all the way through to the writeup.

> **Document your choice.** A memo per factor — *« Factor 1 — flexibility-driven viewpoint, anchored in P12's "control over my schedule" + P27's audio remark on commute time »*.

---

## 4. Tracing collaborative interpretation (memos)

Memos turn analysis from an opaque solo activity into a traceable conversation. Three patterns worth adopting:

- **Decision memos** — every factor-count change, every flagging override, every dropped factor: one memo per decision. This protects you from forgetting why you did what you did, and from the « mais je croyais qu'on avait gardé 4 facteurs » email three weeks later.
- **Interpretive memos** — the kind started in Section 3, one per factor, anchored in voices.
- **@-mention threads** — when a co-researcher should weigh in (« @clémence: ce facteur 3 te paraît distinct du 2 ou c'est la même chose dite autrement ? »), use the @-mention. The mentioned user gets an unread badge on their next page load.

Memos travel with the Research Package export, so the audit trail stays attached to the data. Anyone who opens the archive months later can reconstruct what you decided and why.

---

## What you built

You moved from a default analysis to a solution you can defend: chosen deliberately, validated against perturbations, and traceable through your memos. The tools (Explorer, Compare, factor canvas, memos) are utilities, not a fixed sequence — reach for them when the defaults stop being enough.

## Next steps

You have completed the analysis workflow. For exporting to PQMethod, R, or Ken-Q, see [Data Export](../guides/data-export.md). For methodological background, see [Q-Methodology](../explanation/q-methodology.md).
