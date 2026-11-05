---
title: A Test run e2e must remove a write gate to prove the no-write check
author: Julien
date: 2026-11-05
branch: fix/test-run
cost: { minutes: 379, tokens: 865272 }
id: l-99e75569
scope: repo
status: active
src: agent
touches:
  - src/frontend/src/layouts/StudyLayout.tsx
  - src/frontend/src/pages/ConsentPage.tsx
---

## Decided
`src/frontend/e2e/participant/test-run.spec.ts` watches writes on the browser context, not the tab, because the popup's first load would otherwise slip past the listener. It checks `countParticipants` at 0 before the exit and at 1 after a real consent, which also shows the check can see a row.

## Tried and ruled out
Restoring the old `navigate('../fine-sort')` in `Step1_Feedback.tsx` does fail the spec, but only on the query string: the `StudyLayout` guard puts `mode=test` back at once, so only `lang` is lost and nothing leaks. That RED never reaches `expect(writes)`. Removing the single gate at `ConsentPage.tsx:74` is what reaches the assertion, which then reports the consent POST.

## Watch out
The layers overlap on purpose, so one mutation rarely shows one assertion failing: pick the mutation by the assertion you want to see fail. A study whose grid does not reach the default `extreme_columns` of [-4, 4] shows no comment boxes on post-sort, for real participants too.
