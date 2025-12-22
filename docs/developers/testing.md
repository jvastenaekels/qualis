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

E2E tests run automatically on every push via GitHub Actions:

```yaml
# .github/workflows/e2e.yml
- name: Run E2E tests
  run: cd frontend && npm run e2e
```

View test reports in the Actions artifacts after each run.
