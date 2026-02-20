# Implementation Plan: Friendly Optimistic Locking

> **Status: Partially Implemented.** The `updated_at` / `last_updated_at` fields exist in models and schemas. Full conflict resolution UI is not yet complete.

## Objective

Implement robust optimistic locking to prevent data loss during concurrent editing of Studies, while maintaining a seamless ("super-friendly") user experience by minimizing interruptions and automatically merging non-conflicting changes.

## Problem

Currently, the "Last-Write-Wins" strategy causes silent data loss if two users edit a study simultaneously. The latest save overwrites the entire state, erasing changes made by others.

## Proposed Solution

We will implement **Optimistic Locking with Client-Side Merging**.

1.  **Backend Guard**: Rejects updates based on stale data.
2.  **Auto-Merge**: The client attempts to intelligently merge remote changes with local changes.
3.  **Conflict Resolution**: Only interrupts the user when an automatic merge is impossible.

---

## Step 1: Backend Database & Models (Migration)

**Goal**: Track the version of each study record.

1.  **Create Migration Script**:
    - Add `updated_at` (DateTime, timezone=True) to the `studies` table.
    - Set default to `func.now()`.
    - Update `onupdate=func.now()` to ensure it changes automatically on DB writes.
2.  **Update `Study` Model**:
    - Add the `updated_at` field to `backend/app/models.py`.

## Step 2: Backend API Update

**Goal**: Enforce version checks and provide data for merging.

1.  **Update `StudyUpdate` Schema**:
    - Add optional `last_updated_at` field to `StudyUpdate` in `schemas.py`.
2.  **Modify `update_study` Endpoint** (`backend/app/routers/admin/studies.py`):
    - Check: `if payload.last_updated_at and study.updated_at > payload.last_updated_at`.
    - **On Conflict**:
      - Raise `HTTPException(409, detail="Conflict")`.
      - CRITICAL: The exception response MUST include the **current server version** of the study. This allows the frontend to merge immediately without a second request. ( _Note: FastAPI `HTTPException` doesn't easily return a body. We might need to return a `JSONResponse` with status 409 and the study body._ )

## Step 3: Frontend Store Updates

**Goal**: Track synchronization state.

1.  **Update `StudyDesignerState`** (`frontend/src/store/useStudyDesigner.ts`):
    - Ensure `original` (the server state) always includes the `updated_at` timestamp.
    - Add a `mergeSolution` state to handle the conflict resolution UI if needed.

## Step 4: Intelligent Auto-Merge Logic (The "Friendly" Part)

**Goal**: Resolve conflicts without bothering the user whenever possible.

1.  **Create `utils/mergeStudy.ts`**:
    - Function `mergeStudies(localDraft, serverState, originalBaseline)`:
      - **Three-way merge**: Compare Local vs Baseline AND Server vs Baseline.
      - **Scenario A (Safe)**: Server changed `Title`, User changed `Grid`. -> Result: Apply Server's Title to Local Draft. Return `success: true`.
      - **Scenario B (Safe - Arrays)**: Server added `Statement 30`, User added `Statement 31` (different codes). -> Result: Combine lists. Return `success: true`.
      - **Scenario C (Conflict)**: Server changed `Title` to "A", User changed `Title` to "B". -> Result: Return `success: false, conflicts: ['title']`.

## Step 5: Update `useAutoSave` Hook

**Goal**: Handle the save loop including retry logic.

1.  **Catch 409 Errors**:
    - In the `updateMutation.onError` or `catch` block:
    - Extract `serverState` from the 409 response.
    - Run `mergeStudies(draft, serverState, original)`.
2.  **Handle Merge Outcome**:
    - **If Success**: Update `draft` with the merged result, update `updated_at` timestamp, and **immediately retry the save**. (User sees a toast: "Synced with latest changes").
    - **If Conflict**: Set `syncStatus` to error, trigger the "Conflict Resolution Modal".

## Step 6: Conflict Resolution UI

**Goal**: A nice UI for the inevitable hard conflicts.

1.  **Create `ConflictResolutionModal.tsx`**:
    - Show side-by-side comparison of the conflicting fields.
    - Buttons: "Keep My Version", "Accept Server Version".
    - On resolve: Update draft, update timestamp, retry save.

---

## Task Breakdown

- [ ] **Backend**: Create alembic migration for `updated_at`.
- [ ] **Backend**: Update `Study` model and `StudyUpdate` schema.
- [ ] **Backend**: Refactor `update_study` to handle concurrency and return 409 with data.
- [ ] **Frontend**: Create `mergeStudy.ts` utility (Test Driven Development recommended).
- [ ] **Frontend**: Update `useAutoSave.ts` to handle 409s and retry.
- [ ] **Frontend**: Implement `ConflictResolutionModal.tsx`.
