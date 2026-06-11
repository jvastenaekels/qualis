# Frontend Guidelines

Coding patterns specific to the Qualis frontend. The cross-cutting standards (no `any`, contract-first, test-first, no magic) live in [`coding-standards.md`](coding-standards.md).

Stack: **React 19** + **TypeScript strict** + **Tailwind CSS** + **Zustand** + **TanStack Query** (consumed via Orval-generated hooks) + **react-i18next**.

## 1. Hook-driven pages

Pages and complex components delegate state-and-effect logic to a colocated hook in `frontend/src/hooks/<area>/use<Name>.ts`. The component receives the hook's return value and renders JSX.

**Boundary:**

- The hook owns: `useState`, `useEffect`, `useCallback`, `useMemo`, store subscriptions, navigation guards, keyboard handlers, event handlers, derived data.
- The component keeps: JSX, `useRef` for DOM elements, framer-motion `MotionValue`s and their derived transforms (these must be passed to JSX elements), purely visual state (zoom level, animation callbacks).

**Test convention:** add `hooks/<area>/use<Name>.test.ts` covering ≥5 pure logic paths without rendering. The page test file remains as integration coverage for the hook + JSX glue.

**Trigger:** if a component body grows past ~100 LOC of non-JSX logic, extract a hook before adding more.

**JSX shell complexity:** when a page is mostly large declarative JSX (multiple GuidanceCard panels, tabbed UI, modals), the `noExcessiveCognitiveComplexity` rule fires on the JSX shell itself. Add `// biome-ignore lint/complexity/noExcessiveCognitiveComplexity` on the page component as the documented exception (precedent: StudyDesignPage, RecruitmentPage, ConcourseDetailPage). Never suppress inside the hook.

> A page can also avoid the suppression by splitting its body into sub-component shells (precedent: AnalysisPage decomposes into `ExploreShell` / `InterpretShell`).

For the canonical list of pages already converted and the conventions around them, see the "Hook-driven components" section in [`CLAUDE.md`](../../CLAUDE.md).

## 2. Internationalization

Every user-facing string passes through `useTranslation()` / `t()` with a key and a sensible English fallback:

```tsx
const { t } = useTranslation();
return <button>{t('study.activate', 'Activate Study')}</button>;
```

- Supported locales: see `SUPPORTED_LANGUAGES` in `frontend/src/constants/languages.ts`. Each entry carries a `hasAdmin` flag controlling whether the locale appears in the admin sidebar selector.
- Translation files live under `frontend/public/locales/<lang>/`, split into `participant.json` (participant flow + public chrome — **strict parity**, mandatory) and `admin.json` (admin + auth — **best-effort**, may be partial or absent; missing keys fall back to English via i18next's `fallbackLng`).
- Adding a key: add it to `en/<namespace>.json` first, then mirror it to every other locale's same namespace. `npm run i18n-check` and `npm run check-interpolations` verify key and placeholder parity; CI runs both.
- Adding a new locale: write `frontend/scripts/i18n/glossaries/<code>.yaml` first, then follow `frontend/scripts/i18n/translation-runbook.md`. Update `SUPPORTED_LANGUAGES`, `SUPPORTED_I18N_LANGUAGES` (in `frontend/src/i18n.ts`), and the mocked allowlist in `frontend/src/setupTests.ts` in lock-step — the cross-consistency invariant test in `languages.test.ts` will catch drift.

## 3. Generated API client

The frontend never hand-writes `fetch` or `axios` calls. Use the Orval-generated hooks under `src/api/`. The cycle when changing a backend route or schema:

1. Update the backend Pydantic schema or router.
2. Run `make generate-api`.
3. Use the regenerated hook (e.g. `useGetStudyApiAdminStudiesSlugGet`, named from the full operationId).
4. Commit the regenerated `frontend/src/api/generated.ts`.

CI runs `make check-api` and fails if the committed client is out of sync with the backend.

## 4. State management (Zustand)

Use stable, granular selectors to avoid extra re-renders:

```tsx
// Good — primitive, narrow selector
const agreeCount = useResponseStore((state) => state.rough?.agree?.length ?? 0);

// Bad — new object every render, every consumer re-renders
const rough = useResponseStore((state) => ({ agree: state.rough.agree }));
```

There are seven atomic stores (auth, admin, study designer, config, session, response, UI). See [`../explanation/architecture.md#state-management`](../explanation/architecture.md#state-management) for the rationale.

## 5. React 19

### `ref` as a prop

`forwardRef` is no longer required:

```tsx
const MyComponent = ({ ref, ...props }: Props) => <div ref={ref} {...props} />;
```

### `startTransition`

Wrap non-urgent state updates so they do not block the interaction loop:

```tsx
import { startTransition } from 'react';

const handleAction = () => {
  startTransition(() => setAppState(newState));
};
```

### Memoisation

The React Compiler covers most cases. Reach for manual `useMemo` / `useCallback` only when:

1. A computation is genuinely expensive.
2. A dependency array of another hook needs a stable reference.
3. An external library (notably framer-motion) requires stable references.

## 6. Tailwind CSS

### Class merging

Always go through `cn()` (built on `clsx` + `tailwind-merge`):

```tsx
<div className={cn('base-class', isActive && 'active-class', className)} />
```

### Mobile-first

Touch first, then desktop. Use `touch-manipulation` on buttons to remove click delays. Use responsive prefixes (`sm:`, `lg:`) only to layer desktop on top of the mobile baseline, not the other way around.

### Design tokens

Use CSS variables defined in the theme for branding:

```tsx
<button style={{ backgroundColor: 'var(--brand-accent)' }} />
```
