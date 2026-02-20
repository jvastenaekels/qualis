# Implementation Plan: Branching (Conditional) Questions in Surveys

> **Status: Implemented.** The `visibilityEvaluator.ts` and related files implement the branching logic described in this plan.

This plan outlines the steps required to implement branching logic for pre-sort and post-sort survey questions. Branching allows certain questions to be shown or hidden based on the participant's answers to previous questions.

## 1. Schema Updates

### Frontend Study Schema (`frontend/src/schemas/study.ts`)

- Update `PreSortFieldSchema` to include an optional `visibility_condition` property.
- The `VisibilityCondition` will be defined as:
  ```typescript
  export const VisibilityConditionSchema = z.object({
    depends_on: z.string(), // ID of the parent question
    operator: z.enum([
      "equals",
      "not_equals",
      "contains",
      "greater_than",
      "less_than",
    ]),
    value: z.any(), // Value to compare against
  });
  ```

## 2. Admin Designer (Study Configuration)

### Update Question Item UI (`frontend/src/components/admin/designer/QuestionBuilder.tsx`)

- Add a new "Visibility Logic" section within the `AccordionContent` of each `QuestionItem`.
- **Fields for Logic**:
  - `Parent Question Select`: A dropdown containing all questions that appear _before_ the current question in the list.
  - `Operator Select`: A dropdown for condition operators (`equals`, `not_equals`, etc.).
  - `Value Input`: An input field to specify the value that triggers visibility.
- **Logic Safeguards**:
  - Ensure a question cannot depend on itself or a question that follows it (simplifies dependency resolution).

## 3. Participant Survey UI

### Update Survey Rendering (`frontend/src/pages/PreSortPage.tsx` & `frontend/src/pages/PostSortPage.tsx`)

- **State Tracking**:
  - Use `watch()` from `react-hook-form` to track the values of all survey fields in real-time.
- **Visibility Engine**:
  - Implement a utility function `evaluateCondition(condition, formValues)` to determine if a field should be visible.
  - Apply `evaluateCondition` to each field during render.
- **Dynamic Filtering**:
  - Filter `presortFields` and `postsortFields` before mapping over them to render the UI.
  - In `PostSortPage`, ensure the custom questions section handles hidden fields gracefully.

### Validation Handling

- **Dynamic Schema**:
  - Update the Zod schema generation in both pages to account for visibility.
  - Visible fields follow their configured `required` status.
  - Hidden fields should be automatically marked as `optional()` or skipped in validation to prevent blocking the user.
- **Data Cleanup**:
  - (Optional but recommended) When a field becomes hidden, clear its value in the form state to avoid submitting inconsistent branch data.

## 4. Implementation Steps

### Phase 1: Core Schema & Utilities

1.  Extend `PreSortFieldSchema` in `frontend/src/schemas/study.ts`.
2.  Create `visibilityEvaluator.ts` utility to handle condition logic.

### Phase 2: Designer Enhancements

1.  Update `QuestionBuilder.tsx` to include the "Logic" UI.
2.  Update `useStudyDesigner` store (if necessary) to handle nested updates to the new property.

### Phase 3: Participant UI Integration

1.  Refactor `PreSortPage.tsx` to use `watch()` and the `visibilityEvaluator`.
2.  Refactor `PostSortPage.tsx` similarly for the `questions` section.
3.  Test with various question types (Select, Radio, Checkbox).

## 5. Potential Challenges

- **Multiple Conditions**: For the MVP, we will start with a single parent dependency. Future versions could support `OR`/`AND` logic.
- **Checkbox Groups**: Conditions on checkbox groups need to check if a value is _included_ in the array of selected options.
- **Complex Hierarchies**: Deeply nested branching (A -> B -> C) should work naturally if the visibility check is recursive or re-evaluates on any state change.
