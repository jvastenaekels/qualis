# Conducting Studies

How-to guide for the researcher running studies in Qualis. Assumes you already know Q-methodology and have a Qualis account with researcher access.

For the page-by-page UI catalog, see [`../reference/admin-dashboard.md`](../reference/admin-dashboard.md). For the full design walk-through on a fresh study, see [`../tutorials/your-first-study.md`](../tutorials/your-first-study.md).

---

## Recruit and monitor

Use the **Recruitment** page to generate access links and watch participation in real time.

| Link type | Use case |
| --------- | -------- |
| Public | Open recruitment (social, mailing list, conference). Unlimited usage. |
| Individual | Single-use tokens for panel recruitment or longitudinal designs. |
| Limited | Capped usage (e.g. 50 per cohort). |

Each link exposes a QR code for printed materials. The funnel chart on the same page (Started / Submitted / Success Rate) is the fastest way to spot a drop-off — large gaps between Started and Submitted usually point at the welcome page, the consent text, or grid sizing.

## Quality-control responses

From the **Data** page, open any participant row to see the reconstructed Q-sort, the presort and postsort answers, and the audio responses (when present). Three quick filters are useful before exporting:

- **Duration** — sort by duration to spot suspiciously fast completions.
- **Device** — exceptionally short mobile sessions sometimes indicate an aborted attempt.

To exclude a response, use **Discard** from the row's action menu and provide a reason. Discarded rows stay in the database for audit but are excluded from analysis and exports.

## Run analysis

The **Analysis** page runs PCA or centroid extraction with optional varimax rotation. Each run is persisted to an audit trail (the history panel at the top of the page); past runs can be reloaded, annotated, or deleted. Results are immutable. See the [Analysis section of the Admin Dashboard reference](../reference/admin-dashboard.md#analysis) for the full set of controls and outputs.

## Export

Five formats are available from **Data → Export**: CSV (wide), PQMethod ZIP, R-Kit ZIP, Research Package ZIP, and a JSON dump. Pick the format that matches the downstream tool — see the [Data Export guide](data-export.md) for which is which.

## Preview a study before activating it

Use the **Preview** action in the designer toolbar (pilot mode) to walk through the participant experience yourself. The participant view loads the current draft from local storage, the submit step is short-circuited in the browser, and a local `PILOT-XXXXX` confirmation code is shown — nothing reaches the database. This is the right way to test a study end-to-end without polluting the dataset, and it works on any draft (you do not need to activate first).

## Study lifecycle

Studies move through Draft → Active → Paused → Closed → Archived. The constraints on each transition are documented in [`../reference/admin-dashboard.md#general`](../reference/admin-dashboard.md#general). The two transitions you will use most often are:

- **Draft → Active.** Triggers server-side validation. Once Active, the grid and statements are read-only; translations and metadata stay editable.
- **Active → Paused.** Suspends new submissions while you fix a typo in a statement or instruction, without taking the study down permanently.

## Where data lives

Submissions persist as soon as a participant clicks Submit. Each submission gets a confirmation code shown to the participant. To retrieve the data, see the [Data Export guide](data-export.md). For the database schema (only relevant when running custom SQL on a self-hosted instance), see [`../explanation/architecture.md#data-model`](../explanation/architecture.md#data-model).
