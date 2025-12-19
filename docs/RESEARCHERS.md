# Researcher Handbook

This guide is intended for researchers who want to use Open-Q to conduct Q-methodology studies.

## 📋 The Q-Methodology Workflow

Open-Q streamlines the traditional Q-sort process into a modern, digital experience:

1.  **Preparation**: Define your set of statements (the Q-set) and the shape of your grid (the distribution).
2.  **Onboarding**: Participants read your instructions and provide informed consent.
3.  **Phase 1: Pre-sort (Context)**: Collect demographic or contextual data.
4.  **Phase 2: Rough Sort**: Participants categorize statements into "Agree", "Neutral", and "Disagree" piles.
5.  **Phase 3: Fine Sort (The Grid)**: Participants place statements into a forced distribution grid.
6.  **Phase 4: Post-sort (Reflections)**: Participants provide qualitative feedback on their placements.

## 🛠️ Configuring a Study

Currently, studies are configured via the database. For technical setup, refer to the [Configuration Reference](CONFIG_REFERENCE.md).

### Using `seed.py` as a Template

For now, the easiest way to create or modify a study is by editing `backend/seed.py`. This script serves as a living example of how to:

- Define study titles and descriptions in multiple languages.
- Set up the grid dimensions.
- Customize the pre-sort and post-sort questions.
- Add your Q-set (statements).

### Tips for a Great Q-Sort

- **Statement Clarity**: Keep statements concise and balanced.
- **Instructional Design**: Use the `instructions` field in `StudyTranslation` to explain the specific context of your study. You can use **Markdown** for formatting.
- **Grid Balance**: Ensure the number of slots in your grid matches the total number of statements in your Q-set.

## 📊 Collecting Data

Once your study is "active", every completed sort by a participant is stored as a unique session.

- Participants receive a **Confirmation Code** at the end of the study.
- All data is anonymized by default.

For details on how to retrieve this data, see the [Data Export Guide](DATA_EXPORT.md).
