---
title: "A test tab has one exit, and reads on unload must not write the flag"
author: Julien
date: 2026-11-05
branch: fix/test-run
cost: { minutes: 326, tokens: 1209684 }
id: l-7f6834d9
scope: repo
status: active
src: agent
touches:
  - src/frontend/src/utils/pilotMode.ts
  - src/frontend/src/store/useSessionStore.ts
  - src/frontend/src/utils/sessionReset.ts
  - src/frontend/src/layouts/StudyLayout.tsx
  - src/frontend/src/hooks/participant/useResumeSession.ts
---

## Decided
Only `leavePilot` in `src/frontend/src/utils/pilotMode.ts` removes `qualis-pilot-mode`, because the store names are fixed at module load and a flag removed without a full reload runs a real session on `qualis-pilot-*` storage. `resetSession` therefore keeps the flag and recomputes `isPilotMode`, and `useResumeSession` sends a flagged tab to `?mode=test` before its GET. The guard that restores the param is a render-time `<Navigate>` in the outer `StudyLayout`, so no step and no write hook mounts without it.

## Tried and ruled out
The `WelcomePage` else branch was not the only leak: `resetSession` also cleared the flag, so `restoreStudySession` disarmed an unconsented pilot tab that had lost the param, before any guard inside `StudyLayoutContent` could run. A test proved this with the flag read back as null. Using `isPilot()` as the shared read for writes was ruled out because it writes the flag when the URL says test.

## Watch out
Writes must ask `isPilotSession`, which is read-only: the page keeps running between `leavePilot` and the unload, and the pagehide draft flush would re-arm the tab through `isPilot()`. `leavePilot` leaves the store's `isPilotMode` true on purpose. In tests a `useGetStudyConfig` mock must return a stable `refetch`, since it is a dependency of the load effect in `useStudyConfig`; a fresh one each render hangs the worker at full CPU with no output.
