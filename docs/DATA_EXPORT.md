# Data Export Guide

This document explains how Open-Q stores participant data and how researchers can interpret it for analysis.

## 🗄️ Database Structure for Analysis

The most critical table for analysis is `qsort_entries`. Each row represents one statement's position for one participant.

### `participants` Table

Records the metadata for a sorting session:

- `language_used`: The locale the participant used.
- `submitted_at`: Timestamp of completion.
- `presort_answers`: JSON object containing demographic data.
- `postsort_answers`: JSON object containing qualitative comments.

### `qsort_entries` Table

Records the actual sort data:

- `participant_id`: Links back to the participant.
- `statement_id`: Links to the statement text.
- `grid_score`: The numerical score (-4 to +4) where the card was placed.
- `card_comment`: (Optional) Individual comment on that specific card.

---

## 📈 Interpreting Results

### Flattening for Analysis Tools

To use tools like **PQMethod** or **Ken-Q**, you usually need to transform the data into a horizontal format (one row per participant, columns for each statement).

**Example SQL for flattening:**

```sql
SELECT
    p.id as participant_id,
    s.code as statement_code,
    qe.grid_score
FROM participants p
JOIN qsort_entries qe ON p.id = qe.participant_id
JOIN statements s ON qe.statement_id = s.id
WHERE p.status = 'completed';
```

---

## 🚀 Exporting Data (Future Roadmap)

Currently, data can be exported by querying the database directly. Future updates will include:

- **CSV Export**: A direct "download results" button in the Admin UI.
- **PQMethod Export**: Pre-formatted files ready for factor analysis.
- **JSON Batch Export**: For custom analysis scripts (Python/R).

## 🔒 Data Privacy

Open-Q is designed with privacy in mind. No PII (Personally Identifiable Information) is stored unless specifically requested in the `presort_config`. Researchers are encouraged to only collect necessary data.
