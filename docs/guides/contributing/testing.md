# Testing Guide

Qualis uses a comprehensive testing strategy covering unit tests, integration tests, and end-to-end (E2E) tests. We prioritize **automation** and **reliability** to ensure the platform remains stable as it evolves.

---

## Test Stack

| Layer           | Tool                     | Purpose                                    |
| --------------- | ------------------------ | ------------------------------------------ |
| **Unit**        | Vitest                   | Component, hook, and utility logic testing |
| **Integration** | Vitest + Testing Library | Page-level and complex flow testing        |
| **E2E**         | Playwright               | Full browser automation and critical paths |
| **Backend**     | pytest                   | API endpoints, database models, and logic  |
| **Static**      | Biome / Ruff / Mypy      | Linting, formatting, and type checking     |

---

## Quick Start (Make Commands)

The easiest way to run tests is via the project's `Makefile`.

```bash
# Run backend and frontend unit/integration tests
make test

# Run full E2E suite (spins up its own environment)
make e2e

# Run Fast CI checks (Lint + Check + Test + Build) - Recommended before push
make ci

# Run Full CI checks (Fast CI + DB Reset + E2E)
make ci-full
```

---

## Frontend Tests

### Directory Structure

```
frontend/src/
├── pages/                  # Page components
│   └── __tests__/          # (Optional) specific unit tests
├── components/             # Reusable components
│   └── __tests__/          # (Optional) specific unit tests
├── integration/            # Integration tests (Page flows, complex interactions)
│   ├── StudyFlow.test.tsx
│   └── ...
├── test-utils/             # Test utilities and providers
│   ├── test-utils.tsx      # Main export
│   └── handlers.ts         # MSW Handlers
└── ...
```

### Running Frontend Tests Manually

```bash
cd frontend

# Run all tests
npm test

# Run in watch mode (interactive)
npm run test -- --watch

# Run with coverage report
npm run test -- --coverage
```

### Writing Integration Tests

Use the provided utilities in `src/test-utils/test-utils.tsx` to wrap components with necessary providers (Router, QueryClient, Store).

```tsx
import { describe, it, expect } from "vitest";
import {
  renderWithProviders,
  setupStoreMocks,
  screen,
} from "../test-utils/test-utils";
import { MyComponent } from "./MyComponent";

describe("MyComponent Integration", () => {
  it("renders with specific store state", () => {
    // 1. Setup Mock State
    setupStoreMocks({
      useConfigStore: { config: { title: "Test Study" } },
      useResponseStore: { rough: { history: [] } },
    });

    // 2. Render with Providers
    renderWithProviders(<MyComponent />);

    // 3. Assert
    expect(screen.getByText("Test Study")).toBeInTheDocument();
  });
});
```

**Best Practices:**

1. **Prefer Integration over Unit**: Test page flows and component interactions rather than implementation details.
2. **Mock specific slices**: Use `setupStoreMocks` to isolate the state you are testing.
3. **Avoid testing library internals**: Do not test that `zustand` works; test that your component reacts to state changes.

---

## E2E Tests (Playwright)

End-to-End tests run against a **real backend** and a **real database**.

### Running E2E Tests

The robust way is via `make`:

```bash
make e2e
```

Or manually (set `ENVIRONMENT=test`):

```bash
cd frontend
ENVIRONMENT=test npm run e2e
```

**Debug Mode:**

```bash
cd frontend
ENVIRONMENT=test npm run e2e:debug
```

### E2E Structure

```
frontend/e2e/
├── fixtures/
│   ├── db-setup.ts         # Database setup/teardown & Auth helpers
│   ├── test-data.ts        # Data builders (Studies, Participants)
│   └── global-setup.ts     # Global environment config
├── integration/
│   ├── admin-participant-consistency.spec.ts
│   ├── study-happy-path.spec.ts
│   └── ...
└── ...
```

### Writing E2E Tests

We use a "Test Data Builder" pattern to generate dynamic, isolated test data for each run.

```typescript
import { test, expect } from "../fixtures/db-setup";
import { testDataBuilders } from "../fixtures/test-data";

test.describe("Study Flow", () => {
    test("participant can complete a study", async ({ page, testDb, authToken }) => {
        // 1. Arrange: Create a study in the DB
        const study = await testDb.createStudy(authToken, testDataBuilders.study({
            state: 'active',
            presort_config: testDataBuilders.presortConfig({ ... })
        }));

        // 2. Act: Navigate as participant
        await page.goto(`/study/${study.slug}/welcome`);
        await page.getByTestId('start-btn').click();

        // 3. Assert
        await expect(page).toHaveURL(/consent/);
    });
});
```

---

## Backend Tests (pytest)

### Running Backend Tests

```bash
make test
# OR
cd backend && uv run pytest tests/
```

### Structure

```
backend/tests/
├── conftest.py             # Global fixtures (DB session, async client)
├── test_api_study.py       # API Endpoint tests
├── test_models.py          # SQLAlchemy Model logic
└── ...
```

**Key Concept: `conftest.py`**
The `conftest.py` file handles:

- **Database Isolation**: Uses a dedicated PostgreSQL test database and handles schema setup/teardown via Alembic or direct metadata calls.
- **Async Client**: Provides a `client` fixture for making API calls.
- **Factories**: Provides factories for creating projects, studies, and users dynamically within tests.

---

## API Consistency (`check-api`)

We use **Orval** to generate the frontend API client from the backend OpenAPI spec. To ensure they are in sync:

```bash
# Check if frontend client matches backend code
make check-api

# Regenerate frontend client (if check fails)
make generate-api
```

Runs automatically during `make ci`.

---

## CI/CD Pipeline

The project uses GitHub Actions.

| Workflow       | Trigger        | Description                                                       |
| :------------- | :------------- | :---------------------------------------------------------------- |
| **CI (Fast)**  | PRs, Push      | Runs Lint, Types, Unit/Integration Tests. Blocks merge if failed. |
| **E2E (Slow)** | PRs (Frontend) | Runs full Playwright suite.                                       |
| **Deploy**     | Push to `main` | Deploys to Scalingo.                                              |

### Deployment Verification

After deployment, Scalingo runs a `release` phase defined in the `Procfile` that:

1. Migrates the database (`python scripts/migrate.py` which calls `alembic upgrade head`).
2. Ensures basic infrastructure is initialized (`python init_db.py`).
