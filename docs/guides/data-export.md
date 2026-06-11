# Data Export

How to export Qualis study data for downstream analysis or archiving. All export actions are available from **Study → Data → Export** in the admin dashboard, and equivalently from the API for scripted workflows.

For the corresponding API endpoints (with rate limits and authorisation), see [`../reference/api.md#admin--exports-apiadminstudiesslug`](../reference/api.md#admin--exports-apiadminstudiesslug).

---

## Choose a format

| Format | When to use it | Output |
| ------ | -------------- | ------ |
| **CSV (wide)** | Spreadsheet inspection, Excel / SPSS / Stata. | One row per non-discarded participant. |
| **PQMethod ZIP** | PQMethod or Ken-Q desktop analysis. | `.sta` + `.dat` + `.ans` (PQMethod project-info file), completed participants only. |
| **R-Kit ZIP** | R analysis with the `qmethod` package. | CSV + auto-generated R script. |
| **Research package ZIP** | Archiving, journal submission, reproducibility. | All of the above + codebook + study metadata + audio metadata + memos (methodology + analysis trail). |
| **JSON dump** | Backups; bespoke pipelines. | Complete study + every participant placement. |

Discarded participants are excluded from CSV / PQMethod / R-Kit / Package by default. To inspect them, use the JSON dump. (Pilot-mode previews never reach the database, so they cannot appear in any export.)

## Export the whole study

In the dashboard:

1. Open **Study → Data**.
2. Click **Export**.
3. Pick a format. The file downloads immediately.

For scripted exports, the equivalent endpoints (Editor role required) are:

| Format | Endpoint |
| ------ | -------- |
| CSV (wide) | `GET /api/admin/studies/{slug}/export/csv` |
| PQMethod | `GET /api/admin/studies/{slug}/export/pqmethod` |
| R-Kit | `GET /api/admin/studies/{slug}/export/r-kit` |
| Research package | `GET /api/admin/studies/{slug}/export/package` |
| JSON dump | `GET /api/admin/studies/{slug}/dump` |

## Export a single participant

From the participant detail view (Data → click any row), use the **Export** menu:

- **CSV** — one row, this participant only.
- **JSON** — complete structured data.
- **Audio ZIP** — every recording for this participant, with metadata.

## Audio storage usage

To check whether the per-study audio quota is being approached:

- Dashboard: **Study → Settings → Storage usage**.
- API: `GET /api/admin/studies/{slug}/storage-usage`.

Configure the per-study quota under `postsort_config.audio.max_storage_mb` (see [configuration reference](../reference/configuration.md#postsort_config)).

---

## Built-in analysis

For PCA or centroid extraction with varimax or judgmental rotation, you do not need to export at all — open **Study → Analysis** and run a factor analysis in the browser. Judgmental (manual) rotation is built in: choose the **judgmental** rotation option and define the manual rotation pairs in the sub-panel. Each run is persisted to the audit trail. See the [Analysis section of the Admin Dashboard reference](../reference/admin-dashboard.md#analysis).

Use exports when you need a tool that Qualis does not provide (custom scripts, journal-required formats).

---

## Interactive inspection before export

Before exporting, audit responses to decide which to keep:

1. **Grid reconstruction** — Clicking a participant opens a high-fidelity visual of their final Q-sort.
2. **Quality flags** — Completion duration is surfaced as a sortable column; device type is shown as an icon on each participant row. Sort by duration to spot anomalies.
3. **Qualitative context** — Card comments and audio responses are shown alongside the grid.

Mark problematic rows with **Discard** (an optional reason can be recorded). Discarded rows are excluded from analysis and from the CSV / PQMethod / R-Kit / Package exports, but are preserved in the database for audit.

---

## Data privacy

What ends up in an export depends on what the study collected:

- **No PII by default.** Only fields explicitly added to `presort_config` (e.g. an email field) appear in exports.
- **IP addresses are hashed.** The `participants` table stores SHA-256 hashes salted with `IP_HASH_SALT`. Plaintext IPs are never persisted, never exported.
- **Consent versions are hashed.** Each participant's row records the hash of the consent text they actually saw, so audit reviewers can prove which version was in force.
- **Language resolution.** Multilingual studies resolve option labels to the participant's language at export time, falling back to the study's `default_language`, then the first available translation.

For GDPR Art. 17 erasure of an individual participant, use the **Erase personal data** action on the participant detail view (or `DELETE /api/admin/studies/{slug}/participants/{participant_id}/personal-data`). For bulk anonymisation by cutoff date, use **Study → Settings → Bulk anonymise** (`POST /api/admin/studies/{slug}/anonymise-bulk`).
