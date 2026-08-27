# Qualis frontend

The frontend is the React participant experience and researcher administration
interface. The production build is served by the FastAPI application.

## Start here

- [Development workflow](../../docs/contributing/development.md) — prerequisites,
  installation, generated API synchronization, and local servers.
- [Frontend guidelines](../../docs/contributing/frontend-guidelines.md) — hooks,
  state ownership, React, Tailwind, and internationalization conventions.
- [Testing guide](../../docs/contributing/testing.md#frontend-tests) — Vitest and
  Playwright structure and commands.
- [Frontend component reference](../../docs/reference/components.md) — sorting
  primitives, shared components, and hooks.
- [Architecture explanation](../../docs/explanation/architecture.md) — frontend
  state boundaries and their rationale.

## Common commands

Run these from `frontend/`:

```bash
npm ci
npm run dev
npm test -- --run
npm run type-check
```

Participant translations live under `public/locales/`; the locale directories are
the canonical list of supported interface languages.
