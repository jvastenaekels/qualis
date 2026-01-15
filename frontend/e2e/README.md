# E2E Testing with Real Backend

This directory contains E2E tests that run against a **real backend** and **real database**, not mocks.

## Quick Start

```bash
# Run all E2E tests with real backend
npx playwright test

# Run only configuration tests
npx playwright test --project="Admin Config Tests"

# Run specific test file
npx playwright test e2e/admin/configuration/presort-fields.spec.ts
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Playwright Test Runner                         │
├─────────────────────────────────────────────────┤
│  Frontend (localhost:5173) ◄─► Backend (8000)  │
│                                 │               │
│                    PostgreSQL Test DB           │
└─────────────────────────────────────────────────┘
```

## Isolation Strategy

Tests use an **"Add-Only"** strategy to support full parallelism:

- Each test creates a **unique user** and **unique workspace** (e.g., `workspace-1736...`).
- Tests **do not clean up** after themselves to prevent race conditions (one test deleting data needed by another).
- Global cleanup is handled by creating fresh databases in CI or manual scripts locally.

**Implication for Tests:**

- **Never hardcode slugs** (like `'test-workspace'`). Use `testDb.getWorkspaceSlug()`.
- **Never hardcode user emails**. Use `testDb.getUserEmail()`.

## Test Fixtures

### `testDb` - Database Manager

Automatic setup (unique seeding) for each test:

```typescript
test("my test", async ({ testDb, authToken }) => {
  // testDb is ready with UNIQUE base data (user, workspace)
  const workspaceSlug = testDb.getWorkspaceSlug();

  const study = await testDb.createStudy(
    authToken,
    testDataBuilders.study({ statements: testDataBuilders.statements(10) }),
  );

  // cleanup() is disabled to allow parallel execution
});
```

### `loginToAdminUI` - Fast Authentication

Use the helper to bypass flaky/slow login forms:

```typescript
test.beforeEach(async ({ page, testDb }) => {
  // Injects auth token directly into localStorage
  await testDb.loginToAdminUI(page);
});
```

### `authToken` - Authenticated Session

Pre-authenticated token for API calls (automatically logged in as the unique test user):

```typescript
test("API test", async ({ testDb, authToken }) => {
  const slug = testDb.getWorkspaceSlug();
  const study = await testDb.getStudy(authToken, `${slug}/my-study`);
});
```

## Test Data Builders

Factory functions for creating test data:

```typescript
import { testDataBuilders } from "../fixtures/test-data";

// Create a complete study
const study = testDataBuilders.study({
  slug: "my-test",
  statements: testDataBuilders.statements(25),
  presort_config: testDataBuilders.presortConfig({
    email: testDataBuilders.presortField("email", "Your Email", {
      required: true,
    }),
  }),
});

// Create specific configurations
const gridConfig = testDataBuilders.gridConfig("symmetric");
const branding = testDataBuilders.branding({ accent_color: "#ff0000" });
```

## Systematic Testing Pattern

For configuration options, use the systematic 5-test pattern:

```typescript
test.describe("Feature X Configuration", () => {
  test("Admin: Can configure in UI"); // UI interaction
  test("API: Configuration saves correctly"); // API persistence
  test("Participant: Renders correctly"); // Participant UI
  test("Validation: Rules enforced"); // Validation logic
  test("Edge Case: Handles limits"); // Edge cases
});
```

## Available Test Projects

- **Admin E2E** - General admin flow tests
- **Admin Config Tests** - Systematic configuration testing
- **Integration Tests** - Admin → Participant consistency
- **Study E2E** - Participant flow tests
- **Study Mobile Chrome** - Mobile participant tests

## Backend Test Endpoints

The backend provides test-only endpoints (only available in test/dev):

- `POST /api/test/init` - Initialize test database
- `POST /api/test/seed` - Seed base data (user, workspace)
- `POST /api/test/cleanup` - Cleanup between tests
- `POST /api/test/cleanup-all` - Full cleanup
- `GET /api/test/health` - Test router health check

## Environment Variables

```env
# Required
API_BASE_URL=http://localhost:8000
ENVIRONMENT=test

# Database (test instance)
DATABASE_URL=postgresql://test_user:test_pass@localhost:5432/openq_test
```

## Writing New Tests

1. **Create test file** in appropriate directory
2. **Import fixtures**:

   ```typescript
   import { test, expect } from "../fixtures/db-setup";
   import { testDataBuilders } from "../fixtures/test-data";
   ```

3. **Write systematic tests**:

   ```typescript
   test.describe("New Feature", () => {
     test.beforeEach(async ({ testDb, authToken }) => {
       // Setup
     });

     test("Admin: Configure feature", async ({ page }) => {
       // Test admin UI
     });

     test("API: Saves correctly", async ({ testDb, authToken }) => {
       // Test API
     });

     test("Participant: Works correctly", async ({
       page,
       testDb,
       authToken,
     }) => {
       // Test participant experience
     });
   });
   ```

## Best Practices

1. **Use testDb fixture** - Automatic cleanup
2. **Use test data builders** - Consistent, maintainable test data
3. **Test systematically** - Cover all 5 dimensions
4. **Keep tests isolated** - Each test should be independent
5. **Use real data flow** - Test the full stack

## Debugging

```bash
# Run with headed browser
npx playwright test --headed

# Run with debug mode
npx playwright test --debug

# View HTML report
npx playwright show-report
```

## CI/CD

The tests run automatically in CI with:

- Dedicated PostgreSQL test database
- Backend and frontend servers
- Automatic cleanup after suite

## Migration from Mock Tests

Converting existing mock-based tests:

1. Replace `setupAdminMocks()` with `testDb` fixture
2. Replace manual data creation with `testDataBuilders`
3. Remove `vi.mock()` calls
4. Use real API calls via `testDb` methods
5. Add systematic coverage (5 tests per feature)

## Examples

See `/e2e/admin/configuration/presort-fields.spec.ts` for a complete example of systematic configuration testing.
