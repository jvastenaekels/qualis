# Study Configuration Format (JSON)

This document describes the JSON format used for exporting and importing Open-Q study configurations.

## Overview

The configuration file is a JSON object containing the complete design definition of a study, including settings, grid configuration, statements, and translations. It does **not** contain participant data or results.

**Filename Convention:** `{slug}_config_{YYYYMMDD}.json`

## Schema Structure

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
    "grid_config": [
      { "score": -2, "capacity": 2 },
      { "score": -1, "capacity": 3 },
      { "score": 0, "capacity": 4 },
      { "score": 1, "capacity": 3 },
      { "score": 2, "capacity": 2 }
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
        "description": "Study description displayed on welcome page.",
        "instructions": "Detailed instructions...",
        "condition_of_instruction": "Sort these cards...",
        "consent_title": "Informed Consent",
        "consent_description": "Legal text...",
        "ui_labels": {},
        "process_steps": [],
        "methodology_tips": [],
        "step_help": {}
      }
    ],
    "branding": {
      "primary_color": "#4F46E5",
      "logo_url": "https://example.com/logo.png"
    },
    "presort_config": {
      "enabled": true,
      "questions": []
    },
    "postsort_config": {
      "enabled": true,
      "questions": []
    }
  }
}
```

## Field Reference

### Root Object

| Field         | Type   | Description                                 |
| :------------ | :----- | :------------------------------------------ |
| `version`     | string | Schema version (currently "1.0").           |
| `exported_at` | string | ISO 8601 timestamp of export.               |
| `exported_by` | string | Email of the user who performed the export. |
| `study`       | object | The main study configuration object.        |

### Study Object

| Field                       | Type    | Description                                                                  |
| :-------------------------- | :------ | :--------------------------------------------------------------------------- |
| `slug`                      | string  | **Required**. Unique identifier (used as default, can be changed on import). |
| `default_language`          | string  | **Required**. ISO 639-1 code (e.g., "en").                                   |
| `show_statement_codes`      | boolean | If true, identifiers (S1, S2) are shown to participants.                     |
| `randomize_statement_order` | boolean | If true, statement order is randomized for each participant.                 |
| `symmetry_lock`             | boolean | If true, prevents modifying the grid to be asymmetrical.                     |
| `grid_config`               | array   | List of column definitions.                                                  |
| `statements`                | array   | List of statement objects.                                                   |
| `translations`              | array   | List of study-level translation objects.                                     |
| `branding`                  | object  | Branding settings (colors, logo).                                            |
| `presort_config`            | object  | Configuration for demographic questions.                                     |
| `postsort_config`           | object  | Configuration for follow-up questions.                                       |

### Grid Configuration Object

Each item in `grid_config` represents a column in the Q-sort grid.

| Field      | Type    | Description                                                    |
| :--------- | :------ | :------------------------------------------------------------- |
| `score`    | integer | The numeric value associated with the column (e.g., -2, 0, 2). |
| `capacity` | integer | The maximum number of cards that fit in this column.           |

### Statement Object

| Field          | Type   | Description                                       |
| :------------- | :----- | :------------------------------------------------ |
| `code`         | string | Unique identifier for the statement (e.g., "S1"). |
| `translations` | array  | List of objects with `language_code` and `text`.  |

### Translation Object

Defines the localizable content for the study interface (per language).

| Field                      | Type   | Description                                              |
| :------------------------- | :----- | :------------------------------------------------------- |
| `language_code`            | string | ISO 639-1 code (e.g., "en", "fr").                       |
| `title`                    | string | Study title.                                             |
| `description`              | string | Welcome page description.                                |
| `instructions`             | string | General instructions.                                    |
| `condition_of_instruction` | string | The core sorting prompt.                                 |
| `pre_instruction`          | string | Instruction for the initial rough sort (pre-sort) phase. |
| `consent_title`            | string | Title for consent step.                                  |
| `consent_description`      | string | Full text of consent form.                               |
| `process_steps`            | array  | Custom step definitions (optional).                      |

## Validation Rules

When importing a configuration file, the system enforces the following rules:

1.  **Format**: File must be valid JSON.
2.  **Required Fields**: `slug`, `default_language`, `statements`, and `grid_config` must be present.
3.  **Statement Balance**: The total number of `statements` must exactly match the total capacity of the `grid_config`.
4.  **Languages**: All `language_code` values must be valid 2-letter ISO codes.
5.  **Translations**: Each enabled language must have a corresponding translation object.
