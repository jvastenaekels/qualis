# Qualis Documentation

Documentation is organized using the [Diataxis framework](https://diataxis.fr/) into four quadrants.

---

## Tutorials (Learning-oriented)

Step-by-step lessons that guide you through using Qualis for the first time.

| Tutorial | Description |
|----------|-------------|
| [Your First Study](tutorials/your-first-study.md) | Create a project, design a Q-methodology study, and publish it |
| [Collecting Responses](tutorials/collecting-responses.md) | Set up recruitment links, share with participants, monitor responses |
| [Analyzing Results — Foundations](tutorials/analyzing-results-foundations.md) | Run a factor analysis with classical defaults; understand loadings, arrays, statements, characteristics; export |
| [Analyzing Results — Refinement](tutorials/analyzing-results-refinement.md) | Choose the factor count deliberately, validate stability with Compare/Tucker φ, build a narrative with the factor canvas, trace decisions with memos |
| [Development Workflow](contributing/development.md) | Clone, install, run locally, daily Make targets, releases |

---

## How-to Guides (Task-oriented)

Practical guides for accomplishing specific goals.

### For Researchers

| Guide | Description |
|-------|-------------|
| [Conducting Studies](guides/conducting-studies.md) | Researcher handbook for the Q-methodology workflow |
| [Admin and Team Management](guides/admin-management.md) | Managing accounts, teams, roles, and study lifecycle |
| [Data Export](guides/data-export.md) | Export formats, interactive inspection, and data privacy |

### For Operators

| Guide | Description |
|-------|-------------|
| [Deployment](guides/deployment.md) | Deploy to Scalingo, Render, or Docker |
| [S3 Setup](guides/s3-setup.md) | Configure S3-compatible storage for audio recordings |
| [Running without S3](guides/running-without-s3.md) | What still works with no object storage, and what degrades |
| [Running without SMTP](guides/running-without-smtp.md) | What still works with no mail server, and what degrades |

### For Contributors

| Guide | Description |
|-------|-------------|
| [Development Setup](contributing/development.md) | Clone, install, run locally, and daily workflow tools |
| [Testing](contributing/testing.md) | Test stack, writing tests, CI pipeline |
| [Style Guide](contributing/style-guide.md) | Documentation style conventions |

---

## Reference (Information-oriented)

Dry, accurate technical descriptions of the system.

| Reference | Description |
|-----------|-------------|
| [API Reference](reference/api.md) | All endpoints with methods, auth requirements, and rate limits |
| [Configuration Options](reference/configuration.md) | Study fields and application environment variables |
| [Admin Dashboard](reference/admin-dashboard.md) | Page-by-page catalog of the admin UI |
| [Frontend Components](reference/components.md) | Sorting primitives + component index |
| [Study Configuration Format](reference/study-configuration-format.md) | JSON import/export format specification |
| [GDPR Memo for Self-Hosters](reference/gdpr-self-hosters.md) | Controls the software provides, for the operator's own DPIA and DPA |

---

## Explanation (Understanding-oriented)

Background knowledge and architectural context.

| Explanation | Description |
|-------------|-------------|
| [Architecture Overview](explanation/architecture.md) | System design, state management, database schema, RBAC, data lifecycle |
| [Q-Methodology](explanation/q-methodology.md) | Theory and concepts for researchers |
| [Mobile UX Decisions](explanation/design-decisions/mobile-ux.md) | Mobile UI strategy and design rationale |

---

## Contributing

| Document | Description |
|----------|-------------|
| [Coding Standards](contributing/coding-standards.md) | Agent-First philosophy and development rules |
| [Backend Guidelines](contributing/backend-guidelines.md) | FastAPI architecture, three-tier pattern, testing |
| [Frontend Guidelines](contributing/frontend-guidelines.md) | React 19, Tailwind, performance, memoization |
| [AI Agent Instructions](contributing/agent-instructions.md) | Detailed context for AI coding assistants |
| [Prompting Strategy](contributing/prompting-strategy.md) | Templates for agent-assisted development |
