# Testing Strategy - Open-Q

This document outlines the testing patterns and best practices for the Open-Q frontend.

## 1. Testing Layers

### Unit Tests (`*.test.tsx`, `*.test.ts`)

- **Focus**: Isolated component logic or utility functions.
- **Pattern**:
    - Mock heavyweight dependencies (Framer Motion, complex child components).
    - Use `vi.useFakeTimers()` for time-dependant logic (e.g., auto-rotating tips).
    - Verify state transitions or DOM updates based on inputs/props.

### Integration Tests (`*.integration.test.tsx`)

- **Focus**: Page-level interactions and store integration.
- **Pattern**:
    - Use `renderWithProviders` from `src/test/test-utils.tsx` to wrap the component in necessary contexts (`MemoryRouter`, `LayoutProvider`).
    - Use `setupStoreMocks` to define the state of `useConfigStore`, `useResponseStore`, etc.
    - Verify that UI elements (like "Next" or "Validate" buttons) appear correctly based on complex store states.

### End-to-End Tests (`e2e/*.spec.ts`)

- **Focus**: High-level user flows in a real browser.
- **Pattern**:
    - Use Playwright to simulate user steps through the entire study process.
    - Keep flows simple and focused on "happy paths" for stability.
    - Mock backend responses where appropriate to ensure test repeatability.

## 2. Test Utilities (`src/test/test-utils.tsx`)

Always use the provided utilities to ensure consistency:

```tsx
import { renderWithProviders, setupStoreMocks, screen } from '../test/test-utils';

it('demonstrates the pattern', () => {
    setupStoreMocks({
        useConfigStore: { config: mockConfig },
        useResponseStore: { rough: { history: [1] } },
    });

    renderWithProviders(<MyComponent />);

    expect(screen.getByText('Expected Text')).toBeInTheDocument();
});
```

## 3. Best Practices

1. **Avoid `any`**: Use proper types for mocks. If necessary, use `unknown as any` for store implementation details inside utilities, but keep test files type-safe.
2. **Isolate State Interaction**: Components should subscribe to specific store slices to minimize re-renders and make testing store interactions easier.
3. **Verify DOM Existence over Class Names**: Assert that elements are in the document and have correct content rather than checking specific CSS classes whenever possible.
4. **Mock Heavily-Animated Elements**: Use the `framer-motion` mock in `test-utils.tsx` (or locally) to avoid timing issues with `AnimatePresence`.

---

_Open-Q Testing Strategy - v1.0_
