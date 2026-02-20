# Frontend Best Practices

This document outlines the coding standards and best practices for the Libre-Q frontend, optimized for **React v19** and **Tailwind CSS**.

## 1. React v19 Integration

### Ref as a Prop

React v19 allows passing `ref` as a standard prop. You no longer need `forwardRef`.

```tsx
// Instead of forwardRef((props, ref) => ...)
const MyComponent = ({ ref, ...props }) => {
  return <div ref={ref} />;
};
```

### Concurrent Rendering & startTransition

Use `startTransition` to wrap state updates that are not urgent (e.g., navigation, non-critical UI shifts) to keep the interaction loop responsive.

```tsx
import { startTransition } from "react";

const handleAction = () => {
  startTransition(() => {
    setAppState(newState);
  });
};
```

### State Management (Zustand)

Use **stable selectors** to prevent unnecessary re-renders.

```tsx
// Good: Stable and granular
const agreeCount = useResponseStore((state) => state.rough?.agree?.length ?? 0);

// Bad: Creating new objects on every render
const rough = useResponseStore((state) => ({ agree: state.rough.agree }));
```

## 2. Tailwind CSS & Styling

### Class Merging

Always use the `cn()` utility (based on `clsx` and `tailwind-merge`) for conditional class application.

```tsx
<div className={cn("base-class", isActive && "active-class", className)} />
```

### Responsive Design

Libre-Q is mobile-first. Ensure all complex interactions are optimized for touch.

- Use `touch-manipulation` on buttons to remove click delays.
- Use responsive prefixes: `sm:` (tablet), `lg:` (desktop).

### Design Tokens

Use CSS variables defined in the theme for consistent branding.

```tsx
<button style={{ backgroundColor: "var(--brand-accent)" }} />
```

## 3. Performance & Memoization

While the React Compiler (React 19) automates much of the memoization, manual `useMemo` and `useCallback` are still valuable for:

1. Calculations that are exceptionally expensive.
2. Stability for dependency arrays of other hooks (useEffect, etc.).
3. When external libraries (like `framer-motion`) rely on stable references.
