# Study Configuration Format (JSON)

The JSON format used for exporting and importing Qualis study configurations.

## Overview

A configuration file is a JSON object containing the complete design definition of a study (settings, grid, statements, translations, branding, presort/postsort). It does **not** contain participant data or results.

**Filename convention:** `{slug}_config_{YYYYMMDD}.json`

For runtime configuration of a study (the same fields as they appear in the database), see [`configuration.md`](configuration.md). The two reference docs share their underlying schemas; this one documents the export/import wrapper.

## Schema structure

```json
{
  "version": "1.0",
  "exported_at": "2024-03-20T10:00:00+00:00",
  "exported_by": "user@example.com",
  "study": {
    "slug": "my-study-slug",
    "default_language": "en",
    "show_statement_codes": true,
    "randomize_statement_order": true,
    "symmetry_lock": true,
    "rough_sort_enabled": true,
    "distribution_mode": "forced",
    "access_password": null,
    "grid_config": [
      { "score": -2, "capacity": 2 },
      { "score": -1, "capacity": 3 },
      { "score":  0, "capacity": 4 },
      { "score":  1, "capacity": 3 },
      { "score":  2, "capacity": 2 }
    ],
    "statements": [
      {
        "code": "S1",
        "translations": [
          { "language_code": "en", "text": "Statement text in English" },
          { "language_code": "fr", "text": "Texte de l'énoncé en Français" }
        ]
      }
    ],
    "translations": [
      {
        "language_code": "en",
        "title": "Study Title",
        "subtitle": "Tagline shown on the welcome page",
        "description": "Welcome page description",
        "objective": "Research objective",
        "instructions": "Detailed instructions...",
        "condition_of_instruction": "Sort these cards...",
        "pre_instruction": "Quick triage instructions",
        "consent_title": "Informed Consent",
        "consent_description": "Legal text...",
        "ui_labels": {},
        "process_steps": [],
        "methodology_tips": [],
        "step_help": {}
      }
    ],
    "branding": {
      "accent_color": "#4F46E5",
      "primary_color": "#0EA5E9",
      "logo_url": "https://example.com/logo.png",
      "partners": []
    },
    "presort_config": {
      "enabled": true,
      "fields": {}
    },
    "postsort_config": {
      "enabled": true,
      "questions": [],
      "extreme_columns": [-2, 2],
      "ask_missing": true,
      "ask_general_comment": true,
      "audio": { "max_storage_mb": 100 }
    }
  }
}
```

## Field reference

### Root object

| Field | Type | Description |
| ----- | ---- | ----------- |
| `version` | string | Schema version (currently `"1.0"`). |
| `exported_at` | string | ISO 8601 timestamp of export. |
| `exported_by` | string | Email of the user who performed the export. |
| `study` | object | Study configuration. |

### Study object

| Field | Type | Description |
| ----- | ---- | ----------- |
| `slug` | string | On export, the study's slug is written here. On import this value is ignored: the caller must supply a brand-new `new_slug` (3-100 chars, lowercase letters/digits/hyphens) as a separate request field, and a collision with an existing slug is rejected with HTTP 400 — slugs are never auto-remapped. |
| `default_language` | string | ISO 639-1 fallback language code. |
| `show_statement_codes` | boolean | If true, statement codes (`S1`, `S2`) are visible to participants. Default `false`. |
| `randomize_statement_order` | boolean | If true, statement display order is shuffled deterministically per session. Default `false`. |
| `symmetry_lock` | boolean | If true, the designer enforces symmetric column capacities. Default `true`. |
| `rough_sort_enabled` | boolean | If true (default), participants go through a 3-pile triage before the fine-sort grid. See [`configuration.md`](configuration.md#rough_sort_enabled). |
| `distribution_mode` | string | One of `"forced"` (default), `"free"`, `"flexible"`. Controls how strictly per-column capacities are enforced at activation and submission. See [`configuration.md`](configuration.md#distribution_mode). |
| `access_password` | string \| null | Bcrypt-hashed password gating access. `null` = publicly accessible. |
| `grid_config` | array | Pyramid columns. See below. |
| `statements` | array | Statement objects. |
| `translations` | array | Per-language study content. |
| `branding` | object \| null | Branding (colors, logos). |
| `presort_config` | object | Demographic / pre-sort survey definition. Field definitions live in `fields`, a keyed object (record) — not an array — optionally wrapped with an `enabled` boolean. See [`configuration.md`](configuration.md). |
| `postsort_config` | object | Post-sort survey + audio quota. Field definitions live in `questions`, a keyed object (record). See [`configuration.md`](configuration.md). |

### Grid configuration object

Each item in `grid_config` represents a column.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `score` | integer | Column value (e.g. `-3`, `0`, `+3`). |
| `capacity` | integer | Number of cards that fit in the column. |

The relationship between `sum(capacity)` and the statement count depends on `distribution_mode`:

- `"forced"` and `"flexible"`: `sum(capacity) == len(statements)`.
- `"free"`: `sum(capacity) >= len(statements)`.

### Statement object

| Field | Type | Description |
| ----- | ---- | ----------- |
| `code` | string | Stable statement identifier (e.g. `"S1"`). |
| `translations` | array | One entry per language: `{ "language_code", "text" }`. |

Statement order is conveyed by array position — statements are exported sorted by their stored `display_order` and re-indexed (`0, 1, 2, …`) on import. `display_order` is not a field of this JSON format.

### Translation object

| Field | Type | Description |
| ----- | ---- | ----------- |
| `language_code` | string | ISO 639-1 (`"en"`, `"fr"`, …). |
| `title` | string | Study title. |
| `subtitle` | string \| null | Tagline shown on the welcome page. |
| `description` | string | Welcome page description. |
| `objective` | string \| null | Research objective shown to participants. |
| `condition_of_instruction` | string | Core sorting prompt. |
| `pre_instruction` | string \| null | Instructions for the rough-sort triage phase. |
| `instructions` | string \| null | Markdown content shown on the welcome page. |
| `consent_title` | string \| null | Title for the consent step. |
| `consent_description` | string \| null | Full text of the consent form. |
| `ui_labels` | object | Overrides for default button text, keyed by dotted i18n keys — `welcome.start`, `common.next`, `post.submit`, `fine.actions.validate`, … — not ad-hoc names like `start_button`. E.g. `{"welcome.start": "Go!"}`. |
| `process_steps` | array | Custom step definitions for the progress indicator. |
| `methodology_tips` | array | Tip strings shown contextually during sorting. |
| `step_help` | object | Per-step help content for the help overlay. |

### Branding object

| Field | Type | Description |
| ----- | ---- | ----------- |
| `accent_color` | string \| null | CSS colour for accents (buttons, links). Max 50 chars. |
| `primary_color` | string \| null | CSS colour for primary surfaces. Max 50 chars. |
| `logo_url` | string \| null | URL for the study logo shown on the welcome page. |
| `partners` | array | Array of `{ id, name, logo_url, url? }` objects for partner logos displayed on the welcome page. |

The branding object is stored as a JSON blob on the study record; unknown keys are preserved on round-trip but ignored by the UI.

## Validation rules

When importing, the following rules are enforced:

1. **Format** — file must be valid JSON.
2. **Required fields** — `translations`, `statements`, `grid_config`. (`slug` is not read from the file — the new slug is supplied separately via `new_slug`; `default_language` defaults to `"en"` if absent.)
3. **Statement balance** — a mismatch between `sum(grid_config[i].capacity)` and the statement count produces a non-blocking warning during validate-import; it does not block import.
4. **Language codes** — every `language_code` must be a 2-letter ISO 639-1 code.
5. **Translation fields** — each entry in `translations` must have a non-empty `language_code` and `title`, and each `language_code` must match `^[a-z]{2}(-[A-Z]{2})?$`.
