# Coding Guidelines & CI Stability

To ensure our CI pipeline remains green and our codebase healthy, please adhere to the following guidelines.

## 1. Linting & Type Safety
The CI pipeline (`make ci`) enforces strict type safety and formatting.
- **No `any`**: Avoid using `any`. Use `unknown` or specific types. If you must mock a complex object in tests, use `unknown` and cast to the specific interface if needed, or use `Object.assign`.
- **No Non-Null Assertions**: Do not use `!` (e.g., `document.getElementById('root')!`). Always handle potential null values gracefully.
- **Formatting**: Run `npm run lint:fix` (frontend) or `ruff format` (backend) before committing to fix formatting issues automatically.

## 2. Testing Best Practices
- **Mocking Stores**: When using `setupStoreMocks` or manual usage of `use*Store.getState()`, ensure your mock includes all methods required by the component under test.
  - *Example*: If a component uses `categorizeCard`, your mock for `useResponseStore` must include `categorizeCard: vi.fn()`.
- **Global Mocks**: Be careful when mocking globals like `ResizeObserver` or `window`. Ensure they are reset or do not pollute other tests.
- **Async & State**: When testing async updates (like valid form enabling a button), use `waitFor` to avoid flakiness.

## 3. Internationalization (i18n)
- **Sync**: Ensure all languages are in sync. Run `npm run i18n-check` to verify that `fr.json`, `fi.json`, etc., match `en.json` keys.
- **Keys**: Do not leave empty keys or unused keys.

## 4. Pre-Push Checklist
Before pushing any code, you **MUST** run:
```bash
make ci
```
If this fails, **do not push**. Fix the errors first. Bypassing this will lead to failed remote CI runs.

## 5. Post-Push Monitoring
After pushing, immediately monitor the remote CI:
```bash
gh run watch
```
If the run fails, investigate immediately and push a fix.
