# Tutorials

Welcome to the Qualis tutorials. These step-by-step lessons will walk you through the platform from start to finish, whether you are a researcher designing your first Q-methodology study or a developer contributing to the codebase.

Each tutorial is hands-on: you will follow along and build something real as you learn.

## For Researchers

| Tutorial | Description | Time |
|----------|-------------|------|
| [Your First Study](your-first-study.md) | Create a project, design a complete Q-methodology study with statements and a forced-distribution grid, and publish it for participants. | ~30 min |
| [Collecting Responses](collecting-responses.md) | Set up recruitment links, share your study with participants, and monitor live responses from the researcher dashboard. | ~15 min |
| [Analyzing Results — Foundations](analyzing-results-foundations.md) | Run a factor analysis with classical defaults (PCA, varimax, auto-flagging), read loadings and arrays, and export for PQMethod, R, or KADE. | ~20 min |
| [Analyzing Results — Refinement](analyzing-results-refinement.md) | Choose the factor count deliberately (Explorer + preview range), validate stability (Compare / Tucker φ), build the narrative (factor canvas + voices), trace decisions (memos). | ~30 min |

## For Developers

Developer setup has moved out of the tutorials section into the contributing guide: see [`../contributing/development.md`](../contributing/development.md) for the full first-time setup, daily Make targets, API client synchronisation, and release workflow.

## Prerequisites

- **Researchers:** A modern web browser (Chrome, Firefox, Safari, or Edge). No software installation required if using a hosted instance.
- **Developers:** Git, Python 3.14, Node.js 24, and PostgreSQL 18 — the versions CI exercises. See the [Development Workflow guide](../contributing/development.md) for full setup instructions.

## How to Use These Tutorials

1. Start with **Your First Study** if you are new to Qualis.
2. Work through each tutorial in order -- each one builds on concepts from the previous.
3. Follow the steps exactly as written. The tutorials use a realistic example study about "Attitudes Toward Remote Work" so you can see how a real research project comes together.
4. If you get stuck, check the [Guides](../guides/) section for task-specific how-to instructions, or the [Reference](../reference/) section for detailed configuration options.
