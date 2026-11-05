---
title: "A test tab's draft must survive a reload, because nothing prunes qsort"
author: Julien
date: 2026-11-05
branch: fix/test-run
cost: { minutes: 441, tokens: 1361994 }
id: l-e768c349
scope: repo
status: active
src: agent
touches:
  - src/frontend/src/hooks/useStudyConfig.ts
  - src/frontend/src/utils/pilotMode.ts
  - src/frontend/src/hooks/participant/useFineSort.ts
  - src/frontend/src/pages/PostSortPage.tsx
---

## Decided
A running test holds its draft in `sessionStorage` under `pilotHeldDraftKey(slug)`, not in a ref. The key is cleared when the reset key is consumed and in `leavePilot`. Every load compares the held draft with `qualis-test-draft-<slug>` and sets `designChanged` from that, ignoring Save stamps.

## Tried and ruled out
A ref in `useStudyConfig` was lost on F5. `useStudyPersistence.ts` writes the draft on every designer save with no reset key, so the reload took the shorter draft under the kept answers. `reconcileIntoDeck` and `reconcileIntoRoughNeutral` only add missing ids, nothing prunes an orphan, so `isAllPlaced` stayed true while the `PostSortPage` length check sent Confirm back to fine-sort every time.

## Watch out
In a test tab, the silent `started` submit never reached the server, even with the `useSubmitStudy` gate open and 1.5 s spent on post-sort. The cause is not established and real sessions are unmeasured: a keystroke cancelling the timer was the first explanation, and a rerun with the wait before any answer refuted it.
