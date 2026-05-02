# Analyzing Results — Foundations

In this tutorial you will run a factor analysis on the study you built in the previous tutorials and see what each results tab shows. This is the baseline workflow that produces a publishable factor solution — defaults that work, the four basic results tabs, exports.

Once you are comfortable with the baseline, [Analyzing Results — Refinement](analyzing-results-refinement.md) covers the iterative tools (Explorer panel, Compare, factor canvas, memos) that you reach for when defaults are not enough.

For the *why* behind extraction methods, rotation, distinguishing statements, and reliability, see [`../explanation/q-methodology.md`](../explanation/q-methodology.md).

This tutorial continues from [Collecting Responses](collecting-responses.md).

**What you will learn:**

- How to run a factor analysis with the classical Brown-school defaults
- What each of the four results tabs shows
- How to spot when a result is too thin to interpret
- Where to find exports

**Time required:** ~20 minutes

**Prerequisites:** A Qualis study with **at least ~10 completed participant responses**. You can generate them by repeatedly opening your public link in a private window and walking through the participant flow (see [Collecting Responses, Step 6](collecting-responses.md#step-6-walk-one-link-yourself)). Below ~10 responses, factor analysis runs will not produce a meaningful structure and the results below will look noisy.

---

## Step 1: Open the Analysis page

In the admin sidebar, click **Analysis**. The page shows a **Configuration** card and, if you have enough completed participants, a **Scree plot** above it.

If you see a warning about insufficient data, return to your study link and complete a few more sessions before continuing.

---

## Step 2: Run the analysis with defaults

The configuration card exposes four parameters:

- **Extraction method** — leave on **PCA**.
- **Number of factors** — leave on the suggested value (Qualis suggests one based on the Kaiser criterion, eigenvalue > 1).
- **Rotation** — leave on **Varimax**.
- **Flagging** — leave on **Auto**.

Click **Run Analysis**. Processing takes a few seconds. Four result tabs appear: **Loadings**, **Factor Arrays**, **Statements**, **Characteristics**.

> The defaults you just used are the standard Q-methodology baseline (Brown 1980; Watts & Stenner 2012). When you are ready to vary them, see [`../explanation/q-methodology.md`](../explanation/q-methodology.md) for the trade-offs between PCA / centroid extraction, varimax / no rotation, and auto / manual flagging.

---

## Step 3: Loadings tab

You see a table where each **row** is a participant and each **column** is a factor. Each cell holds a loading between −1 and +1.

What to look for in a healthy result:

- Cells exceeding the significance threshold are highlighted.
- Some rows are **flagged** (starred): they load significantly on exactly one factor and "define" that factor.
- A clean structure shows most participants loading high on one factor and low on the others.

If everything looks noisy and nothing is flagged, you almost certainly do not have enough participants yet. This is expected on a tutorial-sized dataset.

To override the auto-flagging, switch the **Flagging** control to **Manual** and click cells to flag them by hand.

---

## Step 4: Factor Arrays tab

The factor array is the composite Q-sort for each factor — the idealised sort of the shared viewpoint.

Statements are arranged from most disagreed (left) to most agreed (right). Statements highlighted in amber are *distinguishing*: they sit at significantly different positions across factors. Comparing arrays side-by-side is the fastest way to see where the viewpoints diverge.

---

## Step 5: Statements tab

Every statement is listed with:

- **Z-score** per factor.
- **Factor array position** per factor.
- **Classification**: **D** (distinguishing — significantly different across factors; stars indicate the significance level: p < 0.05 / 0.01 / 0.001) or **C** (consensus — agreed across all factors).

When you are interpreting a real study, distinguishing statements are usually where the factor's character lives.

---

## Step 6: Characteristics tab

A summary card per factor:

- Eigenvalue and variance explained.
- Number of flagged participants.
- Composite reliability (Spearman-Brown).
- Standard error of factor scores.
- Factor correlation matrix.

For tutorial-sized data, do not be alarmed if reliability is low or variance explained is patchy — that is a function of N, not of your study design.

---

## Step 7: Export

Two ways to get the data out:

- **From this page**, the Export dropdown gives you `CSV — Factor Loadings` and `CSV — Statement Scores`.
- **From the Data page** (`Data → Export`), you get the full participant data in CSV, PQMethod, R-Kit, JSON dump, and the Research Package. See the [Data Export guide](../guides/data-export.md) for which format fits which downstream tool.

Each analysis you ran is also persisted to the **history panel** at the top of the Analysis page. You can reload a past run, edit your researcher notes on it, or delete it.

---

## What you built

You ran a complete factor analysis end-to-end and saw what each tab surfaces. With a real study (40+ participants is typical for Q-methodology), the same workflow will produce interpretable factors, and the same exports plug into PQMethod, Ken-Q, KADE, and the R `qmethod` package.

## Next steps

Two paths forward:

- **For most workflows** the baseline is enough — export, write up, ship. The export formats are covered in [Data Export](../guides/data-export.md).
- **When you need more**, continue to [Analyzing Results — Refinement](analyzing-results-refinement.md): choosing the factor count deliberately (Explorer panel + preview range), validating stability against an alternate solution (Compare / Tucker φ), building the interpretive narrative for each factor (factor canvas + quote picker), tracing collaborative interpretation (memos + @-mentions).

For developer-oriented content, see the [Development Workflow guide](../contributing/development.md).
