# Open-Q AI-First Development Guidelines

## 1. Philosophy: The Agent-First Paradigm

**Open-Q is an "Agent-First" project.** This means the codebase is optimized for generation, reading, and refactoring by Large Language Models (LLMs) under human supervision.

Unlike traditional development where code is optimized for human brevity, here **we prioritize explicitness, strict typing, and deductive logic.** We avoid "magic" behavior, implicit state, or dynamic metaprogramming that creates hallucinations in AI reasoning.

### Core Principles

1.  **Type-Driven Development (TyDD):** Types are the prompt. Define the shape of data (Pydantic/TypeScript Interfaces) _before_ writing any logic.
2.  **Contract-First Architecture:** The OpenAPI schema is the single source of truth. The frontend never guesses endpoints; it consumes generated clients.
3.  **Inverse TDD (Specification by Failure):** Tests describe the intent. We write the test case first to define the "Definition of Done" for the agent.

---

## 2. Backend Guidelines (Python/FastAPI)

We use **Python 3.13+** with strict adherence to type hinting.

### 2.1 Typing & Pydantic

- **No `Any`:** Every variable, argument, and return value must have a strict type.
- **Pydantic Models as Logic Containers:** Do not pass raw dictionaries. Use Pydantic schemas for all data moving through layers.
- **Explicit Returns:** Every function must declare its return type (e.g., `def get_user() -> UserRead:`).

### 2.2 SQLAlchemy & Database

- **Asynchronous Core:** We use `ext.asyncio` with `AsyncSession` for high-concurrency performance.
- **Explicit Relationships:** Define foreign keys and relationships explicitly in models. Avoid implicit joins.

### 2.3 Style & Structure

- **No "Magic" Methods:** Avoid `__getattr__`, `__setattr__`, or dynamic class generation. Agents struggle to trace these.
- **Service Layer Pattern:** Logic resides in `services/`, not in `routers/`. Routers only handle HTTP Request/Response mapping.
- **Sentence Case:** Use "Sentence case" for all logging messages and error descriptions (e.g., "User not found in database", not "User Not Found").

---

## 3. Frontend Guidelines (React/TypeScript)

We use **React 19+** with **TypeScript** in strict mode.

### 3.1 The "Generated Client" Rule

- **Zero Manual Fetching:** Do not use `fetch` or `axios` directly.
- **Workflow:**
  1.  Update Backend Pydantic Schema.
  2.  Update Backend Router.
  3.  Run `./export_openapi.py`.
  4.  Run Frontend generator (Orval) to update hooks.
  5.  Use the generated hook (e.g., `useGetStudyQuery`).

### 3.2 Component Philosophy

- **Logic Extraction:** Complex logic (sorting algorithms, matrix validation) must be extracted into custom hooks (`useGridCalculation.ts`) and tested in isolation via Vitest.
- **Dumb Components:** UI components should receive data via props and emit events. They should contain minimal business logic.
- **Tailwind CSS:** Use utility classes. Avoid CSS-in-JS complexities unless necessary for dynamic values.

---

## 4. The "Inverse TDD" Workflow

When contributing a new feature, follow this sequence to minimize hallucination:

1.  **Phase 1: The Contract (Human or Agent)**
    - Define the Interface (Pydantic Schema or TS Type).
    - _Example:_ Define `class SortSubmission(BaseModel): ...`

2.  **Phase 2: The Trap (Human)**
    - Write a failing test case that asserts the business rule.
    - _Example:_ "Ensure a user cannot submit a Q-Sort if 2 cards are missing."

3.  **Phase 3: The Generation (Agent)**
    - Implement the logic to satisfy the Type signature and pass the Test.

---

## 5. Domain Knowledge: Q-Methodology

_Context for the Agent:_
Open-Q implements **Q-Methodology**, a research method used in psychology and social sciences to study human subjectivity. Unlike standard surveys (R-methodology) that treat people as variables, Q-methodology treats _items_ as variables and people as the correlation matrix (Inverted Factor Analysis).

### 5.1 The Core Mechanism: Forced Distribution

- **The Grid (Q-Grid):** Users must sort items (statements) into a fixed grid shaped like a normal distribution (Bell curve).
- **Ipsative Data:** The data is relative, not absolute. Placing a card in the "+3" slot forces another card out. A card's value is defined solely by its relationship to other cards in that specific user's sort.
- **Validation Rule:** A Q-Sort is mathematically invalid and **cannot be submitted** unless every single slot in the grid is filled with exactly one card. There are no "missing values" allowed in the grid.

### 5.2 The User Workflow (Stages)

The application must guide the participant through strictly ordered stages. The Agent must preserve this linearity:

1.  **Introduction & Consent:** Legal and instructional context.
2.  **Rough Sort (Presort):** A cognitive easing step. Users drag cards into three buckets: "Agree", "Disagree", and "Neutral". This reduces cognitive load before the grid.
3.  **Fine Sort (The Grid):** The core task. Users move cards from the three buckets into the specific slots of the Q-Grid.
4.  **Post-Sort Survey:** Standard Likert/Text questions to contextualize the sort (e.g., "Why did you place Card X at +3?").
5.  **Submission:** Final hashing and storage.

### 5.3 Key Terminology

- **Concourse:** The full set of possible statements about a topic.
- **Q-Set:** The selected subset of statements presented to the participant (the cards).
- **P-Set:** The participants.
- **Condition of Instruction:** The specific prompt given to the user (e.g., "Sort these cards based on how you feel _right now_").

---

## 6. Documentation Standards

We strictly adhere to the **Diátaxis Framework**. All documentation must fall into one of four quadrants. Do not mix them.

### 6.1 Structure & Location

- **Tutorials (`docs/tutorials/`):** Lesson-oriented. Learning by doing.
  - _Goal:_ Guide the user through a specific project to achieve a tangible result.
  - _Tone:_ Instructional, hand-holding. "Let's build X."
- **How-To Guides (`docs/guides/`):** Problem-oriented. Steps to solve a specific problem.
  - _Goal:_ Show how to perform a specific task (e.g., "How to export data to CSV").
  - _Tone:_ Practical, concise. "Run command Y."
- **Reference (`docs/reference/`):** Information-oriented. Technical descriptions.
  - _Goal:_ Describe the machinery (API Endpoints, Component Props, Configuration variables).
  - _Tone:_ Dry, accurate, exhaustive.
- **Explanation (`docs/explanation/`):** Understanding-oriented. Theoretical background.
  - _Goal:_ Explain _why_ things are the way they are (Architecture decisions, Q-Methodology theory).
  - _Tone:_ Discursive, clarifying.

### 6.2 Writing Rules

- **Language:** US English.
- **Updates:** Any code change affecting functionality MUST be accompanied by a documentation update in the relevant quadrant.

---

## 7. Quality Assurance & Definition of Done

We practice **Rigorous CI (Continuous Integration)**. No code is considered "complete" until it passes the full CI suite locally.

### 7.1 The Golden Rule: `make ci`

Before submitting any changes or marking a task as done, you typically must run the full quality suite via the Makefile.

- **Command:** `make ci` (or equivalent in the environment).
- **What it entails:**
  1.  **Linting:** `ruff` (backend) and `biome` (frontend) checks for code style and potential errors.
  2.  **Type Checking:** `mypy` (backend) and `tsc` (frontend) ensure strict typing compliance.
  3.  **Unit Tests:** `pytest` (backend) and `vitest` (frontend) validate logic isolation.
  4.  **Integration Tests:** API contract tests to ensure backend/frontend alignment.

### 7.2 Testing Strategy

- **Frontend:** prefer `vitest` for logic/hooks and `testing-library` for component interactions. Avoid testing implementation details; test user behavior.
- **Backend:** Use `pytest` with `conftest.py` fixtures. Database tests must use transactions that roll back after each test to ensure a clean state.
- **E2E:** `playwright` tests are for critical paths (happy path) only, due to execution time.

### 7.3 Automated Checks

The repository enforces these checks via GitHub Actions. **Do not ignore local failures** expecting CI to fix them. If `make ci` fails locally, it _will_ fail in production.
