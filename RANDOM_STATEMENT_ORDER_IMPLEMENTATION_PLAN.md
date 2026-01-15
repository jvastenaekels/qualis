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

**Add new field to Study model** (around line 170):
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
1. `StudyBase`: Add `randomize_statement_order: bool = False`
2. `StudyCreate`: Inherit field
3. `StudyUpdate`: Add `randomize_statement_order: Optional[bool] = None`
4. `StudyRead`: Inherit field

**Estimated effort**: 30 minutes

---

### 1.3 API Endpoint Modification

**File**: `backend/app/routers/submissions.py`

**Current logic** (lines 73-85):
```python
statements_data = []
for s in study.statements:  # Database order
    s_trans = next((t for t in s.translations if t.language_code == resolved_lang), None)
    text = s_trans.text if s_trans else s.code
    statements_data.append({"id": s.id, "text": text, "code": s.code})
```

**New logic**:
```python
# Build statements list
statements_data = []
for s in study.statements:
    s_trans = next((t for t in s.translations if t.language_code == resolved_lang), None)
    text = s_trans.text if s_trans else s.code
    statements_data.append({"id": s.id, "text": text, "code": s.code})

# Apply randomization if enabled
if study.randomize_statement_order:
    seed = _generate_session_seed(submission_token)
    random.seed(seed)
    random.shuffle(statements_data)
```

**Add helper function**:
```python
def _generate_session_seed(token: str) -> int:
    """Generate deterministic seed from submission token for reproducible randomization"""
    return int(hashlib.sha256(token.encode()).hexdigest()[:8], 16)
```

**Key decisions**:
- Use submission token as seed source (consistent per participant)
- Shuffle after translation lookup (preserves statement integrity)
- Keep export logic unchanged (still uses ID order)

**Estimated effort**: 2 hours

---

### 1.4 Testing

**File**: `backend/tests/unit/test_routers_submissions.py` (new/existing)

**Test cases**:
1. ✅ Randomization disabled: statements in ID order
2. ✅ Randomization enabled: statements NOT in ID order
3. ✅ Same token: same random order (reproducibility)
4. ✅ Different tokens: different random orders
5. ✅ Export still uses ID order regardless of setting

**File**: `backend/tests/unit/test_export_service.py`

**Update existing test** (line 78):
- Verify export order remains ID-based even with randomization enabled
- Add comment: "Export order is ALWAYS by ID, regardless of randomization setting"

**Estimated effort**: 3-4 hours

---

## Phase 2: Frontend Configuration (Study Designer)

### 2.1 Schema Updates

**File**: `frontend/src/schemas/study.ts`

**Update StudySchema** (around line 50):
```typescript
export const StudySchema = z.object({
    // ... existing fields
    show_statement_codes: z.boolean().optional(),
    randomize_statement_order: z.boolean().optional().default(false),
    // ... other fields
});
```

**Estimated effort**: 15 minutes

---

### 2.2 Study Designer UI

**File**: `frontend/src/pages/StudyDesigner.tsx` (or similar admin component)

**Add toggle control**:
```tsx
<FormField
    control={form.control}
    name="randomize_statement_order"
    render={({ field }) => (
        <FormItem className="flex items-center justify-between">
            <div>
                <FormLabel>{t('study.randomize_statements_label')}</FormLabel>
                <FormDescription>
                    {t('study.randomize_statements_description')}
                </FormDescription>
            </div>
            <FormControl>
                <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                />
            </FormControl>
        </FormItem>
    )}
/>
```

**Location**: In study settings section, near `show_statement_codes`

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
    "study": {
        "randomize_statements_label": "Randomize statement order",
        "randomize_statements_description": "Present statements in random order to each participant (order is consistent within each session)"
    }
}
```

**Estimated effort**: 30 minutes

---

## Phase 3: Frontend Participant Experience

### 3.1 Statement Order Already Handled

**Good news**: The frontend already receives statements from the API and uses them as-is!

**Files that automatically benefit**:
1. **`RoughSortPage.tsx`** (lines 88-92):
   - Filters `config.statements` to show unsorted cards
   - Order already determined by API response
   - **No changes needed**

2. **`FineSortPage.tsx`** (lines 124-149):
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
- `README.md` (if exists)
- User documentation (if exists)

**Document**:
1. Purpose: Reduce order bias in Q-sorts
2. How it works: Randomized per participant, consistent within session
3. Export behavior: Always in defined order for analysis
4. When to use: Studies where statement order might influence sorting

**Estimated effort**: 1-2 hours

---

## Phase 5: Optional Enhancements (Future Considerations)

### 5.1 Advanced Randomization Options

**Potential future features** (not in initial scope):
- Block randomization (randomize within statement groups)
- Configurable seed strategy (date-based, study-based, etc.)
- Randomization analytics (track which statements appeared first/last)

### 5.2 Admin Analytics

**Potential additions**:
- Dashboard showing randomization status per study
- Export field indicating randomization setting
- Participant-level order tracking (for debugging)

---

## Implementation Timeline & Effort Estimate

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| **Phase 1** | Backend (DB, API, Tests) | 6-8 hours |
| **Phase 2** | Frontend Config (Designer, i18n) | 2-3 hours |
| **Phase 3** | Frontend Verification | 2 hours |
| **Phase 4** | Export Testing & Docs | 2-3 hours |
| **Total** | | **12-16 hours** |

---

## Risk Assessment & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Export compatibility broken** | High | Preserve existing export logic; add regression tests |
| **Inconsistent order within session** | Medium | Use token-based seeding; add reproducibility tests |
| **Performance degradation** | Low | Shuffling is O(n); negligible for typical statement counts (30-80) |
| **Backward compatibility** | Low | Default to `False`; existing studies unaffected |

---

## Testing Strategy Summary

### Unit Tests
- ✅ Backend randomization logic
- ✅ Seed generation reproducibility
- ✅ Export order preservation
- ✅ Schema validation

### Integration Tests
- ✅ Full participant flow (presort → rough → fine → postsort)
- ✅ Multiple participants in same study
- ✅ Session resumption

### Manual QA
- ✅ Study designer UI
- ✅ Different browsers/devices
- ✅ Localization accuracy

---

## Critical Files Reference

### Backend
- `backend/app/models.py` (line 150-195): Study model
- `backend/app/schemas.py`: API schemas
- `backend/app/routers/submissions.py` (line 31-109): Statement delivery endpoint
- `backend/app/services/export_service.py`: Export logic (DO NOT modify)

### Frontend
- `frontend/src/schemas/study.ts`: TypeScript types
- `frontend/src/pages/RoughSortPage.tsx` (line 88-98): Rough sort display
- `frontend/src/pages/FineSortPage.tsx` (line 124-149): Fine sort display
- `frontend/src/pages/StudyDesigner.tsx`: Admin configuration UI

### Tests
- `backend/tests/unit/test_export_service.py` (line 78): Export order test
- `backend/tests/unit/test_routers_submissions.py`: API tests

---

## Recommendation

This implementation plan prioritizes:
1. **Simplicity**: Minimal code changes, leveraging existing architecture
2. **Safety**: Export compatibility maintained, backward compatible
3. **Reproducibility**: Deterministic per-participant randomization
4. **Testability**: Comprehensive test coverage at each phase

**Suggested approach**: Implement phases sequentially, with full testing after each phase before proceeding to the next.
