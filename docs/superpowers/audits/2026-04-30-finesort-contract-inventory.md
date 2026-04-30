# FineSort / RoughSort contract inventory — pre-flight for optional rough_sort (Phase 3)

**Date:** 2026-04-30
**Plan:** `docs/superpowers/plans/2026-04-30-optional-rough-sort.md`, Task 18.0
**Branch:** `feat/rough-sort-phase1-foundation` (Phase 3 work)
**Status of Phase 1/2:** shipped (PRs #71, #72). Default `rough_sort_enabled=true`, so existing studies and tests continue to operate in 5-step / 3-pile mode.

## Why this document exists

Phase 3 introduces a **deck mode** for fine-sort. When `rough_sort_enabled=false`, the participant skips RoughSortPage entirely and lands on FineSortPage with a single flat unsorted deck — no agree / neutral / disagree partition.

FineSort is the most fragile UI in the codebase: 8 test files cover it (5 page-level + 1 hook + 2 RoughSort companions). Every behaviour those tests assert is a contract that the refactor must preserve in `rough mode` and translate to an analogue in `deck mode`. This document is that translation table, plus a list of risk hot-spots in the implementation and a short list of open questions.

The audit is read-only on source files: no `.ts/.tsx` was touched producing it.

---

## Section A — Contract table

One row per `it()` / `test()` block across the 8 files (43 rows, including one `it.skip` retained for inventory completeness). Columns: file, test name, what the assertion actually checks, whether the contract is rough-only / both-modes / mode-agnostic, form factor, and the deck-mode analogue.

| # | Test file | Test name | Asserts | Mode | Form factor | Deck-mode analogue |
|---|-----------|-----------|---------|------|-------------|--------------------|
| 1 | FineSortPage.test.tsx | renders and initializes correctly | mounts the page; the mocked GridSort receives `agreeCards.length===1`, `disagreeCards.length===1`, `neutralCards.length===2` derived from `rough` slice | rough only | all | renders the page; mocked GridSort receives a single `deckCards` prop of length = unplaced statements (or `unplacedAgree+unplacedDisagree+unplacedNeutral` length when fixture seeds rough piles) |
| 2 | FineSortPage.test.tsx | reconciles missing cards into Neutral deck | mounting with one statement absent from both `qsort` and `rough` triggers `categorizeCard(id, 'neutral')` | rough only | all | mounting with a statement absent from `qsort` and the deck slice triggers a deck-mode reconciliation: append the missing id to the flat unsorted deck slice (no `'neutral'` bucket exists) |
| 3 | FineSortPage.test.tsx | disables validation until all cards are placed | `validate-btn` is disabled when at least one rough-pile card is unplaced | both | all | (same — semantics: `isAllPlaced=false` whenever any card is unplaced; in deck mode the unplaced source is the flat deck) |
| 4 | FineSortPage.test.tsx | enables validation and navigates on success | `validate-btn` is enabled when every statement is in `qsort`; click → `navigate('/study/demo/post-sort')` | both | all | (same — agnostic to mode) |
| 5 | FineSortPage.test.tsx | Escape key deselects active card | `keydown Escape` flips `selectedCardId` to `null` and calls `setSelectedCard(null)` via effect | both | all | (same — agnostic to mode) |
| 6 | FineSortPage.mobile.test.tsx | (skipped) Tap-to-Place interaction: select card → tap empty slot → card moves to grid; deck shows `fine.deck.all_placed` | full mobile flow validated end-to-end through `disagree` PileTab | rough only | mobile | rewrite without PileTab: select the card from the flat deck → tap empty slot → card moves to grid; deck shows `fine.deck.all_placed` (still keep skipped if env-flaky) |
| 7 | FineSortPage.mobile.test.tsx | displays the precise "empty pile" message when a category is fully placed | after `categorizeCard(1,'disagree') + placeCardInGrid(1,0,0)`, clicking the `disagree` PileTab reveals `fine.deck.all_placed` | rough only | mobile | after placing the only deck card on the grid, deck-mode renders `fine.deck.all_placed` directly (no PileTab to click — the flat deck is the only view) |
| 8 | FineSortPage.mobile.test.tsx | Tap-to-Swap: card in deck + card in slot → tap deck card → tap occupied slot → cards swap | works through the `disagree` PileTab and asserts both swap directions | both | mobile | (same — works on placed cards; no PileTab interaction, flat deck is implicit; assertion shape unchanged) |
| 9 | FineSortPage.desktop.test.tsx | organizes deck cards in two columns on desktop | the `data-testid="deck-cards-container"` carries the `lg:grid-cols-2` class | both | desktop | (same — the same container is reused; deck mode must keep `lg:grid-cols-2` on the flat deck) |
| 10 | FineSortPage.integration.test.tsx | renders "Finish Sorting" button in Header when grid is full | when all statements are in `qsort`, the validate button is enabled and visible | both | all | (same — agnostic; isAllPlaced derives from qsort coverage of `config.statements`) |
| 11 | FineSortPage.integration.test.tsx | hides "Finish Sorting" button when grid is NOT full | with cards still in `rough.neutral`, no validate button is rendered | rough only (fixture detail) | all | (same — fixture must be retargeted: deck-mode equivalent puts the unplaced ids in the flat deck slice rather than `rough.neutral`) |
| 12 | FineSortPage.reconciliation.test.tsx | recovers missing cards into neutral deck on mount | with statement 3 absent from `rough` and `qsort`, mounting calls `categorizeCard(3, 'neutral')`; statements already in piles are NOT reconciled | rough only | all | with statement 3 absent from the flat deck and `qsort`, mounting appends 3 to the flat deck; statements already in the deck or grid are NOT touched |
| 13 | useFineSort.test.ts | sets step to 4 on mount | `useSessionStore.currentStep === 4` after first render | both | n/a | (same — step persistence at `last_step_reached=4` unchanged; the persisted-step → key mapping is now mediated by `mapPersistedStepToKey` from Phase 2) |
| 14 | useFineSort.test.ts | computes correct unplaced card groups | with cards 1=agree, 2=disagree, 3=neutral and card 3 placed: `unplacedAgree=[1]`, `unplacedDisagree=[2]`, `unplacedNeutral=[]` | rough only | n/a | replace with "computes correct unplaced flat list": `unplacedDeck=[1,2]` after placing card 3; the three rough-pile arrays should NOT be exposed (or should be `[]`) in deck mode |
| 15 | useFineSort.test.ts | isAllPlaced is false when cards remain in decks | with no cards placed, `isAllPlaced===false` | both | n/a | (same — semantics: any unplaced card → false; in deck mode unplaced source is the flat deck) |
| 16 | useFineSort.test.ts | isAllPlaced is true when all cards are in the grid | placing all 3 statements in grid → `isAllPlaced===true` | both | n/a | (same — agnostic) |
| 17 | useFineSort.test.ts | exposes qsort from the response store | placing card 1 at (2,0); `result.qsort` reflects `[{statementId:1, col:2, row:0}]` | both | n/a | (same — qsort is the source of truth for placed cards in either mode) |
| 18 | useFineSort.test.ts | reconciles missing cards into neutral on mount | with card 3 not categorised, mounting yields `useResponseStore.rough.neutral` containing 3 | rough only | n/a | rewrite: with card 3 missing from the flat deck and qsort, mounting yields the deck slice containing 3 (no `'neutral'` fallback) |
| 19 | useFineSort.test.ts | handleValidate navigates to post-sort | calling `result.handleValidate()` → `navigate(stringContaining('/post-sort'))` | both | n/a | (same — agnostic) |
| 20 | useFineSort.test.ts | Escape key sets selectedCardId to null | `setSelectedCardId(1)` then keydown Escape → `selectedCardId === null` | both | n/a | (same — agnostic) |
| 21 | useFineSort.test.ts | navigation guard redirects to rough-sort when no rough data | resetting all responses then mounting → `navigate(stringContaining('/rough-sort'), {replace:true})` | rough only | n/a | replace with "no redirect — direct fine-sort entry": when `rough_sort_enabled=false` (or its UI proxy `isRoughSortEnabled(study)`), mounting with no prior data must NOT call navigate; entry-point semantics are inverted |
| 22 | useFineSort.test.ts | uses config grid_config when provided | `result.gridColumns.length===3`, `[0].score===-1`, `[2].score===+1` from the fixture | both | n/a | (same — agnostic; grid is identical in either mode) |
| 23 | useFineSort.test.ts | defaults distributionMode to 'forced' when not set on config | with no `distribution_mode` field, `result.distributionMode === 'forced'` | both | n/a | (same — agnostic) |
| 24 | useFineSort.test.ts | surfaces distributionMode='free' from config | setting `distribution_mode: 'free'` propagates to hook output | both | n/a | (same — agnostic) |
| 25 | useFineSort.test.ts | surfaces distributionMode='flexible' from config | setting `distribution_mode: 'flexible'` propagates to hook output | both | n/a | (same — agnostic) |
| 26 | RoughSortPage.test.tsx | renders completed status message correctly | with config in `state: 'completed'`, the page shows "First step complete" copy | rough only | all | n/a — RoughSortPage will not be reached when `rough_sort_enabled=false`. Phase 3 router guard (Task 21) must redirect `/rough-sort` to `/fine-sort`. No deck-mode analogue needed |
| 27 | RoughSortPage.test.tsx | sets the current step to 3 on mount | `useSessionStore.currentStep === 3` | rough only | all | n/a — page not reached in deck mode |
| 28 | RoughSortPage.test.tsx | renders the pedagogical hint | hint text "This is spontaneous — you can change your mind right after." appears after a 1500 ms delay | rough only | all | n/a — page not reached in deck mode |
| 29 | RoughSortPage.test.tsx | renders the Control Cluster buttons | `Somewhat disagree`, `Somewhat agree`, `Neutral` aria labels exist | rough only | all | n/a — page not reached in deck mode |
| 30 | RoughSortPage.test.tsx | completes the sort when all cards are categorized | with all statements pre-categorised, "First step complete" + "Next step" appear | rough only | all | n/a |
| 31 | RoughSortPage.test.tsx | persists progress when re-navigating | after categorising card 1, unmount/remount shows card 2 as current | rough only | all | n/a |
| 32 | RoughSortPage.test.tsx | handles keyboard navigation (Arrow Keys) | ArrowRight categorises current card to `agree`; `rough.history` contains the id | rough only | all | n/a |
| 33 | RoughSortPage.test.tsx | handles keyboard undo (Z key) | with one card pre-categorised, pressing `z` empties `rough.history` | rough only | all | n/a |
| 34 | RoughSortPage.test.tsx | handles button clicks (Agree/Disagree/Neutral) | clicking each button categorises the next card into the matching pile | rough only | all | n/a |
| 35 | RoughSortPage.test.tsx | renders and closes the zoom overlay | setting `useUIStore.hoveredCard` shows overlay; clicking Close clears it | rough only | all | n/a |
| 36 | RoughSortPage.test.tsx | auto-dismisses tip after 5 sorted cards | tip disappears after 5 calls to `categorizeCard` | rough only | all | n/a |
| 37 | RoughSortPage.test.tsx | navigates to fine sort when Next is clicked | with all cards categorised, clicking "Next step" reaches `/study/:slug/fine-sort` | rough only | all | n/a — direct entry into FineSortPage from `/welcome` (or pre-sort) replaces this transition in deck mode |
| 38 | RoughSortPage.test.tsx | closes overlay when backdrop is clicked | clicking the framer-motion `.fixed` backdrop nulls `useUIStore.hoveredCard` | rough only | all | n/a |
| 39 | RoughSortPage.test.tsx | closes hint when close button is clicked | clicking `aria-label="Close tip"` closes the inline tip | rough only | all | n/a |
| 40 | RoughSortPage.test.tsx | handles ArrowDown keyboard interaction (neutral) | ArrowDown adds the current card id to `rough.neutral` | rough only | all | n/a |
| 41 | RoughSortPage.test.tsx | calculates shared font size on small screens for long labels | with very long ui_labels and viewport=375, the font-size memo renders the long label without overflow | rough only | mobile | n/a |
| 42 | RoughSortPage.integration.test.tsx | shows "Next" button in page body when rough sort is complete | with `rough.history=[1]` and 1-statement config, "Next step" is rendered | rough only | all | n/a |
| 43 | RoughSortPage.integration.test.tsx | does not show "Next" button when incomplete | with empty `rough.history`, "Next step" is absent | rough only | all | n/a |

**Mode legend.** "rough only" means the assertion is meaningful only when the participant has come from RoughSortPage and `rough_sort_enabled=true`. "both" means the assertion is mode-aware (the underlying behaviour exists in both modes; only the fixture shape differs). "n/a" on RoughSortPage rows means the page is not visited in deck mode and so no analogue is required — coverage for the deck-mode entry-point belongs in FineSortPage tests.

**Coverage commitment.** When Phase 3 lands, every "rough only" row above must have a deck-mode counterpart in the test suite, in the corresponding fixture file (per Task 18.5 fixture helper). "both" rows must run twice — once with `rough_sort_enabled=true` and once with `false` — to catch fixture drift.

---

## Section B — Refactor risk hot-spots

Lines in the implementation that depend on the 3-pile structure. These are the spots Phase 3 must touch and explicitly branch on `isRoughSortEnabled` (or its UI proxy). One sentence per spot states the deck-mode behaviour required.

### B.1 — `frontend/src/hooks/participant/useFineSort.ts`

1. **`useFineSort.ts:154-160`** — navigation guard
   ```ts
   const totalRough = rough.agree.length + rough.disagree.length + rough.neutral.length;
   if (config && totalRough === 0) {
       navigate(`/study/${slug}/rough-sort${location.search}`, { replace: true });
   }
   ```
   In deck mode this guard must be inverted: there is no rough-sort URL to redirect to. Instead, check the deck slice for emptiness AND the absence of any prior navigation through rough-sort (or simply skip the redirect altogether — the participant lands on FineSort straight from welcome / pre-sort).
2. **`useFineSort.ts:191-204`** — three-way `unplacedAgree / unplacedDisagree / unplacedNeutral` partitioning, fed from `rough.agree / rough.disagree / rough.neutral`. In deck mode there is one source list (the deck slice in `useResponseStore`); the hook must expose `unplacedDeck: Statement[]` and zero out the three pile arrays (or stop returning them). Downstream `GridSort` props (`agreeCards / disagreeCards / neutralCards`) need a deck-mode equivalent — see B.4.
3. **`useFineSort.ts:210-213`** — `isAllPlaced` derivation as `unplacedAgree.length === 0 && unplacedDisagree.length === 0 && unplacedNeutral.length === 0`. Must become `unplacedDeck.length === 0` in deck mode (or `qsort.length === config.statements.length`, which is equivalent and mode-agnostic — preferable).
4. **`useFineSort.ts:252-265`** — reconciliation effect:
   ```ts
   const roughIds = new Set([...rough.agree, ...rough.neutral, ...rough.disagree]);
   const missingIds = config.statements.map(s => s.id).filter(id => !placedIds.has(id) && !roughIds.has(id));
   if (missingIds.length > 0) for (const id of missingIds) actions.categorizeCard(id, 'neutral');
   ```
   In deck mode the "known ids" set is the flat deck slice; the recovery action must append to that slice (no `'neutral'` fallback). The recovery hook (`categorizeCard` proxy) needs a sibling — e.g. `addToDeck(id)` — wired through `useResponseStore`.

### B.2 — `frontend/src/store/useResponseStore`

The store currently has only the rough partition (`rough.agree / disagree / neutral`) and the `qsort` array. **A deck slice or its equivalent must exist** for deck mode. Two viable strategies (decision out of scope for the audit, but called out so the implementer chooses deliberately):

- **Strategy 1 (separate slice):** add `deck: number[]` to the store. Mode-aware code in `useFineSort` reads either `rough` or `deck` based on study config.
- **Strategy 2 (alias):** re-use `rough.neutral` as the flat deck when `rough_sort_enabled=false` and freeze `rough.agree / disagree` to `[]`. Cheap, but conflates two semantics — easy to break if a developer later partitions the "neutral" pile into something else. **Strategy 1 is recommended.**

Either strategy must include a reset action (`resetFineSort`) that empties the right slice; otherwise a participant who switches between modes mid-study (theoretically impossible, but defensively handled by the reconciliation effect) leaks ids.

### B.3 — `frontend/src/pages/FineSortPage.tsx`

5. **`FineSortPage.tsx:126-128`** — three named pile props passed to `<GridSort>`:
   ```tsx
   agreeCards={unplacedAgree}
   disagreeCards={unplacedDisagree}
   neutralCards={unplacedNeutral}
   ```
   Must add a deck-mode prop (e.g. `deckCards={unplacedDeck}`) or replace the three with a single prop and have `GridSort` distinguish modes via `mode: 'piles' | 'deck'`. Either way: the `data-testid="deck-cards-container"` element on `GridSort.tsx:1090` must be reused (the desktop test on line 63 of `FineSortPage.desktop.test.tsx` asserts `lg:grid-cols-2` on that exact testid).

### B.4 — `frontend/src/components/GridSort.tsx`

6. **`GridSort.tsx:511-545`** — `GridSortProps` declares `agreeCards / disagreeCards / neutralCards` as required. In deck mode the three are empty / unused; the type must accept the deck mode without forcing callers to pass `[]` for unused fields (consider a discriminated union `{mode:'piles', agreeCards, disagreeCards, neutralCards} | {mode:'deck', deckCards}`).
7. **`GridSort.tsx:600-604`** — `useDeckManagement({agreeCards, disagreeCards, neutralCards})` returns `activePile / setActivePile / activeCards`. In deck mode there is no active pile; the hook should be called only when `mode === 'piles'` and `activeCards` should fall back to `deckCards` directly when in deck mode.
8. **`GridSort.tsx:1032-1067`** — the entire `Category selector (Piles)` block (PileTab tablist, `disagree / neutral / agree` map). In deck mode this block must NOT render; the deck cards container slides up to take its space.
9. **`GridSort.tsx:1069-1101`** — the `DroppableDeckArea` is currently keyed by `activePile` (`id={`deck-area-${activePile}`}`). In deck mode use a stable id (e.g. `deck-area-flat`) so dnd-kit drop targets stay consistent.
10. **`GridSort.tsx:1050-1057`** — the count rendered inside each `PileTab` reads from the matching pile array; this disappears in deck mode along with the tablist (no separate concern beyond removing the block).

### B.5 — `frontend/src/components/GridSort.tsx` (empty-pile message)

11. **`GridSort.tsx:769-782`** — the `fine.deck.all_placed` empty-state message currently fires whenever `activeCards.length === 0`, which in rough mode means "the *currently selected pile* is empty." In deck mode the same line means "the entire deck is empty" — semantically tighter. The render condition is unchanged; only the meaning changes. The mobile test on line 122-143 of `FineSortPage.mobile.test.tsx` (row 7 of Section A) becomes simpler in deck mode: no PileTab click is needed before checking the message. Make sure the i18n key stays `fine.deck.all_placed` to avoid translation churn — the underlying English copy ("All cards placed") still applies.

### B.6 — `frontend/src/pages/FineSortPage.mobile.test.tsx`

12. **`FineSortPage.mobile.test.tsx:90-92, 136-139, 161-165`** — every test enters via `screen.findByRole('tab', {name: /common.disagree/i})`. The deck-mode analogue tests must NOT look for a tab role; they should find the deck cards container directly via `getByTestId('deck-cards-container')`. The fixture helper (Task 18.5) should expose a `mountFineSortMobile({ mode })` so the same shape of test can run twice.

### B.7 — `frontend/src/hooks/useDeckManagement.ts`

13. **`useDeckManagement.ts:22, 31-41`** — `activePile` defaults to `'disagree'`, and `activeCards` is computed via a `switch` on the three pile types. In deck mode this hook is not needed (callers can pass deck cards directly to the renderer). Either short-circuit the hook with a `mode` argument or skip calling it from `GridSort` when in deck mode (preferred — keeps the hook itself tightly scoped).

### B.8 — Router-level / breadcrumbs

14. **Router guard for `/study/:slug/rough-sort`** (Task 21) — when the study has `rough_sort_enabled=false`, hitting `/rough-sort` directly (e.g. via a stale link) must redirect to `/fine-sort`. This is not a test contract today (no test deep-links into rough-sort with the flag off), but it is a behavioural contract for Phase 3.

---

## Section C — Open questions

The deck-mode design is mostly determined by symmetry with rough mode, but a handful of edge cases remain ambiguous and must be resolved before code starts. These are deliberately listed as questions, not decisions.

1. **Stale `rough` slice from a previous session on a different study.** `useResponseStore` is persisted across studies (or, depending on persistence scope, can carry residue from a participant who completed a rough-sort study earlier in their browser session). When a deck-mode study mounts FineSortPage:
   - **Option a.** Ignore the rough slice; reconcile every config statement into the new flat deck slice; reset rough to `{agree:[], disagree:[], neutral:[]}` defensively.
   - **Option b.** Migrate the rough slice into the flat deck (concat all three piles) on first mount.
   - **Option c.** Treat the rough slice as authoritative if non-empty (i.e. the participant somehow got a rough sort done — unlikely, but allows test-environment shortcuts).

   Recommendation: **Option a** — defensive reset matches the current reconciliation effect's behaviour for missing ids.
2. **`isAllPlaced` derivation.** Should the refactor switch the implementation from "every pile / deck list is empty" to the simpler / mode-agnostic "every config statement is in qsort"? The two are equivalent today (because reconciliation guarantees every id is either placed or in some unsorted slice), but the second formulation is mode-free and removes one branch from the hook.

   Recommendation: **switch** — Section A row 16 becomes the canonical assertion, row 15 (and its analogue) reduces to redundant variation.
3. **Reset / "reset deck" UX in deck mode.** `handleReset` currently calls `resetFineSort()` which clears `qsort` only. In deck mode "reset" arguably should also un-place every grid card back into the flat deck. Is the existing `resetFineSort` semantics still correct?

   Recommendation: keep it identical (un-place into flat deck) — the user-facing copy `fine.deck.confirm_reset` is unchanged.
4. **PileTab keyboard shortcut focus.** Some keyboard test paths rely on the disagree tab having keyboard focus by default (`useDeckManagement` defaults `activePile='disagree'`). In deck mode there is no tab, so any keyboard shortcut tied to `activePile` (currently none in the FineSort tests, but possibly in the keyboard reference card) must be reviewed for stale references.

   Recommendation: out of scope for this audit; flag for a quick grep during implementation.
5. **`distributionMode='free'` + deck mode.** Free distribution allows the participant to overflow column capacity. With a flat deck the per-column visualisation does not change, but the validation copy may. Is there any mode×distribution interaction that surfaces only in deck mode? (Test rows 23-25 only assert that the value is surfaced from config, not the rendering.)

   Recommendation: add one explicit deck × free combination test as part of Task 20.
6. **Reconciliation when `categorizeCard` does not exist for the deck slice.** B.1 hot-spot 4 calls `actions.categorizeCard(id, 'neutral')`. If Strategy 1 (separate slice) is taken in B.2, the hook must call `addToDeck(id)` instead. The store API surface is the open decision here — the audit only flags it.

   Recommendation: introduce `addToDeck(id)` on the response store and have `useFineSort` pick the right reconciler based on mode.

If the implementer disagrees with any recommendation above, they should document the alternative in the PR description before merging Phase 3.

---

## Cross-references

- Plan: `docs/superpowers/plans/2026-04-30-optional-rough-sort.md` Task 18.0 (this audit) and Tasks 18.5–24 (downstream Phase-3 work).
- Phase 1: PR #71 — `Study.rough_sort_enabled` column + backend plumbing.
- Phase 2: PR #72 — `getEnabledSteps`, `getStepLabels`, `getStepInfo`, `mapPersistedStepToKey`, `isRoughSortEnabled` helpers; admin views + WelcomePage + StudyLayout breadcrumb consumption.
- Implementation under audit: `frontend/src/pages/FineSortPage.tsx`, `frontend/src/hooks/participant/useFineSort.ts`, `frontend/src/components/GridSort.tsx`, `frontend/src/hooks/useDeckManagement.ts`, `frontend/src/pages/RoughSortPage.tsx`.
- Test files audited: `frontend/src/pages/FineSortPage.{test,mobile.test,desktop.test,integration.test,reconciliation.test}.tsx`, `frontend/src/hooks/participant/useFineSort.test.ts`, `frontend/src/pages/RoughSortPage.{test,integration.test}.tsx`.
