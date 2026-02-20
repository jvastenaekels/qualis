# Backend Robustness and Data Integrity Implementation Plan

> **Status: Mostly Implemented.** Most P0 items (constraints, row locking) have been implemented. This plan is retained for reference.

## Executive Summary

The Libre-Q backend is built on a solid architectural foundation using FastAPI, async SQLAlchemy, and PostgreSQL. It demonstrates strong security practices (RBAC, JWT, 2FA) and proper separation of concerns. However, a comprehensive analysis has identified critical gaps in transaction management, database limits, and validation logic that pose significant risks to data integrity and system reliability.

This document outlines a phased implementation plan to address these findings, prioritizing immediate data integrity risks (P0) before moving to robustness improvements (P1/P2).

---

## Phase 1: Critical Data Integrity (Week 1)

**Objective**: Eliminate immediate risks of data corruption and race conditions. These are "stop the bleeding" fixes that require database migrations or critical logic patches.

### 1. Enforce Statement Code Uniqueness (P0)

**Problem**: `Statement.code` has no unique constraint within a study, allowing duplicates that break data exports and analysis.
**Action**:

- create Alembic migration to add unique constraint `uq_statement_code` on `(study_id, code)`.
- **File**: `backend/app/models.py`
- **Verification**: Try inserting duplicate codes in a test; ensure DB rejects it.

### 2. Fix Recruitment Service Race Conditions (P0)

**Problem**: `increment_usage()` and `record_start()` lack commits and row locking, leading to lost updates under load (e.g., participants exceeding capacity).
**Action**:

- Rewrite methods to use `select(...).with_for_update()`.
- Ensure `db.flush()` is called after updates.
- **File**: `backend/app/services/recruitment_service.py`

### 3. Secure Grid Configuration Updates (P0)

**Problem**: Changing `grid_config` on a study with existing participants (even in Draft) invalidates submission data. The current check calculates `has_participants` but ignores the result.
**Action**:

- In `update_study`, if `grid_config` changes, check for existing participants.
- Raise `400 Bad Request` if participants exist, preventing the update.
- **File**: `backend/app/routers/admin/studies.py`

### 4. Database-Level Score Validation (P0)

**Problem**: `QSortEntry.grid_score` accepts any integer, risking invalid data (e.g., score 999).
**Action**:

- Create Alembic migration to add CHECK constraint `chk_grid_score_range` (`-10 <= grid_score <= 10`).
- **File**: `backend/app/models.py`

### 5. Secure Recruitment Link Deletion (P0)

**Problem**: The `DELETE /links/{id}` endpoint lacks authorization checks for the study owner/editor.
**Action**:

- Add `check_study_permission(StudyRole.editor)` dependency (requires fetching link's study first or using a service method that checks permissions).
- **File**: `backend/app/routers/admin/recruitment.py`

---

## Phase 2: Transaction Safety (Week 2)

**Objective**: Ensure atomic operations to prevent partial data writes (orphaned records).

### 1. Implement Global Transaction Handling (P0)

**Problem**: Routers often perform multiple `db.add()`/`db.flush()` calls followed by a final `db.commit()` without `try/except` blocks. If the commit fails, no rollback occurs, potentialy leaving the session in a bad state (though request isolation helps, explicit rollback is safer and allows custom error handling).
**Action**:

- Wrap complex router logic in `try: ... except IntegrityError: ... except Exception: ...` blocks.
- Ensure `await db.rollback()` is called on error.
- **Targets**:
  - `backend/app/routers/admin/studies.py` (Study creation/update)
  - `backend/app/routers/admin/workspaces.py`
  - `backend/app/routers/auth.py`

### 2. Atomic Q-Sort Entry Management (P1)

**Problem**: Q-sort submission involves deleting old entries and adding new ones. If the commit fails after deletion, data is lost.
**Action**:

- Ensure the delete-then-insert flow happens within a single transaction scope.
- **File**: `backend/app/services/study_service.py`

### 3. Enhance Error Logging (P1)

**Problem**: Generic exception handlers often swallow stack traces or fail to log context.
**Action**:

- Add structured logging to all exception handlers.
- Log error type, user ID, and relevant resource IDs (Study ID, etc.).

---

## Phase 3: Data Quality & Validation (Month 1)

**Objective**: Prevent "garbage in" and ensure exports are reliable.

### 1. JSON Schema Validation (P1)

**Problem**: `grid_config` and `presort_config` are stored as raw JSON without strict schema enforcement.
**Action**:

- Define Pydantic models for these configurations.
- Validate incoming JSON against these models _before_ saving to the DB.
- **Files**: `backend/app/schemas.py`, `backend/app/models.py`

### 2. Export Data Consistency (P1)

**Problem**: Missing Q-sort entries default to 0 in exports, which is indistinguishable from a legitimate 0 score.
**Action**:

- Differentiate missing data (NULL or specific flag) from legitimate zero scores in logic.
- **File**: `backend/app/services/export_service.py`

### 3. Date Range & Comment Validation (P2)

**Action**:

- Add validator: `end_date` must be > `start_date`.
- Limit `card_comment` length (e.g., 5000 chars) to prevent DB bloat/DoS.
- **File**: `backend/app/models.py`, `backend/app/schemas.py`

---

## Phase 4: Robustness & Performance (Quarter 1)

**Objective**: Improve system observability and scalability.

### 1. Constraints on Study Complexity (P2)

**Action**:

- Warn if statement count < 10.
- Error if statement count > 500.
- Enforce business rules during the "Validate for Activation" step.
- **File**: `backend/app/services/study_service.py`

### 2. State Transition Audit Trail (P3)

**Action**:

- Log state changes (Draft -> Active) to a history table or JSON audit log field.
- **File**: `backend/app/routers/admin/studies.py`

### 3. Database Indexing (P3)

**Action**:

- Add indices for commonly filtered fields: `Participant.status`, `Participant.is_discarded`.
- **File**: `backend/app/models.py` (via Alembic)

---

## Summary of Priority "P0" Tasks (Immediate Start)

1.  **Add `uq_statement_code` constraint**.
2.  **Add row locking** to `RecruitmentService`.
3.  **Fix Logic** in `update_study` to check for participants before grid changes.
4.  **Add `chk_grid_score_range` constraint**.
5.  **Securitize** `delete_link` endpoint.
