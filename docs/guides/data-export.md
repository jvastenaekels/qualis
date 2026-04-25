# Data Export Guide

This guide explains how Qualis stores participant data and how researchers can export and interpret it for analysis.

---

## Database Structure for Analysis

The most critical table for analysis is `qsort_entries`. Each row represents one statement's position for one participant.

### `participants` Table

Records the metadata for a sorting session:

- `language_used`: The locale the participant used.
- `submitted_at`: Timestamp of completion.
- `presort_answers`: JSON object containing demographic data.
- `postsort_answers`: JSON object containing qualitative comments.
- `is_test_run`: Boolean flag for test submissions.
- `is_discarded`: Boolean flag for excluded responses.
- `discard_reason`: Optional text explaining why a response was discarded.

### `qsort_entries` Table

Records the actual sort data:

- `participant_id`: Links back to the participant.
- `statement_id`: Links to the statement text.
- `grid_score`: The numerical score (-4 to +4) where the card was placed.
- `card_comment`: (Optional) Individual comment on that specific card.

### `audio_recordings` Table

Stores metadata for audio responses recorded during the post-sort phase (actual audio files are stored in S3):

- `participant_id`: Links to the participant.
- `question_key`: Identifies which question or card the recording is for.
- `s3_bucket` / `s3_key`: S3 storage location.
- `mime_type`: Audio format (e.g., `audio/webm`).
- `duration_seconds`: Length of the recording.

---

## Export Formats

A researcher can export results via the admin dashboard or the API (requires authentication).

### 1. CSV Export

**API**: `GET /api/admin/studies/{slug}/export/csv`

Returns a wide-format file ready for spreadsheet software (Excel, Numbers, SPSS).

- One row per participant.
- Columns include: participant metadata, presort answers, Q-sort scores per statement, and postsort answers.
- Test runs and discarded participants are excluded by default.

### 2. PQMethod Export

**API**: `GET /api/admin/studies/{slug}/export/pqmethod`

Returns a ZIP containing `.dat` and `.sta` files specifically formatted for **PQMethod** and **Ken-Q Analysis** software. This is the industry-standard format for Q-methodology factor analysis.

### 3. KenQ JSON

**API**: `GET /api/admin/studies/{slug}/dump`

Complete JSON structure containing the full study configuration and all participant data. Compatible with web-based analysis tools and useful for backups.

### 4. R-Kit Export

**API**: `GET /api/admin/studies/{slug}/export/rkit`

Returns a ZIP file containing:
- A CSV data file formatted for R.
- A ready-to-run R script that loads the data and performs analysis using the `qmethod` R package.

### 5. Research Package

A comprehensive ZIP containing all of the above formats plus:
- A codebook documenting all variables and their meanings.
- Statement translations and study metadata.
- Audio recording metadata (if applicable).

Ideal for archiving, reproducibility, and journal submission.

### 6. Individual Participant Exports

From a participant's detail view, you can export:
- **CSV**: That participant's data only.
- **JSON**: Complete structured data for the participant.
- **Audio ZIP**: All audio recordings with metadata (if applicable).

---

## Interpreting Results

### Flattening for Analysis Tools

To use tools like **PQMethod** or **Ken-Q**, you usually need data in a horizontal format (one row per participant, columns for each statement). The CSV and PQMethod exports handle this transformation automatically.

**Example SQL for manual flattening:**

```sql
SELECT
    p.id as participant_id,
    s.code as statement_code,
    qe.grid_score
FROM participants p
JOIN qsort_entries qe ON p.id = qe.participant_id
JOIN statements s ON qe.statement_id = s.id
WHERE p.status = 'completed'
  AND p.is_test_run = false
  AND p.is_discarded = false;
```

---

## Built-in Analysis

Qualis includes a built-in factor analysis engine accessible from the **Analysis** page. This allows you to run PCA or centroid extraction with varimax rotation directly in the browser without exporting data first. See the [Analysis section of the Admin Features guide](admin-features.md#analysis) for details.

---

## Interactive Data Inspection

Before performing full factor analysis, researchers can audit individual results directly in the Qualis dashboard.

1. **Grid Reconstruction**: Clicking on any participant in the Data page opens a high-fidelity visual of their final Q-sort grid.
2. **Quality Audit**: The dashboard shows completion duration and flags test runs. You can manually discard suspicious responses.
3. **Qualitative Context**: View participant-level comments and audio recordings side-by-side with their grid placements to understand the "why" behind their rankings.

---

## Data Privacy

Qualis is designed with privacy in mind. No PII (Personally Identifiable Information) is stored unless specifically requested in the `presort_config`. IP addresses are hashed by default. Researchers are encouraged to only collect necessary data.
