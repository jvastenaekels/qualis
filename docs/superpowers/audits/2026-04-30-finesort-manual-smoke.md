# FineSort manual smoke matrix — PR #<n>

## Purpose

Phase 3 of the optional rough-sort plan ships the deck UX + admin toggle.
Even with comprehensive automated tests (153 unit tests + 18 E2E tests + 40
free-mode E2E baselines), FineSort's drag-and-drop nuances and responsive
layouts have repeatedly surfaced issues. This 35-cell matrix is the **PR ENTRY
GATE**: the author must walk through every cell on a running dev server before
opening PR 3.

## How to run

1. Start the dev server: `make dev` (from project root).
2. Open the app in two browser windows:
   - Window A: regular Chrome (desktop).
   - Window B: Chrome DevTools → Device Mode → cycle through iPhone 13, iPad
     portrait, iPad landscape.
3. Create the 4 test studies via the admin UI (see "Test studies" below).
4. Walk every cell. Tick the box `[x]` after manual verification + add any
   notes.
5. Commit this file with all checkboxes ticked.

## Test studies

Activation rule (see `study_service.validate_for_activation`): grid capacity
must equal statement count regardless of `distribution_type`. The shapes
below are all valid.

| Study   | Distribution                          | Rough enabled | Q-set size      |
| ------- | ------------------------------------- | ------------- | --------------- |
| smoke-A | forced 9-col (2-3-5-6-7-6-5-3-2 = 39) | true          | 39 statements   |
| smoke-B | forced 9-col same shape               | false         | 39 statements   |
| smoke-C | flexible 7-col (3-3-3-3-3-3-3 = 21)   | true          | 21 statements   |
| smoke-D | flexible 7-col same shape             | false         | 21 statements   |

For each, set state to `active` and open the participant link.

## Form-factor × mode × distribution matrix (20 cells)

| Form factor       | Mode  | Distribution | Status | Notes                                                                  |
| ----------------- | ----- | ------------ | ------ | ---------------------------------------------------------------------- |
| mobile_portrait   | rough | forced       | [ ]    | Tap-to-Swap works; piles scroll vertically; finish enabled when full   |
| mobile_portrait   | deck  | forced       | [ ]    | Flat deck scrolls; all cards reachable; finish enabled when full       |
| mobile_portrait   | rough | flexible     | [ ]    | Same as forced + over-fill allowed                                     |
| mobile_portrait   | deck  | flexible     | [ ]    | Same                                                                   |
| mobile_landscape  | rough | forced       | [ ]    | Layout adapts; piles not cut off; landscape doesn't break drag         |
| mobile_landscape  | deck  | forced       | [ ]    | Deck row remains horizontally scrollable                               |
| mobile_landscape  | rough | flexible     | [ ]    | (verify)                                                               |
| mobile_landscape  | deck  | flexible     | [ ]    | (verify)                                                               |
| tablet_portrait   | rough | forced       | [ ]    | Hybrid layout: drag works; vertical space adequate                     |
| tablet_portrait   | deck  | forced       | [ ]    | Flat deck either grid_cols-2 or single column — verify which           |
| tablet_portrait   | rough | flexible     | [ ]    | (verify)                                                               |
| tablet_portrait   | deck  | flexible     | [ ]    | (verify)                                                               |
| tablet_landscape  | rough | forced       | [ ]    | Closest-to-desktop; lg:grid-cols-2 deck applies                        |
| tablet_landscape  | deck  | forced       | [ ]    | (verify)                                                               |
| tablet_landscape  | rough | flexible     | [ ]    | (verify)                                                               |
| tablet_landscape  | deck  | flexible     | [ ]    | (verify)                                                               |
| desktop           | rough | forced       | [ ]    | Existing baseline — unchanged                                          |
| desktop           | deck  | forced       | [ ]    | New deck UX                                                            |
| desktop           | rough | flexible     | [ ]    | (verify)                                                               |
| desktop           | deck  | flexible     | [ ]    | (verify)                                                               |

## Rotation tests (4 cells, tablet only)

| From             | To               | Mode  | Status | Notes                                              |
| ---------------- | ---------------- | ----- | ------ | -------------------------------------------------- |
| tablet_portrait  | tablet_landscape | rough | [ ]    | Mid-sort rotation: 3 placed cards stay placed     |
| tablet_portrait  | tablet_landscape | deck  | [ ]    | Same                                               |
| tablet_landscape | tablet_portrait  | rough | [ ]    | Same                                               |
| tablet_landscape | tablet_portrait  | deck  | [ ]    | Same                                               |

## Resilience tests (3 cells)

| Scenario                       | Status | Notes                                                                                              |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------- |
| Browser back button mid-sort   | [ ]    | Prompt or graceful return — does not lose draft                                                    |
| Tab switch + return after 30s  | [ ]    | Draft state preserved                                                                              |
| Resume code mid-sort           | [ ]    | Closing tab and returning via resume_code lands on /fine-sort with deck/piles state restored      |

## Admin views (8 cells)

The expected counts below were verified against the current implementation
(`frontend/src/utils/studySteps.ts`,
`frontend/src/components/admin/dashboard/InteractiveDataView.tsx`,
`frontend/src/components/admin/dashboard/RecentActivityCard.tsx`,
`frontend/src/pages/admin/StudyDesignPage.tsx`).

| View                          | Mode     | Status | Notes                                                                                                                                                                          |
| ----------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data page step filter         | rough    | [ ]    | Dropdown shows 4 step options (Pre-sort survey / Preliminary sort / Q-sort / Post-sort survey). `FILTERABLE_STEP_KEYS` excludes `consent` by historical convention            |
| Data page step filter         | deck     | [ ]    | Dropdown shows 3 step options (Pre-sort survey / Q-sort / Post-sort survey); "Preliminary sort" is absent                                                                      |
| Recent activity card progress | rough    | [ ]    | Step badge progress bars are 20 / 40 / 60 / 80 / 100 % (5 enabled steps; `progressPct = round((i+1)/5 * 100)`)                                                                |
| Recent activity card progress | deck     | [ ]    | Step badge progress bars are 25 / 50 / 75 / 100 % (4 enabled steps; "Preliminary sort" is filtered out)                                                                       |
| Step label on participant row | rough    | [ ]    | Open `Data` page; an in-progress participant at `last_step_reached=3` shows the "Preliminary sort" label                                                                       |
| Step label on participant row | deck     | [ ]    | Open `Data` page; no in-progress participant displays a "Preliminary sort" label (step 3 cannot occur on a deck-mode study; `getStepInfo` returns `null` for stale step=3)    |
| StudyDesignPage toggle        | unlocked | [ ]    | `data-testid="rough-sort-toggle"` is enabled and editable when no participants have started (no `rough-sort-lock-banner`)                                                      |
| StudyDesignPage toggle        | locked   | [ ]    | `data-testid="rough-sort-toggle"` is disabled and `rough-sort-lock-banner` shows the participant count (lock fires when any participant has `last_step_reached > 1`)          |

## Sign-off

- Date completed: \_\_\_\_\_\_\_\_\_\_\_
- Author: \_\_\_\_\_\_\_\_\_\_\_
- All 35 cells ticked: [ ]
- Any deferred / known-broken cells: \_\_\_\_\_\_\_\_\_\_\_
