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

Each link exposes a QR code for printed materials. Each public link row shows live `started` and `submitted` counts in the links table; comparing them per link is the fastest way to spot a drop-off — large gaps between started and submitted usually point at the welcome page, the consent text, or grid sizing.

## Quality-control responses

From the **Data** page, open any participant row to see the reconstructed Q-sort, the presort and postsort answers, and the audio responses (when present). Three quick filters are useful before exporting:

- **Duration** — sort by duration to spot suspiciously fast completions.
- **Device** — exceptionally short mobile sessions sometimes indicate an aborted attempt.

To exclude a response, use **Discard** from the row's action menu and provide a reason. Discarded rows stay in the database for audit but are excluded from analysis and exports.

## Run analysis

The **Analysis** page runs PCA or centroid extraction with optional varimax rotation. Each run is persisted to an audit trail (the history panel at the top of the page); past runs can be reloaded, annotated, or deleted. Results are immutable. See the [Analysis section of the Admin Dashboard reference](../reference/admin-dashboard.md#analysis) for the full set of controls and outputs — including the **Explorer panel** (preview-range diagnostics for choosing the factor count) and **Compare** (Tucker φ congruence between two runs).

## Choose a distribution mode

The Q-sort tab exposes three distribution modes (`forced` / `free` / `flexible`). The choice carries methodological weight, so it is worth reading the field reference before activating:

- **Forced** is the classical Brown-school default. Per-column slot counts are enforced at activation and submission, so participants commit to specific trade-offs and Q-sorts are directly comparable.
- **Free** lets columns absorb overflow at sort time. The slot constraint becomes an upper hint. Critical-Q practitioners often prefer this mode (Watts & Stenner 2012, ch. 4).
- **Flexible** keeps the total enforced but treats per-column capacities as soft hints with a designer warning.

The setting is reversible until activation. To switch modes on an active study, clone it as a new draft. See [`configuration.md`](../reference/configuration.md#distribution_mode) for the formal field reference.

## Use memos as a design and analysis log

Memos are short markdown notes attached to a study (or a concourse) and surfaced via the toolbar drawer on the study Design page and the Concourse Detail page (not on the study's other admin pages). Three suggested categories:

- **Methodology memos** — rationale for the CoI, the distribution mode, the rough-sort toggle, the language(s) supported. Write these as you design, while the choices are still in front of you. They answer the reviewer questions you will get later ("why forced?", "why N=12?") and stop your future self from second-guessing what you already decided.
- **Analysis memos** — notes on factor decisions during the refinement workflow: how many factors you retained, which manual flagging overrides you applied, why you dropped or split a particular factor. See [Analyzing Results — Refinement](../tutorials/analyzing-results-refinement.md) once that tutorial lands.
- **General memos** — recruitment observations, team coordination, anything else worth tracking.

Threaded comments under each memo support `@mentions` of project members; mentioned users see an unread badge on the toolbar icon until they open the drawer. Memos are included in the Research Package export, so the analytic trail travels with the data.

## Export

Five formats are available from **Data → Export**: CSV (wide), PQMethod ZIP, R-Kit ZIP, Research Package ZIP, and a JSON dump. Pick the format that matches the downstream tool — see the [Data Export guide](data-export.md) for which is which.

## Preview a study before activating it

Use the **Preview** action in the designer toolbar (pilot mode) to walk through the participant experience yourself. The participant view loads the current draft from local storage, the submit step is short-circuited in the browser, and a local `PILOT-XXXXX` confirmation code is shown — nothing reaches the database. This is the right way to test a study end-to-end without polluting the dataset, and it works on any draft (you do not need to activate first).

## Study lifecycle

Studies move through Draft → Active → Paused → Closed → Archived. The constraints on each transition are documented in [`../reference/admin-dashboard.md#general`](../reference/admin-dashboard.md#general). The two transitions you will use most often are:

- **Draft → Active.** Triggers server-side validation. Once Active, the configuration (including the grid, statements, translations, and metadata) is read-only; only the collection-window dates (start/end date) can be changed. To edit translations or any other field you must switch the study back to Draft first.
- **Active → Paused.** Suspends new submissions while you fix a typo in a statement or instruction, without taking the study down permanently.

## Where data lives

Submissions persist as soon as a participant clicks Submit. Each submission gets a confirmation code shown to the participant. To retrieve the data, see the [Data Export guide](data-export.md). For the database schema (only relevant when running custom SQL on a self-hosted instance), see [`../explanation/architecture.md#database-schema`](../explanation/architecture.md#database-schema).
