# Implementation Plan: Optional Random Statement Order

## Overview

Open-Q is a Q-methodology application where participants sort statements along a distribution grid. Currently, statements are presented in **database ID order** (ascending). This plan adds an **optional** randomization feature that:

- ✅ Maintains per-participant consistency (same order throughout their session)
- ✅ Preserves export compatibility (exports remain in ID order)
- ✅ Works across all sorting stages (Rough Sort, Fine Sort, Post-Sort)
- ✅ Is backward compatible (disabled by default)

---

## Phase 1: Backend Foundation (Database & API)

### 1.1 Database Schema Changes

**File**: `backend/app/models.py`

**Add new field to Study model** (after `show_statement_codes` or equivalent configuration fields, approx line 200):

```python
randomize_statement_order: Mapped[bool] = mapped_column(
    Boolean,
    default=False,
    nullable=False
)
```

**Migration needed**:

- Create Alembic migration to add column
- Set default value `FALSE` for existing studies
- Make non-nullable after backfill

**Estimated effort**: 1-2 hours

---

### 1.2 Schema Updates

**Files**:

- `backend/app/schemas.py`

**Update schemas**:

1. `StudyBase` (approx line 348): Add `randomize_statement_order: bool = False`
2. `StudyCreate`: Inherit field (automatic)
3. `StudyUpdate` (approx line 382): Add `randomize_statement_order: bool | None = None`
4. `StudyRead`: Inherit field (automatic)

**Estimated effort**: 30 minutes

---

### 1.3 Service Logic Implementation

**File**: `backend/app/services/study_service.py`

**Current logic** (`get_resolved_study_config`, approx line 243):

- Currently fetches statements and sorts/processes them.
- Logic delegates to `StudyService` from `get_study` router.

**New logic in `get_resolved_study_config`**:

```python
# After resolving statements/translations
statements_data = []
# ... (existing loop to build statement list)

# Apply randomization if enabled
if study.randomize_statement_order and session_token:
    seed = self._generate_session_seed(str(session_token))
    random.seed(seed)
    random.shuffle(statements_data)
```

**Add helper method**:

```python
@staticmethod
def _generate_session_seed(token: str) -> int:
    """Generate deterministic seed from submission token for reproducible randomization"""
    return int(hashlib.sha256(token.encode()).hexdigest()[:8], 16)
```

**Key decisions**:

- Logic resides in Service layer, not Router
- Use `session_token` as seed source (consistent per participant)
- Shuffle after translation lookup (preserves statement integrity)
- Keep export logic unchanged (still uses ID order)

**Estimated effort**: 2 hours

---

### 1.4 Testing

**File**: `backend/tests/unit/test_services_study.py` (or create if missing) & `backend/tests/unit/test_routers_submissions.py`

**Test cases**:

1. ✅ Randomization disabled: statements in ID order
2. ✅ Randomization enabled: statements NOT in ID order
3. ✅ Same token: same random order (reproducibility)
4. ✅ Different tokens: different random orders
5. ✅ Export still uses ID order regardless of setting

**File**: `backend/tests/unit/test_export_service.py`

**Update existing test**:

- Verify export order remains ID-based even with randomization enabled
- Add comment: "Export order is ALWAYS by ID, regardless of randomization setting"

**Estimated effort**: 3-4 hours

---

## Phase 2: Frontend Configuration (Study Designer)

### 2.1 Schema Updates

**File**: `frontend/src/schemas/study.ts`

**Update StudyConfigSchema** (approx line 112):

```typescript
export const StudyConfigSchema = z.object({
  // ... existing fields
  show_statement_codes: z.boolean().optional(),
  randomize_statement_order: z.boolean().optional().default(false),
  // ... other fields
});
```

**Estimated effort**: 15 minutes

---

### 2.2 Study Designer UI

**File**: `frontend/src/components/admin/designer/QSortEditor.tsx`

**Add toggle control**:
In the **Research Settings** card (Statements tab), below the "Show Statement Codes" toggle (approx lines 653-674).

```tsx
<div className="flex items-center justify-between py-4 border-t border-slate-100">
  <div className="space-y-1">
    <Label
      htmlFor="randomize-stmts"
      className="text-sm font-bold text-slate-700"
    >
      {t("admin.design.qsort.settings.randomize")}
    </Label>
    <p className="text-xs font-medium text-slate-500 max-w-md leading-relaxed">
      {t("admin.design.qsort.settings.randomize_desc")}
    </p>
  </div>
  <Switch
    id="randomize-stmts"
    checked={draft.randomize_statement_order ?? false}
    onCheckedChange={(checked: boolean) => {
      updateDraft((d) => {
        d.randomize_statement_order = checked;
      });
    }}
  />
</div>
```

**Estimated effort**: 1-2 hours

---

### 2.3 Localization

**Files**:

- `frontend/public/locales/en/translation.json`
- `frontend/public/locales/fr/translation.json`
- `frontend/public/locales/fi/translation.json`

**Add translations**:

```json
{
  "admin": {
    "design": {
      "qsort": {
        "settings": {
          "randomize": "Randomize statement order",
          "randomize_desc": "Present statements in random order to each participant (consistent within session)"
        }
      }
    }
  }
}
```

**Estimated effort**: 30 minutes

---

## Phase 3: Frontend Participant Experience

### 3.1 Statement Order Already Handled

**Good news**: The frontend already receives statements from the API and uses them as-is!

**Files that automatically benefit**:

1. **`RoughSortPage.tsx`**:
   - Filters `config.statements` to show unsorted cards
   - Order already determined by API response
   - **No changes needed**

2. **`FineSortPage.tsx`**:
   - Groups statements by rough sort category
   - Within each group, uses existing order
   - **No changes needed**

3. **`PostSortPage.tsx`**:
   - References statements from sorted data
   - **No changes needed**

**Why this works**: The API endpoint (`/api/study/{slug}`) returns the statements array, which is shuffled on the backend. Frontend components consume this array without assuming any particular order.

**Estimated effort**: 0 hours (verification only)

---

### 3.2 Verification & Edge Cases

**Manual testing checklist**:

1. ✅ Rough Sort: Cards appear in randomized order
2. ✅ Refresh during rough sort: Same order maintained
3. ✅ Fine Sort: Deck shows statements in random order
4. ✅ Post-Sort: Comments reference correct statements
5. ✅ Multiple participants: Different orders
6. ✅ Same participant (resume): Same order

**Estimated effort**: 2 hours

---

## Phase 4: Data Export & Analytics

### 4.1 Verify Export Integrity

**File**: `backend/app/services/export_service.py`

**Current behavior** (to preserve):

- Exports always sort by `statement.id` ASC
- Column headers use statement codes in ID order
- No changes needed to export logic

**Verification**:

- Run existing test: `test_export_service.py::test_statement_order_in_export`
- Add new test case with randomization enabled

**Estimated effort**: 1 hour

---

### 4.2 Documentation Updates

**Files**:

- `docs/guides/deployment.md` or similar user guide

**Document**:

1. Purpose: Reduce order bias in Q-sorts
2. How it works: Randomized per participant, consistent within session
3. Export behavior: Always in defined order for analysis
4. When to use: Studies where statement order might influence sorting

**Estimated effort**: 1-2 hours

---

## Implementation Timeline & Effort Estimate

| Phase       | Tasks                            | Estimated Time  |
| ----------- | -------------------------------- | --------------- |
| **Phase 1** | Backend (DB, API, Tests)         | 6-8 hours       |
| **Phase 2** | Frontend Config (Designer, i18n) | 2-3 hours       |
| **Phase 3** | Frontend Verification            | 2 hours         |
| **Phase 4** | Export Testing & Docs            | 2-3 hours       |
| **Total**   |                                  | **12-16 hours** |

---

## Testing Strategy Summary

### Unit Tests

- ✅ Backend randomization logic (`StudyService`)
- ✅ Seed generation reproducibility
- ✅ Export order preservation
- ✅ Schema validation

### Integration Tests

- ✅ Full participant flow (presort → rough → fine → postsort)
- ✅ Multiple participants in same study
- ✅ Session resumption

### Manual QA

- ✅ Study designer UI (`QSortEditor`)
- ✅ Different browsers/devices
- ✅ Localization accuracy

---

## Critical Files Reference

### Backend

- `backend/app/models.py` (approx line 147+): Study model
- `backend/app/schemas.py` (approx line 348+): Study schemas
- `backend/app/services/study_service.py`: Logic implementation (`get_resolved_study_config`)
- `backend/app/services/export_service.py`: Export logic (DO NOT modify)

### Frontend

- `frontend/src/schemas/study.ts`: TypeScript types (`StudyConfigSchema`)
- `frontend/src/components/admin/designer/QSortEditor.tsx` (approx line 650+): Visual editor UI
- `frontend/src/pages/RoughSortPage.tsx`: Rough sort display
- `frontend/src/pages/FineSortPage.tsx`: Fine sort display

### Tests

- `backend/tests/unit/test_export_service.py`: Export order test
- `backend/tests/unit/test_services_study.py` (new/existing): Service tests

---

## Recommendation

This implementation plan prioritizes:

1. **Simplicity**: Minimal code changes, leveraging existing architecture
2. **Safety**: Export compatibility maintained, backward compatible
3. **Reproducibility**: Deterministic per-participant randomization
4. **Testability**: Comprehensive test coverage at each phase

**Suggested approach**: Implement phases sequentially, with full testing after each phase before proceeding to the next.
