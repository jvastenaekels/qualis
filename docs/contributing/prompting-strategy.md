# Prompting Strategy & Agent Workflows

Use these templates when interacting with the codebase via an AI Agent (Google Antigravity, Claude, Cursor, etc.).

## 1. Context Loading (Start of Session)

_Use this prompt to prime the agent when starting a new session._

> "We are working on **Open-Q**, a Q-Methodology platform (FastAPI/React).
>
> **Core Guidelines:**
>
> 1.  **Type-First:** We define Pydantic schemas and TS Interfaces before logic.
> 2.  **Inverse TDD:** We write the failing test defining the constraints first.
> 3.  **Domain:** Respect strict Q-sort forced distribution rules (Bell curve).
> 4.  **No Magic:** Explicit code over concise/implicit code.
>
> Acknowledge this context before receiving the first task."

## 2. Backend: New Feature (The "Architect-Builder" Flow)

_Do not ask the agent to do everything at once. Split it into two phases._

**Phase 1: The Architect (Definition)**

> "Act as a Senior Backend Architect. I need to implement **[Feature Name]**.
>
> **Task:**
>
> 1.  Define the strict Pydantic models in `backend/app/schemas.py`. No `Any` types allowed.
> 2.  Define the API endpoint signature in `backend/app/routers/`.
> 3.  **Crucial:** Write a failing integration test in `backend/tests/integration/` that strictly asserts the business rule. The test must fail because the logic is not implemented yet.
>
> **STOP. Do NOT implement the service logic yet.** Just provide the Types and the Test."

**Phase 2: The Builder (Implementation)**

> "The test is correctly failing (Red state). Now, implement the business logic in `backend/app/services/` to satisfy the Pydantic contract and make the integration test pass (Green state).
>
> **Constraints:**
>
> - Use synchronous SQLAlchemy.
> - Raise specific HTTP exceptions defined in the schema."

## 3. Frontend: Participant Experience (Mobile-First)

_Use this when working on the public-facing Q-Sort interface (Welcome, Sort Stages, Submission)._

> "Act as a **Senior Frontend Engineer (UX Specialist)**. I need to implement/modify the **[Participant Feature, e.g., 'Rough Sort Drag Logic']**.
>
> **Context:** This interface is used by participants on mobile devices.
> **Constraints:**
>
> 1.  **Mobile-First:** Design CSS for mobile screens first, then `md:`/`lg:` breakpoints.
> 2.  **Touch Targets:** All interactive elements must be at least 44x44px.
> 3.  **No Blocking:** Animations (Framer Motion) must not block the main thread.
> 4.  **Local Persistence:** State must persist on refresh (using the appropriate Context/Store).
>
> **Task 1 (Definition):**
>
> - Define the Component Props interface.
> - Write a **Vitest** unit test (`.interactions.test.tsx`) simulating a touch event (drag start -> drop).
> - **STOP.** Do not implement the component yet."

## 4. Frontend: Admin Dashboard (Data-Heavy)

_Use this for the researcher interface where data correctness is paramount._

> "Act as a **Senior React Developer**. I need to build the **[Admin Feature, e.g., 'Study Participants Table']**.
>
> **Context:** Admin dashboard for managing research data.
> **Stack:** React Table (TanStack), Shadcn/UI components, Orval generated hooks.
>
> **Protocol:**
>
> 1.  **Schema Match:** Check `frontend/src/api/model` to ensure we have the correct types from the backend.
> 2.  **Mocking:** Create a mock data object that strictly adheres to the API type.
> 3.  **The Trap (Test):** Write a test using `testing-library` that:
>     - Renders the component with the mock data.
>     - Asserts that a specific column (e.g., 'Email') is visible.
>     - Asserts that the 'Loading' skeleton appears before data arrives.
>
> **Task:** Provide the Type check and the Test only."

## 5. Integration: Wiring Frontend to Backend

_Use this when the backend is done and you need to connect the UI._

> "The Backend endpoint is ready and `openapi.json` is updated.
>
> **Task:**
>
> 1.  Run the generator command (simulated) to acknowledge the new hooks in `frontend/src/api/generated.ts`.
> 2.  Refactor **[Component Name]** to replace the local mock data with the `use[Feature]Query` hook.
> 3.  **Crucial:** Implement proper error handling. If the API returns 4xx/5xx, the UI must show a user-friendly `Alert` component, not crash.
> 4.  Update the integration test to mock the network response (MSW) rather than component props."

## 6. Refactoring Safe-Guard

_Use this to prevent regressions during refactoring._

> "I need to refactor **[File/Function]** to improve **[Readability/Performance]**.
>
> **Protocol:**
>
> 1.  First, analyze the existing code and create a new test case that covers the current behavior exhaustively (Snapshot testing is acceptable here).
> 2.  Run the test to confirm it passes.
> 3.  Refactor the code.
> 4.  Prove that the behavior hasn't changed by running the test again."

## 7. Debugging Assistant

_Use this when fixing bugs._

> "I have a bug in **[Feature]**.
> **Observation:** [Error log or description].
>
> **Task:**
>
> 1.  Do not fix the code yet.
> 2.  Write a reproduction test case in **[Existing Test File]** that explicitly fails due to this bug.
> 3.  Explain the root cause.
> 4.  Implement the fix to make the test pass."
