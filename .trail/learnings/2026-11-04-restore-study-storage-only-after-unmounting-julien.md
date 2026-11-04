---
title: Restore study storage only after unmounting the outgoing participant subtree
author: Julien
date: 2026-11-04
branch: fix/bug-hunt-session-integrity
id: l-e4db8f79
scope: repo
status: active
src: agent
touches:
  - ".release-please-manifest.json"
  - CHANGELOG.md
  - CITATION.cff
  - openapi.json
  - package-lock.json
  - package.json
  - src/backend/app/models/participant.py
  - src/backend/app/routers/participants.py
  - src/backend/app/schemas/participants.py
  - src/backend/app/services/export_service.py
---

## Decided
In `src/frontend/src/layouts/StudyLayout.tsx`, gate the participant subtree by the ready study slug before restoring the destination session. An A→B→A navigation must preserve A's persisted answers and token. `restoreStudySession` resets in-memory stores with storage writes paused, then synchronously hydrates both session and response stores; outgoing autosave cleanup explicitly retains its own study scope.

## Tried and ruled out
Resetting stores from an effect inside the mounted participant content erased the destination's persisted state and allowed outgoing autosave effects to write under the new route. Clearing config unconditionally during restoration also broke AppRouter's consent redirects: retain config when it already belongs to the destination. Mounted layout and resume tests cover these interactions; isolated store tests alone did not catch them.

## Watch out
`?mode=test` must survive restoration so pilot sessions are not submitted as real participation. Resume must hydrate the server's draft revision before autosave increments it. The draft revision watermark rejects older delayed writes, but withdrawal is not a generation fence: a previously unseen higher revision already in flight can still recreate a withdrawn draft. Closing that separate race requires a protocol change, not resetting the watermark.
