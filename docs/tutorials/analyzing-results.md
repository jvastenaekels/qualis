# Analyzing Results

In this tutorial, you will learn how to use Qualis's built-in factor analysis tools to extract viewpoints from your Q-sort data, interpret the results, and export data for further analysis in PQMethod, R, or KADE.

This tutorial continues from [Collecting Responses](collecting-responses.md).

**What you will learn:**

- How to read the scree plot and choose the number of factors
- How to configure and run a factor analysis (PCA or centroid extraction)
- How to interpret factor loadings, factor arrays, and statement scores
- How to identify distinguishing and consensus statements
- How to export results

**Time required:** ~20 minutes

**Prerequisites:** A Qualis study with at least 2 completed participant responses.

---

## Step 1: Navigate to the Analysis Page

1. In the admin sidebar, click **Analysis**.

The Analysis page shows a **Configuration** card at the top. If you have enough completed participants, Qualis computes eigenvalues and displays a scree plot.

---

## Step 2: Read the Scree Plot

The scree plot shows eigenvalues for each potential factor in descending order.

Key things to look for:
- **Kaiser criterion (eigenvalue > 1)**: Factors above this line explain more variance than a single variable. Qualis draws this reference line automatically.
- **The "elbow"**: The point where the curve flattens out. Factors before the elbow are generally worth retaining.

---

## Step 3: Configure the Analysis Parameters

Below the scree plot, configure four parameters:

### Extraction Method
- **PCA (Principal Component Analysis)**: Maximizes explained variance. Most common choice.
- **Centroid**: Less mathematically constrained factors. Preferred by some Q researchers for theoretical reasons.

### Number of Factors
Select how many factors to extract. Each factor represents a distinct shared viewpoint.

### Rotation
- **Varimax**: Maximizes separation between factors. Standard choice in Q methodology.
- **None**: Preserves the original mathematical solution.

### Flagging
- **Auto**: Qualis flags participants whose loading exceeds the significance threshold (`1.96 / sqrt(n_statements)`) on exactly one factor.
- **Manual**: You manually select which participants define each factor.

---

## Step 4: Run the Analysis

1. Click the **Run Analysis** button.
2. Wait for processing to complete.
3. Results appear below the configuration with four tabs: **Loadings**, **Factor Arrays**, **Statements**, and **Characteristics**.

---

## Step 5: Interpret Factor Loadings (Loadings Tab)

The Loadings tab shows a table where:
- Each **row** is a participant
- Each **column** is a factor
- Each **cell** contains the loading (correlation from -1 to +1)

**How to read it:**
- **Highlighted values** exceed the significance threshold.
- **Flagged participants** (starred rows) load significantly on exactly one factor -- they "define" that viewpoint.
- Look for clean structure: most participants loading high on one factor and low on others.

To override auto-flagging, switch to **Manual** mode and click individual cells.

---

## Step 6: Examine Factor Arrays (Factor Arrays Tab)

Factor arrays show the composite Q-sort for each factor -- the idealized sort representing the shared viewpoint.

Statements are arranged from most disagreed (left) to most agreed (right).

- **Amber-highlighted statements** are distinguishing -- placed significantly differently compared to other factors.
- Compare arrays across factors to see where viewpoints diverge.

---

## Step 7: Review Statement Scores (Statements Tab)

This table lists every statement with:
- **Z-scores** for each factor
- **Factor array position** for each factor
- **Classification**:
  - **D (Distinguishing)**: Placed significantly differently across factors. Stars indicate significance level.
  - **C (Consensus)**: All factors agree on placement.

Focus on D statements when writing your interpretation narrative.

---

## Step 8: Review Factor Characteristics

The Characteristics tab provides:
- **Eigenvalue** and **variance explained** for each factor
- **Number of flagged participants** per factor
- **Composite reliability**
- **Standard error** of factor scores
- **Factor correlation matrix**

A good solution typically explains 35-60% of total variance with composite reliability above 0.90.

---

## Step 9: Export Data

### From the Analysis Page

Click the **Export** dropdown next to Run Analysis:
- **CSV -- Factor Loadings**: Participant labels, loadings, and flagging status
- **CSV -- Statement Scores**: Z-scores, array positions, and classifications

### From the Data Page

Navigate to **Data** for broader export options:
- **CSV**: Full participant data (metadata, presort, Q-sort scores, postsort)
- **PQMethod ZIP**: `.dat` and `.sta` files for PQMethod software
- **R-Kit ZIP**: CSV data with a ready-to-run R script
- **KenQ JSON**: Complete JSON for web-based analysis tools
- **Research Package**: Comprehensive ZIP for archiving and reproducibility

---

## Tips for a Good Analysis

- **Start with the scree plot** to get a sense of how many meaningful factors exist.
- **Try different numbers of factors** and compare solutions.
- **PCA with varimax rotation and auto-flagging** is a solid default.
- **Focus on distinguishing statements** when interpreting factors.
- **Name your factors** based on the pattern of extreme statements.
- **Cross-reference with post-sort qualitative data** to understand the "why" behind the numbers.

## Next Steps

You have now completed the full researcher workflow. For developer-oriented content, see the [Local Development Setup](local-development.md) tutorial.
