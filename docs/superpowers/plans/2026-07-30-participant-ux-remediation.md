# Participant UX Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every defect found in the 2026-07-29 participant-flow UX audit — from a language switcher no phone can reach, down to a hyphen in the wrong place — and build the gate that should have caught a third of them. 24 tasks across six phases.

**Architecture:** Six phases, ordered by harm. Phase 1 fixes what a participant cannot do or reads wrong. Phase 2 opens by building the gate that should have caught Phase 2's own defects — the participant flow has never had an axe pass — then clears what it finds. Phases 3–5 collapse the divergent component, typographic and verbal systems into one each. Phase 6 is pixel finish. Each phase ships, reviews and merges on its own.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, dnd-kit, framer-motion, react-i18next, Vitest + Testing Library, Playwright + `@axe-core/playwright`.

## How this plan was produced

A fresh Docker instance (`docker compose down -v`, then `make demo-up` / `demo-seed` / `demo-smoke`), walked end to end as a participant at 1440×900, 820×1180 and 390×844, plus a width sweep at 320/360/375/390/414/430/480/560/640/768. Every number quoted below is a live measurement from that run, not an estimate.

**One measurement was thrown away.** The first mobile fine-sort observations were invalid: headless Chromium reports `screen.orientation.type = "landscape-primary"` at 390×844, and `ViewportContext` trusts that signal in preference to `width > height` — correctly, since it is the keyboard-immune one. The app therefore served the landscape-mobile layout to what the browser insisted was a landscape device. With orientation stubbed, the portrait fine sort is sound: deck below, full width, 38×25 px cells. Nothing in this plan rests on those discarded captures.

**And one task was withdrawn.** Task 6.4 originally claimed the orientation signal was never seeded at mount. It is, at `ViewportContext.tsx:36-41`, in the `useState` initialiser — the task was written from the effect at `:71-89` without reading the state declaration above it. See Task 6.4 for the retraction; what remains there is the Playwright hazard, recorded as a comment rather than a fix.

---

## Global Constraints

Every task inherits these. They come from `CLAUDE.md` and are non-negotiable.

- **Inner loop:** run `make ci-fast` after every change (~38 s). Run `make ci` before pushing (~3–5 min). Never push on a failing `make ci`.
- **No `any` in TypeScript.** Use `unknown` or a specific type. `// biome-ignore` only when genuinely unavoidable.
- **Avoid non-null assertions (`!`).** Handle null explicitly.
- **All user-facing strings** go through `useTranslation()` / `t()` with a key **and** an English fallback: `t('key', 'Fallback')`.
- **The participant namespace is under STRICT locale parity.** Unlike admin, a missing key in any of the nine locales fails `npm run i18n-check`. Every new or renamed key in `frontend/public/locales/en/participant.json` must land in `de, es, fi, fr, it, nl, pl, pt` in the same commit. Changing a *value* (Task 1.3) needs no propagation; changing a *key* (Tasks 5.1, 5.2) needs all nine.
- **Run `npm run i18n-check` and `npm run check-interpolations`** after touching any locale file.
- **Frontend tests:** Vitest with the `renderWithStore` helper; `waitFor` for async state. Hook logic tests live in `frontend/src/hooks/<area>/use<Name>.test.ts`.
- **`setupTests.ts:87` mocks `useHyphenation` globally** so soft hyphens do not break text assertions. Any test that asserts *on* hyphenation behaviour (Task 4.1) must unmock it locally.
- **Formatting:** `npm run lint:fix` (frontend). Do not hand-format.
- **Do not break the fine sort.** It is the one screen where a layout regression destroys research data rather than looking bad. Tasks 4.3 and 4.4 touch `GridSort.tsx`; both are required to run the three existing specs in `frontend/e2e/participant/` before commit.
- **Commit style:** conventional commits, one commit per task.

---

## File Structure

Two new files. Everything else is modification.

**Create:**
- `frontend/e2e/accessibility/participant-pages.spec.ts` — the axe pass the participant flow has never had (Task 2.1). Mirrors `admin-pages.spec.ts`: same `SMOKE_RULES`, two viewports, an explicit coverage-boundary comment naming what a green run does *not* prove.
- `frontend/src/components/ui/native-select.tsx` — the one styled `<select>`, so the pre-sort and the post-sort stop diverging (Task 3.2).

**Modify (by phase):**

| Phase | Files |
|---|---|
| 1 — Correctness | `layouts/StudyLayout.tsx`, `components/CardStack.tsx`, `public/locales/en/participant.json`, `components/postsort/Step1_Feedback.tsx`, all nine `public/locales/*/participant.json` |
| 2 — Accessibility | `e2e/accessibility/participant-pages.spec.ts`, `pages/RoughSortPage.tsx`, `components/GridSort.tsx`, `components/survey/SurveyField.tsx`, `pages/PreSortPage.tsx` |
| 3 — One system | `components/ui/native-select.tsx`, `components/survey/SurveyField.tsx`, `components/postsort/Step1_Feedback.tsx`, `components/postsort/Step2_Questionnaire.tsx`, `pages/RoughSortPage.tsx`, `index.css`, `tailwind.config.js` |
| 4 — Typography | `components/SafeMarkdown.tsx`, `pages/WelcomePage.tsx`, `pages/ConsentPage.tsx`, `components/GridSort.tsx`, `components/SortableCard.tsx` |
| 5 — Vocabulary | `public/locales/*/participant.json` (×9), `pages/PreSortPage.tsx`, `pages/RoughSortPage.tsx`, `pages/ConsentPage.tsx`, `components/postsort/Step1_Feedback.tsx` |
| 6 — Layout finish | `components/survey/SurveyField.tsx`, `layouts/StudyLayout.tsx`, `contexts/ViewportContext.tsx` |

---

# PHASE 1 — Correctness

Four defects that stop a participant doing something, or make them read something false. Nothing else matters until these are gone.

### Task 1.1: The language switcher is off-screen on every phone

**The defect:** from the pre-sort step onward, the header's right-hand cluster overflows the viewport. Measured, with `document.documentElement.scrollWidth === window.innerWidth` at every width — so there is no horizontal scroll to recover it. `index.css:86` (`@apply … overflow-x-hidden`) swallows the overflow silently.

| viewport | Help button right edge | Globe right edge |
|---|---|---|
| 320 | 401 ✗ | 453 ✗ |
| 360 | 402 ✗ | 454 ✗ |
| 375 | 403 ✗ | 455 ✗ |
| 390 | 403 ✗ | 455 ✗ |
| 414 | 404 ✓ | 456 ✗ |
| 430 | 405 ✓ | 457 ✗ |
| 480 | 407 ✓ | 459 ✓ |

The globe is unreachable up to and including 430 px — iPhone SE, iPhone 14/15, iPhone Pro Max, and essentially every Android in use. A participant who needs to switch language mid-study cannot. The controls stay in the DOM and in the tab order, so a keyboard user can focus a control they cannot see.

**Root cause:** `StudyLayout.tsx:403` (left cluster) and `:647` (right cluster) are *both* `shrink-0`. Neither yields, so the flex row overflows rather than compressing. The title's `truncate max-w-[200px]` at `:404` therefore never engages below 200 px of available space.

**Files:**
- Test: `frontend/src/layouts/StudyLayout.test.tsx`
- Modify: `frontend/src/layouts/StudyLayout.tsx:403-404` (left cluster), `:647` (right cluster)

**Interfaces:** no prop or signature change. The contract this task establishes is geometric: for every viewport ≥ 320 px, every interactive element in `[data-testid="layout-header"]` has `getBoundingClientRect().right <= header.right`.

- [ ] **Step 1: Write the failing test**

A jsdom test cannot measure layout. Put the assertion where it can be measured — in the Playwright suite, alongside the a11y specs — and keep a cheap structural unit test as a regression tripwire.

```ts
// frontend/e2e/accessibility/participant-pages.spec.ts  (created in Task 2.1;
// if Phase 2 has not run yet, put this in a temporary spec and move it later)
const PHONE_WIDTHS = [320, 360, 375, 390, 414, 430];

for (const width of PHONE_WIDTHS) {
    test(`header controls stay on screen at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/study/bioeconomy-futures/presort');
        await page.waitForSelector('[data-testid="layout-header"]');

        const offscreen = await page.evaluate(() => {
            const header = document.querySelector('[data-testid="layout-header"]');
            if (!header) return ['header missing'];
            const hb = header.getBoundingClientRect();
            return [...header.querySelectorAll('button,a')]
                .filter((el) => el.getBoundingClientRect().width > 0)
                .filter((el) => el.getBoundingClientRect().right > hb.right + 1)
                .map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '?');
        });

        expect(offscreen).toEqual([]);
    });
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx playwright test e2e/accessibility --grep 'header controls stay on screen'`
Expected: FAIL at 320–390 with `["Help", "lucide-globe"]`, FAIL at 414–430 with `["lucide-globe"]`.

- [ ] **Step 3: Let the left cluster yield**

The right cluster is the one that must never compress — three 44 px targets are already at the minimum. So the left cluster gives way:

- `:403` — replace `shrink-0` with `min-w-0` on the left wrapper.
- `:404` — the title already has `truncate`; lower the mobile ceiling so truncation engages before the row overflows. `max-w-[200px] md:max-w-[160px] lg:max-w-md` becomes `max-w-[110px] sm:max-w-[200px] md:max-w-[160px] lg:max-w-md`.

Do not delete a control to make room. If 320 px still overflows after truncation, collapse the study title to the logo mark below `sm` rather than dropping the globe — the language switcher is the one header control a participant may genuinely need.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx playwright test e2e/accessibility --grep 'header controls stay on screen'`
Expected: PASS at all six widths.

- [ ] **Step 5: Verify no regression above the fold**

Run: `cd frontend && npx vitest run src/layouts/StudyLayout.test.tsx`
Then, with the demo stack up, check 1440 px: the full title, the five-step stepper and all three right-hand icons must be unchanged.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/layouts/StudyLayout.tsx frontend/e2e/accessibility/
git commit -m "fix(participant): keep the language switcher on screen on phones"
```

---

### Task 1.2: "Read the full statement" vanishes when the viewport changes

**The defect:** `CardStack.tsx:58-67` computes `isOverflowing` in a `useEffect` whose only dependency is `statement.id`. The flag is therefore never recomputed when the *viewport* changes, only when the card does. Proven both ways in one session:

- Arrive at a statement while wide (`cut: false`, `eye: false` — correct) → narrow the viewport → `scrollHeight > clientHeight` becomes true but **`eye` stays false**. The participant reads a statement cut off mid-sentence, with no ellipsis (see below) and no way to reveal the rest, and ranks it.
- The reverse: arrive while narrow (`eye: true`) → widen → nothing is truncated any more but the button persists.

The first direction is the harmful one, and it is what a phone rotation does.

**Why there is no ellipsis to soften it:** the text container carries `line-clamp: 10` while the box only fits ~3.4 lines at the rendered 30.8 px / 50 px line-height. `-webkit-line-clamp` only draws its ellipsis when the clamp is the binding constraint; here the box height binds first, so plain `overflow: hidden` does the cutting. Six of six statements sampled at 390×844 were cut, losing 21–93 px of text.

**Files:**
- Test: `frontend/src/components/CardStack.test.tsx`
- Modify: `frontend/src/components/CardStack.tsx:34` (`useViewport` is already destructured for `width`), `:58-67`

**Interfaces:**
- Consumes: `useViewport()` → `{ width, height }`, already imported at `CardStack.tsx:34`.
- Produces: no prop change.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/CardStack.test.tsx
it('re-checks overflow when the viewport changes, not only when the card does', async () => {
    // Height is what binds: the clamp never binds first (see plan Task 1.2).
    const heights = { scroll: 80, client: 80 };
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => heights.scroll);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => heights.client);

    const { rerender } = renderWithStore(<CardStack {...propsFor(longStatement)} />);
    expect(screen.queryByRole('button', { name: /read full statement/i })).not.toBeInTheDocument();

    // Same statement, smaller viewport — the text now overflows.
    heights.scroll = 200;
    act(() => { setViewportWidth(390); });
    rerender(<CardStack {...propsFor(longStatement)} />);

    await waitFor(() => {
        expect(screen.getByRole('button', { name: /read full statement/i })).toBeInTheDocument();
    });
});
```

`setViewportWidth` should drive the real `ViewportProvider` (dispatch a `resize` on `window`), not stub the context — the point of the test is that the component reacts to the provider.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/CardStack.test.tsx -t 're-checks overflow'`
Expected: FAIL — the button never appears.

- [ ] **Step 3: Add the viewport to the dependency array**

```tsx
const { width, height } = useViewport();

useEffect(() => {
    if (!textRef.current) return;
    setIsOverflowing(textRef.current.scrollHeight > textRef.current.clientHeight);
}, [statement.id, width, height]);
```

Drop the `biome-ignore lint/correctness/useExhaustiveDependencies` at `:57` if the array is now honest; keep it with an updated reason if `statement.id` still stands in for the whole statement object.

`height` matters as much as `width`: the box is height-bound, so the on-screen keyboard opening in the post-sort — or a browser chrome bar collapsing on scroll — changes truncation without changing width.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/CardStack.test.tsx`

- [ ] **Step 5: Verify in the running app**

Rough sort at 1100×900, advance to a statement of ~130 characters with no eye button, then resize to 390×844 without navigating. The eye button must appear. Then run the three participant E2E specs: `npx playwright test e2e/participant`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CardStack.tsx frontend/src/components/CardStack.test.tsx
git commit -m "fix(rough-sort): re-check statement overflow on resize, not only per card"
```

---

### Task 1.3: Typo in the English consent sentence

**The defect:** `public/locales/en/participant.json:170` reads *"I confirm that **i** have read the above information…"*. English only — the source locale, and the one every other locale falls back to. All eight translations are correct. This is the sentence a participant ticks to consent to data processing.

**Files:**
- Modify: `frontend/public/locales/en/participant.json:170`
- Test: `frontend/src/pages/ConsentPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/ConsentPage.test.tsx
it('capitalises the first person pronoun in the consent sentence', () => {
    renderWithStore(<ConsentPage />);
    const label = screen.getByText(/I confirm that/i);
    expect(label.textContent).toContain('that I have read');
    expect(label.textContent).not.toContain('that i have read');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/ConsentPage.test.tsx -t 'capitalises'`

- [ ] **Step 3: Fix the string**

Change `that i have read` → `that I have read` in `en/participant.json` only. This is a value change, not a key change, so no propagation is required — but re-run `npm run i18n-check` anyway to confirm parity is untouched.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/pages/ConsentPage.test.tsx && npm run i18n-check`

- [ ] **Step 5: Grep for the same shape elsewhere**

```bash
grep -rnE "\b(that|and|but|because) i\b" frontend/public/locales/en/*.json
```
Fix anything else this turns up in the same commit.

- [ ] **Step 6: Commit**

```bash
git add frontend/public/locales/en/participant.json frontend/src/pages/ConsentPage.test.tsx
git commit -m "fix(i18n): capitalise 'I' in the English consent sentence"
```

---

### Task 1.4: A hint is being displayed as a validation error

**The defect:** `Step1_Feedback.tsx:424-427` renders, in red with an `AlertCircle`, under a field that failed validation:

> A few words are enough to help us understand the context.

That is encouragement, not an error. It states neither what is wrong nor that a minimum exists. The key is named `post.extreme.min_chars` — the *code* knows there is a minimum; the *string* never says so. Identical in all nine locales, so this is a copy defect, not a translation gap. The page-level banner above it is no better: "Attention / Please fill in all required fields" names no field and moves no focus.

This is the same shape as the `common.confirm_delete`-rendered-as-a-label defect from the admin audit: the string is valid, so nothing catches it.

**Files:**
- Modify: `frontend/src/components/postsort/Step1_Feedback.tsx:415-430`
- Modify: all nine `frontend/public/locales/*/participant.json` (`post.extreme.min_chars`)
- Test: `frontend/src/components/postsort/Step1_Feedback.test.tsx`

**Interfaces:** the minimum length is already known at the validation site. Pass it into the message via interpolation rather than hard-coding a number in nine strings.

- [ ] **Step 1: Write the failing test**

```tsx
it('tells the participant what is required, not that a short answer would be fine', async () => {
    renderWithStore(<Step1_Feedback {...propsWithExtremes} />);
    await userEvent.click(screen.getByTestId('postsort-step1-next-btn'));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent(/please explain/i);
    expect(error).not.toHaveTextContent(/a few words are enough/i);
});
```

Note the `role="alert"`: the current markup at `:416` is a bare `<div>`, so the message is never announced. Adding the role is part of the fix.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/postsort/Step1_Feedback.test.tsx -t 'what is required'`

- [ ] **Step 3: Rewrite the message and give it a role**

English:
- `post.extreme.min_chars` → `"Please explain your choice in at least {{count}} characters."`
- `post.extreme.required` → keep `"Please provide either a text or audio response."` (this one already says what to do).

Add `role="alert"` to the wrapper at `:416`. Keep the hint text — it is good copy — but move it to a permanent helper line *under the label*, in slate, where it belongs, rather than surfacing it only on failure.

- [ ] **Step 4: Propagate to all nine locales**

Participant parity is strict. Translate the new `{{count}}` form into `de, es, fi, fr, it, nl, pl, pt`. Run `npm run check-interpolations` — it verifies per-key `{{var}}` parity and will fail on any locale that drops `{{count}}`.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/components/postsort/ && npm run i18n-check && npm run check-interpolations`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/postsort/Step1_Feedback.tsx \
        frontend/src/components/postsort/Step1_Feedback.test.tsx \
        frontend/public/locales/*/participant.json
git commit -m "fix(post-sort): say what the field requires instead of reassuring about length"
```

---

# PHASE 2 — Accessibility

The gate first. Every contrast defect below has been live since the participant flow existed, because `e2e/accessibility/` has an `admin-pages.spec.ts` and a `public-pages.spec.ts` and **no participant spec at all**. Commit #338 raised the admin's contrast floor to AA; nobody raised the participant's, because nothing measured it.

### Task 2.1: Build the participant axe pass — and let it fail

**The gap:** `e2e/accessibility/public-pages.spec.ts` covers `/` and `/login`. `admin-pages.spec.ts` covers seven admin routes at two widths. The six screens a *participant* sees — welcome, consent, pre-sort, rough sort, fine sort, post-sort — are covered by nothing.

**Files:**
- Create: `frontend/e2e/accessibility/participant-pages.spec.ts`
- Reuse: `frontend/e2e/accessibility/rules.ts` (`SMOKE_RULES`), `frontend/e2e/fixtures/db-setup`

**Interfaces:**
- Consumes: `expectNoA11yViolations(page)` from `./rules`, the seeded `bioeconomy-futures` study.
- Produces: nothing importable. This file is a gate.

- [ ] **Step 1: Write the spec, with its coverage boundary stated in the file**

Mirror `admin-pages.spec.ts`: same `SMOKE_RULES`, two viewports (375×800 and 1440×900), and a header comment that names what a green run does **not** prove. Required content for that comment, because a gate that hides its blind spots is worse than no gate:

- `results.incomplete` is dropped by `expectNoA11yViolations`, exactly as it is for the admin. On the participant flow this matters more than it does there: the fine sort's board sits under a `react-zoom-pan-pinch` transform and the rough-sort drop zones use translucent tints (`bg-red-50/70`-style), both of which produce `color-contrast` incompletes that this spec will silently pass over.
- Only the *initial* DOM of each route is scanned. The rough sort's tip banner, the fine sort's card-selected state, the post-sort's validation state and every modal are unscanned.
- The fine sort is scanned with an **empty** grid. Placed cards render at 10.3 px effective (Task 4.4) and axe will not see them here.
- Reaching pre-sort and beyond requires consent state. Use the same db-setup fixture pattern as the admin spec; do not stub the store, or the spec stops testing the real render path.

```ts
const PARTICIPANT_ROUTES = [
    { name: 'welcome', path: '/study/bioeconomy-futures/welcome' },
    { name: 'consent', path: '/study/bioeconomy-futures/consent' },
    { name: 'pre-sort', path: '/study/bioeconomy-futures/presort' },
    { name: 'rough sort', path: '/study/bioeconomy-futures/rough-sort' },
    { name: 'fine sort', path: '/study/bioeconomy-futures/fine-sort' },
    { name: 'post-sort', path: '/study/bioeconomy-futures/post-sort' },
];
```

- [ ] **Step 2: Run it and record the baseline**

Run: `cd frontend && npx playwright test e2e/accessibility/participant-pages.spec.ts`
Expected: FAIL. Record the full violation list in the PR body — it is the evidence that this gate was worth building. The audit predicts at minimum:

| where | text | ratio | needs |
|---|---|---|---|
| rough sort | `Somewhat agree` (green-600 on green-50) | **3.15** | 4.5 |
| rough sort | `Somewhat disagree` (red-600 on red-50) | **4.41** | 4.5 |
| rough sort | `1/25` counter (slate-400 on slate-100) | **2.34** | 4.5 |
| rough sort | `←` `↓` `→` key hints | **2.34** | 4.5 |
| fine sort | ×18 axis labels `-4…+4` (slate-400 on slate-100, 38 px bold) | **2.34** | 3 |
| pre-sort | rating radiogroup — no accessible name | — | `aria-input-field-name` |

- [ ] **Step 3: Do not fix anything yet**

Commit the failing spec on its own branch or leave it uncommitted until Tasks 2.2–2.4 land. Whichever you choose, the commit that turns it green must be a *different* commit from the one that created it, so the diff shows the gate catching real defects.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/accessibility/participant-pages.spec.ts
git commit -m "test(a11y): add the axe pass the participant flow has never had"
```

---

### Task 2.2: Raise the rough sort to AA

**The defect:** four failures on the one screen where a participant makes 25 consecutive judgements. The two pile labels are the words that tell them where the card is going.

**Files:**
- Modify: `frontend/src/pages/RoughSortPage.tsx:161` (the `n/25` counter), `:273-283` (the keyboard hint row)
- Modify: wherever the disagree/agree pile labels take `text-red-600` / `text-green-600` on their tinted backgrounds (rough-sort drop zones)

- [ ] **Step 1: Confirm the failures are in the axe baseline**

They are, from Task 2.1. Do not add a second bespoke contrast harness.

- [ ] **Step 2: Fix by moving one step down the ramp, not by inventing colours**

- `text-slate-400` → `text-slate-600` on slate-100 gives **6.92:1** (was 2.34). Applies to the counter at `:161` and the `<kbd>` hints at `:273-283`.
- `text-green-600` on `green-50` → `text-green-700` gives **4.79:1** (was 3.15).
- `text-red-600` on `red-50` → `text-red-700` gives **5.91:1** (was 4.41).

**Do not compromise on `slate-500`.** It looks like the gentler step and it fails: `slate-500` on `slate-100` is **4.34:1**, under the 4.5 floor. The ramp has no half-measure here — 400 fails, 500 fails, 600 passes.

Do not lighten the backgrounds instead; the tints carry the agree/disagree semantics and are already faint.

- [ ] **Step 3: Verify**

Run: `cd frontend && npx playwright test e2e/accessibility/participant-pages.spec.ts --grep 'rough sort'`
Expected: the four rough-sort violations are gone.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RoughSortPage.tsx frontend/src/components/
git commit -m "fix(a11y): raise the rough sort's contrast floor to AA"
```

---

### Task 2.3: Raise the fine sort's axis labels to AA

**The defect:** all eighteen score labels (`GridSort.tsx:276`, `ScoreLabel`) render `text-slate-400` on `slate-100` — **2.34:1** at 38 px bold, where large text needs 3:1. These are the axis of the instrument.

**Files:**
- Modify: `frontend/src/components/GridSort.tsx:274-280` (`ScoreLabel`)

- [ ] **Step 1: Fix**

`text-slate-400` → `text-slate-600` in `ScoreLabel`'s base class. **6.92:1** — clears AA for normal text as well as large, so it holds when the board is zoomed out and the labels stop counting as "large". `slate-500` does not (4.34:1); see Task 2.2.

- [ ] **Step 2: Verify the board still reads as a background grid**

The labels must not now compete with the cards. Check at 1440 with a full grid: the numbers should read as structure, the cards as content. If slate-600 is too assertive at 38 px bold, drop the weight to `font-semibold` rather than lightening the colour back.

- [ ] **Step 3: Run the fine-sort specs**

Run: `cd frontend && npx playwright test e2e/participant e2e/accessibility/participant-pages.spec.ts --grep 'fine sort'`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/GridSort.tsx
git commit -m "fix(a11y): raise the fine sort's axis labels to AA"
```

---

### Task 2.4: The rating scale has no accessible name

**The defect:** `SurveyField.tsx:36` sets `aria-labelledby={`${id}-label`}` on the radiogroup. Nothing in the tree carries that id — `PreSortPage.tsx:121` renders `<label htmlFor={key}>` with no `id` at all. Verified live: `document.getElementById('familiarity-label')` → `null`. A screen-reader user hears "radio group" and five unlabelled radios, and never hears the question.

The same `htmlFor={key}` is also inert for rating fields specifically, because `RatingField` never renders an element with `id={key}` — the `id` prop is only used to build the dangling `aria-labelledby`.

**Files:**
- Modify: `frontend/src/pages/PreSortPage.tsx:121-129`
- Modify: `frontend/src/components/survey/SurveyField.tsx:34-38`
- Test: `frontend/src/pages/PreSortPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('names the rating scale with its question', () => {
    renderWithStore(<PreSortPage />);
    expect(
        screen.getByRole('radiogroup', { name: /how familiar are you with debates/i })
    ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/PreSortPage.test.tsx -t 'names the rating scale'`
Expected: FAIL — no accessible name.

- [ ] **Step 3: Give the label the id the group already points at**

```tsx
<label id={`${key}-label`} htmlFor={key} className="block text-sm font-medium text-gray-700">
```

While here: move the required asterisk out of the accessible name. `<span className="text-red-500 ml-1" aria-hidden="true">*</span>` plus `aria-required` on the field, so the name is the question and not "…bioeconomy? star".

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/pages/PreSortPage.test.tsx src/components/survey/ && npx playwright test e2e/accessibility/participant-pages.spec.ts --grep 'pre-sort'`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PreSortPage.tsx frontend/src/components/survey/SurveyField.tsx \
        frontend/src/pages/PreSortPage.test.tsx
git commit -m "fix(a11y): give the pre-sort rating scale its question as an accessible name"
```

---

# PHASE 3 — One component system

Four places where the same thing is built twice, differently, in one flow.

### Task 3.1: The primary action changes identity at the post-sort

**The defect:** the same action, with the same label, rendered two ways:

| | welcome → fine sort | post-sort |
|---|---|---|
| background | `var(--brand-accent)` (bright blue) | `rgb(79, 70, 229)` indigo-600 |
| radius | `rounded-full` (9999 px) | 6 px |
| height | ~50 px (`px-8 py-3`) | **36 px** |
| font | 16 px bold | 14 px |

Four screens establish one primary button; the fifth replaces it. `Step1_Feedback.tsx:662` hard-codes `bg-indigo-600 hover:bg-indigo-700`, bypassing the brand token that the participant flow's own `--brand-accent` exists to carry — and which a study owner can rebrand.

**Files:**
- Modify: `frontend/src/components/postsort/Step1_Feedback.tsx:656-670`
- Modify: `frontend/src/components/postsort/Step2_Questionnaire.tsx` (same pattern, verify)
- Test: `frontend/src/components/postsort/Step1_Feedback.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('uses the study brand colour for its primary action, not a hard-coded indigo', () => {
    renderWithStore(<Step1_Feedback {...props} />);
    const next = screen.getByTestId('postsort-step1-next-btn');
    expect(next.className).not.toMatch(/bg-indigo-600/);
});
```

- [ ] **Step 2: Run it, confirm FAIL**

- [ ] **Step 3: Adopt the flow's primary button**

Replace the hard-coded classes with the same shape the four preceding steps use — `rounded-full`, `px-8 py-3`, `text-base font-bold`, `style={{ backgroundColor: 'var(--brand-accent)' }}`. Extract it if it is now used in five places; a `PrimaryActionButton` in `components/ui/` is justified at that count, but do not block this task on the extraction.

Check `--brand-accent` is actually defined on this route before switching — it is set from study branding, and `document.documentElement`'s computed value came back empty in the audit while the buttons still rendered blue. Confirm where the fallback lives, and keep it.

- [ ] **Step 4: Verify at three widths and commit**

```bash
git add frontend/src/components/postsort/
git commit -m "style(post-sort): use the flow's primary button instead of a second one"
```

---

### Task 3.2: One `<select>`, not two

**The defect:** the pre-sort's dropdown is an unstyled native control — background `rgb(239, 239, 239)`, the UA's own grey, the only grey field in a form of white ones. The post-sort's dropdown, four screens later, is white, rounded and bordered. Cause: `SurveyField.tsx:78-79`'s `commonClasses` has no `bg-white`. `<input>` and `<textarea>` render white by UA default, so the omission is invisible on every field type except `<select>`.

**Files:**
- Create: `frontend/src/components/ui/native-select.tsx`
- Modify: `frontend/src/components/survey/SurveyField.tsx:78-79, 119-138`
- Modify: `frontend/src/components/postsort/Step1_Feedback.tsx` (adopt it)
- Test: `frontend/src/components/ui/native-select.test.tsx`

**Interfaces:**
- Produces: `NativeSelect` — `React.SelectHTMLAttributes<HTMLSelectElement>` plus nothing. A styled `<select>`, not a Radix `Select`: this is inside a `react-hook-form` `register()` call, and swapping in a Radix component would change the form contract. Keep the native element and style it.

- [ ] **Step 1: Write the failing test**

```tsx
it('renders the pre-sort dropdown on the same white as its sibling fields', () => {
    renderWithStore(<SurveyField id="sector" fieldConfig={selectConfig} register={noopRegister} />);
    expect(screen.getByRole('combobox').className).toMatch(/bg-white/);
});
```

- [ ] **Step 2: Run it, confirm FAIL**

- [ ] **Step 3: Build `NativeSelect` and use it in both places**

Base it on the post-sort's existing classes, which are already right: `w-full p-3 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-[var(--brand-accent)]`, plus `min-h-[44px]` from `commonClasses` for the touch target. Add `appearance-none` and a chevron only if you also handle the arrow yourself — a half-styled select with the UA arrow removed and nothing in its place is worse than the grey one.

Also add `bg-white` to `commonClasses` so the next field type added does not repeat this.

- [ ] **Step 4: Verify both screens and commit**

```bash
git add frontend/src/components/ui/native-select.tsx frontend/src/components/survey/SurveyField.tsx \
        frontend/src/components/postsort/Step1_Feedback.tsx frontend/src/components/ui/native-select.test.tsx
git commit -m "style(forms): give the pre-sort dropdown the same field styling as every other field"
```

---

### Task 3.3: Two raw emoji in an icon-set UI

**The defect:** `RoughSortPage.tsx:178` renders `💡` and `Step2_Questionnaire.tsx:367` renders `✉️`, in an interface that uses `lucide-react` everywhere else. Rendering depends entirely on the OS font stack, and the app declares no emoji fallback — `index.css:110` is `"Google Sans Flex", "Google Sans Flex Local", sans-serif` and `tailwind.config.js`'s `sans` stack ends at `Arial`. Both glyphs rendered as tofu (`□`) during the audit.

**Files:**
- Modify: `frontend/src/pages/RoughSortPage.tsx:178`
- Modify: `frontend/src/components/postsort/Step2_Questionnaire.tsx:367`
- Modify: `frontend/tailwind.config.js` (fontFamily.sans)

- [ ] **Step 1: Swap both for lucide icons**

`💡` → `<Lightbulb size={18} aria-hidden="true" />`, `✉️` → `<Mail size={18} aria-hidden="true" />`. Both are already in the project's icon set. Match the surrounding text colour rather than introducing a new one.

- [ ] **Step 2: Add the emoji fallback anyway**

Append `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"` to `fontFamily.sans` in `tailwind.config.js`. This task removes the two known emoji, but study *content* is author-supplied: a researcher who writes an emoji into a statement should not get tofu.

- [ ] **Step 3: Grep for the rest**

```bash
grep -rnP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" frontend/src/pages frontend/src/components --include=*.tsx | grep -v test
```
Five admin files also match. Out of scope here — log them for a follow-up rather than widening this commit.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RoughSortPage.tsx frontend/src/components/postsort/Step2_Questionnaire.tsx \
        frontend/tailwind.config.js
git commit -m "style(participant): replace raw emoji with the icon set, and declare an emoji fallback"
```

---

### Task 3.4: The sticky action bar has no background

**The defect:** `Step1_Feedback.tsx:655` and `Step2_Questionnaire.tsx:453` both use `sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent`. Two consequences, both measured:

1. The bar occupies y=816–900 while the next textarea occupies y=817–917. The field's content shows through the transparent upper band, behind the buttons — a participant typing into that field reads their own text through the button bar.
2. The gradient is *white*, but it sits over the tinted extreme-statement cards (`red-50` / `green-50`). The bottom of a green card is visibly washed out, and the "Strongest agreement (+4)" badge half-disappears.

**Files:**
- Modify: `frontend/src/components/postsort/Step1_Feedback.tsx:655`
- Modify: `frontend/src/components/postsort/Step2_Questionnaire.tsx:453`

- [ ] **Step 1: Give the bar a real surface**

Replace the gradient with an opaque bar: `bg-white/95 backdrop-blur border-t border-slate-200`. This is the pattern `GridSort.tsx:242` already uses for the floating grid toolbar and `:199` for the instruction banner — the app has a house style for a floating surface and this is not it.

If a fade above the bar is wanted, add it as a separate `pointer-events-none` element *above* the opaque bar, so the buttons always sit on a solid ground.

- [ ] **Step 2: Verify against a tinted card**

Scroll the post-sort so the bar sits over the green "Strongest agreement" card. The badge and the card's tint must be unaltered above the bar and fully hidden below it — no wash.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/postsort/
git commit -m "fix(post-sort): give the sticky action bar an opaque surface"
```

---

# PHASE 4 — Typography

### Task 4.1: Scope hyphenation to the cards that need it

**The defect:** `SafeMarkdown.tsx:34` runs `hyphenateText()` over **everything** it renders, and `:53` sets `[hyphens:manual]`, which honours the injected U+00AD. Justified on a 100 px grid card; wrong everywhere else. Measured on one grid card: **11 soft-hyphen break points in 90 characters** — `sus·tain·ably`, `ma·te·ri·als`, `bioecono-my`, `transi-tion`, `so-cial`. On the welcome page's 500 px process column it produces `compare dif-/ferent`; in the rail it stacks with truncation to give `because it re-…`.

`SafeMarkdown` is used by eleven call sites, of which three are narrow cards (`SortableCard`, `GridSort`, `CardStack`) and the rest are prose (`WelcomePage`, `ConsentPage`, `Step1_Feedback`, `RoughSortPage`, `DataPrivacyPage`, plus admin editors).

**Files:**
- Modify: `frontend/src/components/SafeMarkdown.tsx:7-11, 25-35, 51-54`
- Modify: the three card call sites to opt in
- Test: `frontend/src/components/SafeMarkdown.test.tsx`

**Interfaces:**
- Produces: `SafeMarkdown` gains `hyphenate?: boolean`, **default `false`**. Opt-in, not opt-out: the majority of call sites are prose, and a new call site added later should get the safe default.

- [ ] **Step 1: Write the failing test**

Unmock `useHyphenation` locally — `setupTests.ts:87` mocks it globally, so a test written without that will assert nothing.

```tsx
it('does not hyphenate prose by default', () => {
    vi.unmock('@/hooks/useHyphenation');
    const { container } = render(<SafeMarkdown>{'environmental sustainability'}</SafeMarkdown>);
    expect(container.textContent).not.toContain('­');
});

it('hyphenates when the caller asks — the narrow-card case', () => {
    vi.unmock('@/hooks/useHyphenation');
    const { container } = render(<SafeMarkdown hyphenate>{'environmental sustainability'}</SafeMarkdown>);
    expect(container.textContent).toContain('­');
});
```

- [ ] **Step 2: Run, confirm the first fails**

- [ ] **Step 3: Add the flag and opt the three card sites in**

```tsx
export const SafeMarkdown: React.FC<Props> = ({ children, allowLinks = true, hyphenate = false, className, ...props }) => {
    …
    return hyphenate ? hyphenateText(sanitized) : sanitized;
```

Then add `hyphenate` at the `SortableCard`, `GridSort` and `CardStack` call sites, and nowhere else.

- [ ] **Step 4: Check the prose sites visually**

Welcome, consent and the post-sort must show no mid-word breaks. The grid and rough-sort cards must be unchanged from today — this task must not alter fine-sort card wrapping.

- [ ] **Step 5: Run the participant E2E and commit**

```bash
cd frontend && npx playwright test e2e/participant
git add frontend/src/components/SafeMarkdown.tsx frontend/src/components/SafeMarkdown.test.tsx \
        frontend/src/components/SortableCard.tsx frontend/src/components/GridSort.tsx \
        frontend/src/components/CardStack.tsx
git commit -m "style(typography): hyphenate the narrow cards, not the prose"
```

---

### Task 4.2: The welcome paragraph is centred body copy

**The defect:** the study description renders centred, weight 500, at 24 px/39 px on desktop — **nine lines** of centred text at 768 px — and 15.2 px/24.7 px over **eleven lines** at 390 px. Centred setting gives both edges a ragged return, which is what makes a long paragraph hard to re-enter after each line break. It is the first thing a participant reads.

Note this is a *presentation* fix, not a content one: the text is study-authored and its length is the researcher's business.

**Files:**
- Modify: `frontend/src/pages/WelcomePage.tsx` (the description block)

- [ ] **Step 1: Left-align the description, keep the title and subtitle centred**

Title and subtitle are display text and stay centred. The description becomes `text-left` with a measure cap — `max-w-[62ch] mx-auto` — and drops to weight 400. Keep the size drop from 24 px to something nearer 18 px; at nine lines, 24 px is display sizing applied to body copy.

- [ ] **Step 2: Check the two extremes**

A one-sentence description must not now look orphaned left in a wide centred layout — if it does, centre below a line-count threshold is *not* the answer (it makes the layout jump); instead keep the block left-aligned and let the container centre it.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/WelcomePage.tsx
git commit -m "style(welcome): set the study description as body copy, not display text"
```

---

### Task 4.3: The score labels are rendered twice

**The defect:** `GridSort.tsx:908` and `:1009` each render a `ScoreLabel` per column — one above the column, one below. Eighteen elements for nine values. The top set follows the pyramid's silhouette, so it reads as a scattered staircase; the bottom set is an aligned row. Neither `id` (`header-score-N`, `footer-N`) is referenced by any `aria-labelledby` or `aria-describedby` in the file — verified by grep — so both are purely decorative and either may go without breaking the accessibility tree.

**Files:**
- Modify: `frontend/src/components/GridSort.tsx:906-912, 1008-1013`
- Test: `frontend/src/components/GridSort.test.tsx`

- [ ] **Step 1: Decide which set to keep, on evidence not taste**

The bottom row is the one that reads as an axis, because it is aligned. The top set exists so that a column's score is visible when the board is scrolled and the bottom row is out of view. Confirm whether that scroll case actually occurs at any supported viewport before removing it — if it does not, remove the top set; if it does, keep it and mark the second `aria-hidden="true"` so it is not announced twice.

- [ ] **Step 2: Write the test for whichever you chose**

```tsx
it('announces each column score once', () => {
    renderWithStore(<GridSort {...props} />);
    // nine columns, nine announcements — not eighteen
    expect(screen.getAllByText('+4')).toHaveLength(1);
});
```

- [ ] **Step 3: Implement, then run the fine-sort specs**

Run: `cd frontend && npx playwright test e2e/participant && npx vitest run src/components/GridSort.test.tsx`
This task touches the fine sort. All three participant specs must pass before commit.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/GridSort.tsx frontend/src/components/GridSort.test.tsx
git commit -m "style(fine-sort): render each column score once"
```

---

### Task 4.4: Grid cards are 10 px, and the reveal badge sits on the text

**The defect:** two problems that only appear together.

1. `SortableCard`'s text is authored `text-xs sm:text-sm` (14 px), but the board renders under `matrix(0.735988, …)` — **10.3 px effective** at 1440×900, and smaller as the board scales down. A participant is ranking statements they can barely read; they can hover for the reveal, but the resting state is the state they work in.
2. The reveal badge is `absolute top-2 right-2` on a card that renders 100×66 px. At that size the top-right corner *is* the first line of text. Measured at x=80 of a 100 px card. On the rough sort the equivalent badge (`CardStack.tsx:210`, `bottom-2 right-2`) sits on the last line, and there it is always visible rather than hover-gated.

**Files:**
- Modify: `frontend/src/components/SortableCard.tsx` (text scale, badge placement)
- Modify: `frontend/src/components/CardStack.tsx:199-215` (badge placement)

- [ ] **Step 1: Raise the authored size to survive the transform**

The board's scale is computed to fit; the type must be authored so that `authored × scale` clears a floor. Either author larger (`text-sm sm:text-base`) or — better — read the scale that `GridSort` already computes and clamp the effective size, so the relationship is expressed once rather than guessed. Target: no less than 12 px effective at the default 1440 fit.

- [ ] **Step 2: Move the badge out of the text**

Reserve space for it instead of overlaying: give the card's text container `pr-5` when the badge is present, or move the badge to a corner the clamped text does not reach. Do not solve it with a higher `z-index` — the problem is occlusion, not stacking.

- [ ] **Step 3: Reconsider `hover:scale-[1.05]`**

`SortableCard`'s inner div scales on hover inside a tightly packed grid, so a hovered card overlaps its neighbours. Either drop it or reduce it to a shadow/border change. Verify it is not load-bearing for the drag affordance first.

- [ ] **Step 4: Run the fine-sort specs and the screenshot suite**

Run: `cd frontend && npx playwright test e2e/participant`
`e2e/participant/fine-sort-screenshots/` exists — expect snapshot diffs and review each one deliberately rather than blanket-updating.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SortableCard.tsx frontend/src/components/CardStack.tsx \
        frontend/e2e/participant/
git commit -m "style(fine-sort): make card text legible at board scale and stop the badge covering it"
```

---

# PHASE 5 — Vocabulary

### Task 5.1: One name per step

**The defect:** four names for the same step, all visible in one session:

| where | what it says |
|---|---|
| header stepper | `First impressions` |
| page heading | `Before we start` (pre-sort) |
| completion screen | `First step complete` |
| `steps.presort` in `en/participant.json:161` | `Pre-sort survey` |

`First step complete` is also factually wrong: it appears with two steps already ticked in the stepper.

**Files:**
- Modify: all nine `frontend/public/locales/*/participant.json`
- Modify: `frontend/src/pages/PreSortPage.tsx:102`, `frontend/src/pages/RoughSortPage.tsx`

- [ ] **Step 1: Fix the canonical name per step, and write it down**

Extend `CLAUDE.md`'s existing "Naming canon" section to cover the participant flow: one label per step, propagated to `steps.<s>` (the i18n step list), the stepper label, and the page `<h1>`. The stepper's names are the better set — they address the participant ("Let's meet", "First impressions", "Your perspective") where `steps.*` is researcher vocabulary ("Pre-sort survey", "Preliminary sort").

- [ ] **Step 2: Fix "First step complete"**

It should name what was completed, and not miscount. `t('rough.complete.title', 'First impressions recorded')`.

- [ ] **Step 3: Propagate all nine locales, run the gates**

Run: `cd frontend && npm run i18n-check && npm run check-interpolations`

- [ ] **Step 4: Commit**

```bash
git add frontend/public/locales/*/participant.json frontend/src/pages/ CLAUDE.md
git commit -m "fix(i18n): give each participant step one name"
```

---

### Task 5.2: Two consecutive "Get started"

**The defect:** the welcome screen's CTA is "Get started" (`welcome.start`); the consent screen's CTA, the very next screen, is also "Get started". The second is an act of consent and should say so.

**Files:**
- Modify: `frontend/src/pages/ConsentPage.tsx`, all nine locales (new key `welcome.consent.submit`)

- [ ] **Step 1: Add the key and use it**

English: `"I agree — start the study"`. Translate into all eight others. Strict parity applies.

- [ ] **Step 2: Run the gates and commit**

```bash
git add frontend/src/pages/ConsentPage.tsx frontend/public/locales/*/participant.json
git commit -m "fix(consent): label the consent action as consent"
```

---

### Task 5.3: Sentence case, everywhere

**The defect:** `Key Choices` is the only Title Case heading in a flow of sentence-case ones (`Your perspective & feedback`, `Before we start`, `First impressions`).

- [ ] **Step 1: `Key Choices` → `Key choices`, all nine locales where the target language uses sentence case** (German capitalises nouns; do not "fix" `Wichtige Entscheidungen`).

- [ ] **Step 2: Sweep the participant namespace for other Title Case headings** and fix in the same commit.

- [ ] **Step 3: Commit**

```bash
git add frontend/public/locales/*/participant.json
git commit -m "style(i18n): use sentence case for participant headings"
```

---

### Task 5.4: One arrow, not two

**The defect:** `Step1_Feedback.tsx:657` renders `← {t('post.back')}` — a literal U+2190 in a text node — immediately beside a button whose arrow is `<ArrowRight size={18} />`, a lucide SVG. Different weights, different sizes, different baselines, side by side. The glyph also lives *inside* the translated string's neighbourhood, so a RTL locale added later would need the arrow flipped by hand.

- [ ] **Step 1: Replace the glyph with `<ArrowLeft size={18} className="mr-2" />`** and remove the `←` from the JSX.

- [ ] **Step 2: Grep the participant flow for other literal arrows**

```bash
grep -rn $'←\|→\|↑\|↓' frontend/src/pages frontend/src/components --include=*.tsx | grep -v test
```
The rough sort's `<kbd>` hints legitimately use literal arrow characters — those represent keyboard keys, not direction, and stay.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/postsort/Step1_Feedback.tsx
git commit -m "style(post-sort): use the icon set for the back arrow"
```

---

# PHASE 6 — Layout finish

### Task 6.1: The rating scale's anchors are 354 px from the scale

**The defect:** `SurveyField.tsx:57` puts the anchor labels in a `flex justify-between` spanning the **full card width**, while the radios above them are a `flex flex-wrap` only as wide as their content. Measured at 1440: radios span x=427→671 (244 px), anchors span x=415→1025 (610 px). "Very familiar" sits 354 px to the right of option 5, the option it qualifies. Invisible on mobile, where the card is narrow enough that the two rows coincide.

**Files:**
- Modify: `frontend/src/components/survey/SurveyField.tsx:32-62`
- Test: `frontend/src/components/survey/SurveyField.test.tsx`

- [ ] **Step 1: Bind the two rows to one width**

Wrap the radiogroup and the anchor row in a single `inline-flex flex-col w-fit` so the anchors can only ever be as wide as the scale. Keep the anchor row's `justify-between` — inside the narrower wrapper it now does the right thing.

Guard the wrap case: at very narrow widths the radios wrap to two lines, and `justify-between` on a wrapped scale is meaningless. Below `sm`, stack the anchors under their end options instead.

- [ ] **Step 2: Add the geometric assertion to the participant axe spec**

A jsdom test cannot catch this. Add to `participant-pages.spec.ts`: the right anchor's right edge must be within 24 px of the last radio's right edge.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/survey/SurveyField.tsx frontend/e2e/accessibility/participant-pages.spec.ts
git commit -m "fix(pre-sort): anchor the rating labels to the scale they describe"
```

---

### Task 6.2: The resume toast covers the header

**The defect:** on returning to a saved session, the "Welcome back! Your progress has been restored." toast renders over the header. `document.elementFromPoint(100, 31)` — the centre of the header title at 390 px — returns the toast, so it also intercepts pointer events there. Its close button sits at the top-left corner, outside the toast's visual box, floating over the page.

**Files:**
- Modify: wherever the resume toast is mounted (grep `resume.restored` / `Welcome back`)

- [ ] **Step 1: Offset the toast below the sticky header**

The header is `sticky top-0 h-16` (`StudyLayout.tsx:383`). The toast container needs `top-16` — or better, the same `--header-height` custom property, so the two cannot drift.

- [ ] **Step 2: Bring the close button inside the toast**

- [ ] **Step 3: Verify with `elementFromPoint`, and commit**

```bash
git commit -m "fix(participant): stop the resume toast covering the header"
```

---

### Task 6.3: The tablet stepper is five anonymous dots

**The defect:** the stepper's labels are `hidden lg:block` (`StudyLayout.tsx`), so between 768 and 1023 px only the current step is named — the other four are unlabelled circles, and the trailing one is a bare dot with a short connector going nowhere. This is *deliberate*, so it is finish work rather than a defect; but the result at iPad-portrait width reads as unfinished, and the participant cannot see what comes next.

- [ ] **Step 1: Choose one of two, do not do both**

(a) Show the *next* step's label alongside the current one below `lg` — the participant's actual question is "what's after this". (b) Fall back to the mobile "Step 3/5 ▾" pill, which is compact and already built, for everything below `lg`.

(b) is less work and reuses a component that already exists. Prefer it unless the tablet is a primary target.

- [ ] **Step 2: Verify at 768, 820, 1024 and commit**

```bash
git commit -m "style(participant): give the stepper a legible tablet state"
```

---

### Task 6.4: ~~Seed the orientation override at mount~~ — WITHDRAWN, the premise was false

**Retracted on 2026-07-30, during Phase 1.** This task claimed `orientationOverride` was
"only ever set inside the `screen.orientation` change handler (`:71-81`)" and therefore
never seeded at mount. That is wrong. `ViewportContext.tsx:36-41` seeds it in the
`useState` initialiser:

```tsx
const [orientationOverride, setOrientationOverride] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined' && screen.orientation?.type) {
        return screen.orientation.type.startsWith('landscape');
    }
    return null;
});
```

The `?? width > height` fallback at `:89` is therefore reached only where
`screen.orientation` is genuinely unavailable, which is what it is for. There is no
defect here and nothing to fix. The task was written from `:71-89` without reading
`:26-42` — the effect looked like the only writer because it was the only writer I
looked at.

**What survives, and is worth keeping:** headless Chromium reports
`screen.orientation.type === 'landscape-primary'` at *any* viewport size, including
390×844 where `screen.width`/`screen.height` themselves report portrait. Because the
seeding above works correctly, the app faithfully serves the landscape-mobile layout to
what the browser insists is a landscape device. Anyone auditing the participant flow
with Playwright must stub `screen.orientation` or they will measure a layout no real
phone ever shows — as the first pass of the 2026-07-29 audit did.

- [ ] **Step 1: Record the hazard where it will be found**

Add the paragraph above as a comment in `frontend/e2e/accessibility/participant-pages.spec.ts`,
next to any viewport-dependent test. No source change.

- [ ] **Step 2: Commit**

```bash
git add frontend/e2e/accessibility/participant-pages.spec.ts
git commit -m "docs(e2e): record that headless Chromium misreports screen.orientation"
```

---

## Found while executing Phase 1

Two things the audit did not see, both worth acting on separately.

### The committed E2E screenshots are not a gate, and they drift by machine

`e2e/participant/fine-sort-screenshots/` holds 100 PNGs described as "visual baselines
committed alongside the spec files". Nothing compares them. `captureTransition()`
(`e2e/helpers/rough-sort.ts:33`) calls `page.screenshot({path})` — it *writes* them on
every run and asserts nothing. So they dirty the working tree after any participant E2E
run, and a real visual regression would be silently overwritten rather than caught.

They also do not match what this machine renders. Measured on
`mobile_portrait-rough-03-presort.png`:

| comparison | differing pixels |
|---|---|
| two runs, identical code, same machine | **4** |
| committed baseline vs a fresh run of `main`'s own code | **13,566** |
| committed baseline vs a fresh run with the Phase 1 header fix | 8,166 |

Run-to-run noise is negligible, so the 13,566 is real — and it is present with *no source
change at all*, over the whole page rather than just the header. The committed images
encode some other environment's font rasterisation. Phase 1 therefore restored them
rather than committing the churn: recording this machine's rendering as the new truth
would produce a 100-file diff that means nothing and would mask the next real change.

**Proposed:** either promote them to a real gate (`toHaveScreenshot` with a tolerance, and
per-platform baselines committed from CI, not from a developer laptop), or stop committing
them and write to a gitignored directory. The current middle position has the cost of
baselines and the benefit of none.

### `uv.lock` is stale on `main`

The lock recorded `qualis-backend 0.7.3` against `pyproject.toml`'s 0.7.4, so
`make check-requirements` → `uv lock --check` fails on a clean checkout. It passes locally
only because `uv run` rewrites the lock before the check reads it — the gate is repaired
by the command that runs just before it. Fixed in Phase 1 (`c406d816`); worth checking why
CI does not surface it.

---

## What this plan does not cover

Stated so the next audit does not assume it was checked.

- **The admin space.** Five files there still render raw emoji (Task 3.3, step 3). Untouched.
- **Landscape phones.** The audit ran portrait at 390×844 and desktop/tablet landscape. `isLandscapeMobile` (`GridSort.tsx:659`) selects a distinct fine-sort layout for landscape phones that was never walked with correct orientation reporting.
- **The audio path.** Seven spoken comments are in the demo seed; none were played, recorded, or re-recorded.
- **Resume by code, and the completion screen.** The flow was walked once, straight through.
- **Dialogs and overlays.** The help overlay, the zoom/reading overlay behind the eye badge, and the mobile step menu were opened but not audited.
- **The nine locales as rendered.** Every string finding is from the English UI. A French or Finnish run would put different pressure on every width finding in Phase 1 and Phase 6 — German especially, where compound nouns will test Task 1.1's truncation ceiling.
- **`results.incomplete`.** Task 2.1's gate drops it, exactly as the admin gate does. Contrast over the fine-sort board's transform and over the rough sort's translucent tints is therefore unmeasured by a green run.
