# Configuration Reference

Open-Q studies are highly configurable via JSON objects stored in the `studies` table. This document details the schema for these configurations.

## 📐 `grid_config` (The Distribution)

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

## 📝 `presort_config` (Demographics)

Defines the fields presented to participants before the sorting begins. Supports `number`, `text`, and `select` types.

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

## 🧐 `postsort_config` (Qualitative)

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

---

## 🌍 `StudyTranslation`

Content that varies by language is stored in the `study_translations` table:

- **title**: Study title.
- **description**: Short summary.
- **instructions**: Detailed Markdown content for the welcome page.
- **ui_labels**: (Optional) Override default button text (e.g., `{"start_button": "Go!"}`).
