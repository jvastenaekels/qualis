### Implementation Plan: Robust AutoSave & Conflict Resolution

#### Phase 1: Robust Merge Logic (`frontend/src/utils/mergeStudy.ts`)

- [ ] Update `mergeStudyUpdates` to accept a `resolutionStrategy` parameter ('manual' | 'local-wins' | 'server-wins').
- [ ] Implement 'local-wins' strategy:
  - Instead of returning `success: false` on conflict, resolve by keeping the local value.
  - Return `warnings` array alongside `success: true` to indicate which fields were preserved over server changes.
- [ ] Ensure `last_updated_at` is always taken from the server to satisfy optimistic locking for the next save.

#### Phase 2: Enhanced AutoSave Hook (`frontend/src/hooks/useAutoSave.ts`)

- [ ] Update `conflict handling` block:
  - Call `mergeStudyUpdates` with `strategy: 'local-wins'`.
  - Handle `success: true` with `warnings` (Soft Conflict / Auto-Resolved).
  - Show a `toast.info` instead of `toast.error` for auto-resolved conflicts.
  - Properly update `original` (to server state) and `draft` (to merged state) to setup for the next successful save.
- [ ] Add `saveError` state (Circuit Breaker) handling:
  - If retry fails > 3 times, show a persistent UI warning (toast or status bar).
  - Allow manual retry availability.

#### Phase 3: Infinite Loop Prevention & Performance

- [ ] Verify `areStudiesEqual` remains robust against timestamp changes (already confirmed).
- [ ] Verify `useStudyDesigner` selectors are efficient.

#### Phase 4: Verification

- [ ] Test concurrent editing simulation (via mocked 409 responses).
- [ ] Verify "offline -> online" sync behavior.
- [ ] Verify that user workflow is uninterrupted during conflict resolution.
