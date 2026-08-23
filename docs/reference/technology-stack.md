# Technology stack reference

## Frontend

| Technology | Responsibility |
| ---------- | -------------- |
| React 19 and Vite | Application UI and development/build tooling |
| TypeScript | Static typing |
| TanStack Query | Server-state fetching and caching |
| Orval | OpenAPI-generated API client |
| Zustand | Client-owned application state |
| Tailwind CSS | Utility-based styling and design tokens |
| dnd-kit | Drag-and-drop interactions |
| Framer Motion | Motion and transitions |
| react-i18next | Interface localization |

## Backend and storage

| Technology | Responsibility |
| ---------- | -------------- |
| FastAPI | HTTP API and OpenAPI contract |
| SQLAlchemy | Asynchronous persistence mapping |
| Pydantic | Input and output validation |
| PostgreSQL | Primary persistent database |
| S3-compatible storage | Optional audio objects |
| Redis | Optional shared rate-limit counters |

## Responsive-interface mechanisms

- `ViewportProvider` exposes shared viewport categories without scattered width checks.
- Fluid typography uses CSS `clamp()` through the Tailwind configuration.
- Container queries let sorting cards respond to their available container rather than
  only to the viewport.

For component and hook locations, see the [Frontend Components reference](components.md).
For the reasons behind the state and system boundaries, see the
[Architecture explanation](../explanation/architecture.md).
