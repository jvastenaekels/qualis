# Testing Guide

Open-Q uses a comprehensive testing strategy covering unit tests, integration tests, and end-to-end tests.

---

## Test Stack

| Layer           | Tool                     | Purpose                    |
| --------------- | ------------------------ | -------------------------- |
| **Unit**        | Vitest                   | Component and hook testing |
| **Integration** | Vitest + Testing Library | Page-level testing         |
| **E2E**         | Playwright               | Full browser automation    |
| **Backend**     | pytest                   | API and database testing   |

---

## Frontend Tests

### Running Tests

```bash
cd frontend

# Run all unit/integration tests
npm test

# Run in watch mode
npm run test -- --watch

# Run with coverage
npm run test -- --coverage
```

### Test Structure

```
frontend/src/
├── pages/
│   ├── WelcomePage.test.tsx
│   ├── PreSortPage.test.tsx
│   ├── RoughSortPage.test.tsx
│   ├── FineSortPage.test.tsx
│   └── PostSortPage.test.tsx
├── components/
│   ├── GridSort.test.tsx
│   ├── GridSort.tips.test.tsx
│   ├── SortableCard.test.tsx
│   └── CardPile.test.tsx
├── hooks/
│   └── useStudyConfig.test.tsx
└── store/
    └── useStudyStore.test.ts
```

### Writing Tests

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useConfigStore } from "../store/useConfigStore";

describe("MyComponent", () => {
  beforeEach(() => {
    // Reset stores before each test
    useConfigStore.getState().reset();
  });

  it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("Expected Text")).toBeInTheDocument();
  });
});
```

---

## E2E Tests (Playwright)

### Running E2E Tests

```bash
cd frontend

# Run all E2E tests (headless)
npm run e2e

# Run with browser visible
npm run e2e:headed

# Run in debug mode
npm run e2e:debug

# Open HTML report
npm run e2e:report
```

### Browser Coverage

| Browser       | Device           |
| ------------- | ---------------- |
| Chromium      | Desktop          |
| Firefox       | Desktop          |
| WebKit        | Desktop (Safari) |
| Mobile Chrome | Pixel 5          |
| Mobile Safari | iPhone 13        |

### E2E Test Structure

```
frontend/e2e/
├── basic-flow.spec.ts       # Full study flow
├── visual-regression.spec.ts # Screenshot comparisons
└── fixtures/
    └── study-config.ts      # Shared mock data
```

### Writing E2E Tests

```typescript
import { test, expect } from "@playwright/test";
import { mockStudyAPI } from "./fixtures/study-config";

test.describe("Study Flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockStudyAPI(page);
  });

  test("should complete study", async ({ page }) => {
    await page.goto("/study/test/welcome");
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/presort/);
  });
});
```

---

## Backend Tests (pytest)

### Running Tests

```bash
cd backend
pytest

# With coverage
pytest --cov=app

# Verbose output
pytest -v
```

### Test Structure

```
backend/
├── tests/
│   ├── test_api.py        # API endpoint tests
│   ├── test_models.py     # Database model tests
│   └── conftest.py        # Fixtures
```

---

## CI/CD Integration

Open-Q uses **GitHub Actions** to ensure code quality through automated testing.

### E2E Workflow (`.github/workflows/e2e.yml`)

To optimize resource usage, Playwright E2E tests are configured with the following rules:

- **Triggers**:
  - Automatically runs on **Pull Requests** targeting `main` or `develop`.
  - Only triggers if files in the `frontend/` directory or the workflow itself are modified.
  - Can be triggered **manually** via the "Actions" tab in GitHub.
- **Concurrency**:
  - If a new commit is pushed to an active Pull Request, any previous pending or running test for that PR is **automatically cancelled** to save CI minutes.

### Deployment Integration

Upon successful deployment to **Scalingo**, a `postdeploy` hook automatically:

1.  Verifies and updates the database schema (`ensure_schema.py`).
2.  Synchronizes study data from JSON configurations (`update_study.py`).

Verification of these steps can be found in the Scalingo deployment logs.

---

## Best Practices

1.  **Avoid `any`**: Use proper types for mocks. If necessary, use `unknown as any` for store implementation details inside utilities, but keep test files type-safe.
2.  **Isolate State Interaction**: Components should subscribe to specific store slices to minimize re-renders and make testing store interactions easier.
3.  **Verify DOM Existence over Class Names**: Assert that elements are in the document and have correct content rather than checking specific CSS classes whenever possible.
4.  **Mock Heavily-Animated Elements**: Use the provided `framer-motion` mock in utilities to avoid timing issues with `AnimatePresence`.
5.  **Use `vi.useFakeTimers()`**: For time-dependent logic (e.g., auto-rotating tips or fading backgrounds).

---

## Integration Patterns

Always use the provided utilities in `frontend/src/test/test-utils.tsx` to ensure consistency:

```tsx
import {
  renderWithProviders,
  setupStoreMocks,
  screen,
} from "../test/test-utils";

it("demonstrates the pattern", () => {
  // 1. Define the state for the specific test scenario
  setupStoreMocks({
    useConfigStore: { config: mockConfig },
    useResponseStore: { rough: { history: [1] } },
  });

  // 2. Wrap the component with necessary providers (Router, Store, etc.)
  renderWithProviders(<MyComponent />);

  // 3. Perform assertions
  expect(screen.getByText("Expected Text")).toBeInTheDocument();
});
```

### Error Scenarios

Mock the store to return error states (e.g., `configError: 'common.errors.not_found'`) and assert that the correct Error Component (e.g., `<StudyNotFound />`) is rendered.
