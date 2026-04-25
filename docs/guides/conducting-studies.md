# Researcher Handbook

This guide is intended for researchers who want to use Qualis to conduct Q-methodology studies.

## The Q-Methodology Workflow

Qualis streamlines the traditional Q-sort process into a modern, digital experience:

1. **Preparation**: Define your set of statements (the Q-set) and the shape of your grid (the distribution).
2. **Onboarding**: Participants read your instructions and provide informed consent.
3. **Phase 1: Pre-sort (Context)**: Collect demographic or contextual data.
4. **Phase 2: Rough Sort**: Participants categorize statements into "Agree", "Neutral", and "Disagree" piles.
5. **Phase 3: Fine Sort (The Grid)**: Participants place statements into a forced distribution grid.
6. **Phase 4: Post-sort (Reflections)**: Participants provide qualitative feedback on their placements.

### Recruitment Analytics

Track your participant conversion funnel in real-time on the **Recruitment** page:

- **Started**: Participants who accessed your study via a recruitment link.
- **Submitted**: Participants who fully completed the sorting session.
- **Success Rate**: The percentage of starts that resulted in a submission.

> [!TIP]
> Use the **Recruitment Funnel** chart to identify exactly where participants are dropping off (e.g., after the welcome page vs. during the fine sort).

### Data Analysis and Quality Control

Access the **Data** and **Analysis** pages for deeper insights:

1. **Data page**: View participant timelines, device breakdowns, and individual session details. Flag or discard suspicious responses (e.g., participants who completed in under 2 minutes).
2. **Analysis page**: Run built-in factor analysis (PCA or centroid extraction with varimax rotation). Examine factor loadings, factor arrays, distinguishing/consensus statements, and scree plots.
3. **Exports**: Download data in CSV, PQMethod, R-Kit, KenQ JSON, or full research package formats.
4. **Visual Audit**: Reconstruct individual Q-sorts visually to look for patterns or anomalies before exporting for factor analysis.

### Study Access Security

You can control access to your study through recruitment links:

1. **Public Links**: Anyone with the link can participate (unlimited usage).
2. **Individual Links**: Single-use tokens for controlled panel recruitment.
3. **Limited Links**: Capped usage (e.g., 50 participants per link).

### Test Runs

Before going live, use the **Test Run** feature to walk through the participant experience yourself. Test runs are automatically flagged with `is_test_run` and excluded from exports and analysis by default. You can clear test data from the Data page.

### Tips for a Great Q-Sort

- **Statement Clarity**: Keep statements concise and balanced.
- **Instructional Design**: Use the Condition of Instruction field to explain the specific context of your study. Markdown formatting is supported.
- **Grid Balance**: Ensure the number of slots in your grid matches the total number of statements in your Q-set. The designer validates this automatically.

## Collecting Data

Once your study is "active", every completed sort by a participant is stored as a unique session.

- Participants receive a **Confirmation Code** at the end of the study.
- All data is anonymized by default.

For details on how to retrieve this data, see the [Data Export Guide](data-export.md).