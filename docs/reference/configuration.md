# Configuration Reference

Libre-Q studies are highly configurable via JSON objects stored in the `studies` table. This document details the schema for these configurations.

## `grid_config` (The Distribution)

The grid config defines the shape of the Q-sort table. It is an array of objects representing columns.

```json
[
  { "score": -4, "capacity": 2 },
  { "score": -3, "capacity": 3 },
  { "score": -2, "capacity": 4 },
  { "score": -1, "capacity": 5 },
  { "score": 0, "capacity": 6 },
  { "score": 1, "capacity": 5 },
  { "score": 2, "capacity": 4 },
  { "score": 3, "capacity": 3 },
  { "score": 4, "capacity": 2 }
]
```

- **score**: The numerical value assigned to cards in this column (e.g., -4 for Most Disagree, +4 for Most Agree).
- **capacity**: How many cards can fit into this column.

> [!IMPORTANT]
> The sum of all `capacity` values **MUST** equal the total number of statements in the study.

---

## `presort_config` (Demographics)

Defines the fields presented to participants before the sorting begins. Supports `text`, `textarea`, `number`, `select`, `radio`, `checkbox`, `date`, and `email` types.

```json
{
  "age": {
    "type": "number",
    "label": { "en": "Age", "fr": "Âge" },
    "required": true,
    "min": 18
  },
  "gender": {
    "type": "select",
    "options": [
      { "value": "Male", "label": { "en": "Male", "fr": "Homme" } },
      { "value": "Female", "label": { "en": "Female", "fr": "Femme" } }
    ],
    "label": { "en": "Gender", "fr": "Genre" },
    "required": true
  }
}
```

---

## `postsort_config` (Qualitative)

Controls the behavior of the final phase of the study.

```json
{
  "extreme_columns": [-4, 4],
  "ask_missing": true,
  "ask_general_comment": true
}
```

- **extreme_columns**: An array of column scores for which the participant will be asked to provide comments.
- **ask_missing**: If true, participants are nudged to fill any empty slots (though the UI usually forces this before proceeding).
- **ask_general_comment**: If true, shows a final text area for any additional thoughts.
- **audio**: Optional audio configuration object.
  - `max_storage_mb`: Per-study storage quota for audio recordings (default: 100 MB). Uploads exceeding this quota return HTTP 507.

---

## Study Options

### `show_statement_codes`

A boolean flag to control the display of statement identifiers (e.g., "S1", "S2") on the cards.

```json
{
  "slug": "my-study",
  "show_statement_codes": true,
  ...
}
```

- **true**: Displays a subtle light-gray identifier in the top-left corner of each card and in the zoom overlays. Useful for research analysis and cross-referencing.
- **false (Default)**: Statement codes are hidden for a cleaner participant experience.

### `randomize_statement_order`

A boolean flag to control whether statements are shuffled for each participant.

```json
{
  "slug": "my-study",
  "randomize_statement_order": true,
  ...
}
```

- **true**: Statements are shuffled in a deterministic way based on the participant's session token. This prevents **order effects** (a best practice in Q-methodology).
- **false (Default)**: Statements appear in the order defined in the database.

> [!NOTE]
> Randomization is deterministic per session - if a participant refreshes the page, they will see the same order.

### `symmetry_lock`

A boolean flag to enforce grid symmetry in the study designer.

- **true (Default)**: The designer enforces symmetrical column capacities (e.g., if -3 has capacity 2, then +3 must also have capacity 2).
- **false**: Allows asymmetrical grid designs.

### `default_language`

The fallback language code (ISO 639-1) used when a participant's preferred language is not available.

```json
{
  "slug": "my-study",
  "default_language": "en",
  ...
}
```

The language resolution hierarchy is:

1. Use the participant's requested language if a translation exists.
2. Fall back to the study's `default_language`.
3. Fall back to the first available translation.

### `access_password`

A hashed password to restrict access to the study configuration.

```json
{
  "slug": "my-study",
  "access_password": "hashed_password_here",
  ...
}
```

- **Set**: Participants must enter the correct password before they can view the study content (Consent, Statements, Grid).
- **Null (Default)**: Study is publicly accessible via its link.

> [!TIP]
> Use this feature for sensitive or pre-publication research where you want to control who can access the study.

---

## `StudyTranslation`

Content that varies by language is stored in the `study_translations` table:

| Field                      | Type            | Description                                              |
| :------------------------- | :-------------- | :------------------------------------------------------- |
| `language_code`            | `string`        | ISO 639-1 code (e.g., `"en"`, `"fr"`)                   |
| `title`                    | `string`        | Study title                                              |
| `subtitle`                 | `string | null` | Brief tagline on welcome page                            |
| `description`              | `string`        | Short summary                                            |
| `objective`                | `string | null` | Research objective shown to participants                  |
| `condition_of_instruction` | `string | null` | The core sorting prompt/frame                            |
| `pre_instruction`          | `string | null` | Instruction for the initial rough sort phase             |
| `instructions`             | `string | null` | Detailed Markdown content for the welcome page           |
| `consent_title`            | `string | null` | Title for the consent step                               |
| `consent_description`      | `string | null` | Full text of the consent form                            |
| `ui_labels`                | `json`          | Override default button text (e.g., `{"start_button": "Go!"}`) |
| `process_steps`            | `json`          | Custom step definitions for the progress indicator       |
| `methodology_tips`         | `json`          | Methodology tips shown during sorting                    |
| `step_help`                | `json`          | Per-step help content for the help overlay               |
