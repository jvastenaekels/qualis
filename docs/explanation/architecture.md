# Qualis Architecture

This document describes the technical architecture, design choices, and data flow of the Qualis platform.

---

## System Architecture

Qualis follows a decoupled **Client-Server** architecture with clear separation of concerns.

```mermaid
graph LR
    subgraph "Frontend (React + Vite)"
        UI[User Interface]
        State[Zustand Stores<br/>(Client State)]
        Query[TanStack Query<br/>(Server State)]
        I18N[i18next]
    end

    subgraph "Backend (FastAPI)"
        API[REST Endpoints]
        ORM[SQLAlchemy]
    end

    subgraph "Storage"
        DB[(PostgreSQL)]
    end

    UI <--> State
    UI <--> Query
    Query -->|REST| API
    API <--> ORM
    ORM <--> DB

    style API stroke:#3b82f6,stroke-width:2px
```

### Project-First Flow

Qualis 2.0 introduces a **Project-First** architecture.

- Most API requests are scoped by a mandatory `X-Project-ID` header.
- The `useAdminStore` maintains the global selection context (Active Project + Study) across all admin pages.
- Access control is inherited from the Project level, ensuring researchers only see the studies and data they are authorized to manage.

---

## State Management

The frontend uses a hybrid approach:

- **TanStack Query (via Orval)**: Manages async server state (caching, fetching, synchronizing).
- **Zustand**: Manages client-only state (drag-and-drop, UI, session progress).

Seven atomic stores are used for clean separation of concerns:

```mermaid
flowchart TD
    subgraph "Zustand Stores"
        Auth["useAuthStore<br/>User, Projects"]
        Admin["useAdminStore<br/>Active Project, Study Selection"]
        Designer["useStudyDesigner<br/>Draft state, sync status"]
        Config["useConfigStore<br/>Study config, statements, grid"]
        Session["useSessionStore<br/>Step, consent, language"]
        Response["useResponseStore<br/>Rough sort, Q-sort, post-sort"]
        UI["useUIStore<br/>Hovered/active card state"]
    end

    subgraph "Pages"
        WP[WelcomePage]
        PS[PreSortPage]
        RS[RoughSortPage]
        FS[FineSortPage]
        Post[PostSortPage]
        DP[DesignPage]
    end

    Admin --> Config
    Auth --> Admin
    Designer --> DP
    Config --> WP & PS & RS & FS & Post
    Session --> WP & PS & RS & FS & Post
    Response --> RS & FS & Post
    UI --> FS

    style Auth fill:#fee2e2
    style Admin fill:#e0f2fe
    style Designer fill:#fce7f3
    style Config fill:#dbeafe
    style Session fill:#fef3c7
    style Response fill:#dcfce7
    style UI fill:#f3e8ff
```

| Store                | Purpose                                       | Persisted            |
| -------------------- | --------------------------------------------- | -------------------- |
| `useAuthStore`       | Current authenticated user and project list   | sessionStorage       |
| `useAdminStore`      | Active project and study selection context    | localStorage         |
| `useStudyDesigner`   | Draft study state, sync status, active step   | None (transient)     |
| `useConfigStore`     | Study configuration, statements, grid layout  | None                 |
| `useSessionStore`    | Current step, consent status, language        | localStorage         |
| `useResponseStore`   | Participant data (rough, qsort, postsort)     | localStorage         |
| `useUIStore`         | Transient UI state (hovered/active card)      | None                 |

### Session Isolation

When a participant navigates between studies (or the URL slug changes), all participant-facing stores (`useSessionStore`, `useConfigStore`, `useResponseStore`) are automatically reset and the TanStack Query cache is cleared. This prevents cross-contamination of data between studies.

In pilot/test mode, stores use separate localStorage keys (e.g., `qualis-pilot-session` instead of `qualis-session`) to isolate test data from real participant sessions.

### Context Providers

Beyond Zustand stores, the application uses React contexts for cross-cutting concerns:

| Context              | Purpose                                             |
| :------------------- | :-------------------------------------------------- |
| `ViewportProvider`   | Centralized breakpoint detection (`isMobile`, `isDesktop`) with SSR-safe defaults |
| `LayoutContext`      | Allows pages to inject custom actions into the admin header (e.g., save button) |

---

## Technology Stack

### Frontend

| Technology              | Purpose                              |
| ----------------------- | ------------------------------------ |
| **React 19** + **Vite** | Fast development with HMR            |
| **TypeScript**          | Type safety for Q-sort logic         |
| **TanStack Query**      | Server state management & caching    |
| **Orval**               | Contract-first API client generation |
| **Zustand**             | Minimal boilerplate state management |
| **Tailwind CSS**        | Utility-first styling                |
| **dnd-kit**             | Accessible drag-and-drop             |
| **Framer Motion**       | Smooth animations                    |
| **react-i18next**       | Internationalization                 |

### Backend

| Technology     | Purpose                           |
| -------------- | --------------------------------- |
| **FastAPI**    | Async REST API with OpenAPI docs  |
| **SQLAlchemy** | ORM with async support            |
| **Pydantic**   | Data validation and serialization |
| **PostgreSQL** | Scalable system database          |

---

## Responsiveness and Theming

Qualis implements a robust, multi-layer responsiveness strategy to support devices ranging from mobile phones to high-resolution desktops.

### 1. Centralized Viewport Detection

Instead of scattered `window.innerWidth` checks, the application uses a centralized **Viewport Context**.

- **`ViewportProvider`**: Listens for resize events and exposes standardized dimensions and semantic booleans (`isMobile`, `isDesktop`).
- **`useViewport()` Hook**: Components consume this hook to react to strict breakpoints consistently.
- **SSR Safety**: The context handles hydration mismatches gracefully by defaulting to desktop and updating on mount.

### 2. Fluid Typography

We utilize **Fluid Typography** to ensure text scales smoothly across viewport sizes, avoiding abrupt jumps at breakpoints.

- Implemented via `clamp()` functions in `src/styles/typography.css`.
- Integrated into Tailwind's configuration, so classes like `text-lg` automatically scale from mobile to desktop sizes.

### 3. Container Queries

For complex components that appear in various contexts (e.g., cards in a grid vs. a sidebar), we use **Container Queries**.

- **Plugin**: `@tailwindcss/container-queries`.
- **Usage**: Critical components (like `CardStack`) adapt their layout and font size based on their _container's_ width, not the viewport width.

---

## Database Schema

```mermaid
erDiagram
    PROJECT ||--o{ PROJECT_MEMBER : has
    USER ||--o{ PROJECT_MEMBER : member_of
    PROJECT ||--o{ STUDY : contains
    PROJECT ||--o{ INVITATION : has
    STUDY ||--o{ STUDY_TRANSLATION : has
    STUDY ||--o{ STATEMENT : contains
    STUDY ||--o{ PARTICIPANT : has
    STUDY ||--o{ RECRUITMENT_LINK : has
    STATEMENT ||--o{ STATEMENT_TRANSLATION : has
    PARTICIPANT ||--o{ QSORT_ENTRY : makes
    PARTICIPANT ||--o{ AUDIO_RECORDING : records
    STATEMENT ||--o{ QSORT_ENTRY : placed_in

    PROJECT {
        int id PK
        string title
        string slug UK
        json config
        datetime created_at
    }

    PROJECT_MEMBER {
        int project_id FK
        int user_id FK
        enum role "owner | researcher | viewer"
        datetime joined_at
    }

    USER {
        int id PK
        string email UK
        string full_name
        string hashed_password
        boolean is_active
        boolean is_superuser
        string totp_secret
        boolean is_totp_enabled
    }

    STUDY {
        int id PK
        string slug UK
        enum state "draft | active | paused | closed | archived"
        int project_id FK
        string default_language
        boolean show_statement_codes
        boolean randomize_statement_order
        boolean symmetry_lock
        json grid_config
        json presort_config
        json postsort_config
        json branding
        string access_password
        datetime created_at
        datetime start_date
        datetime end_date
        datetime updated_at
    }

    STUDY_TRANSLATION {
        int id PK
        int study_id FK
        string language_code
        string title
        string subtitle
        text description
        string objective
        string condition_of_instruction
        string pre_instruction
        text instructions
        json ui_labels
        string consent_title
        text consent_description
        json process_steps
        json methodology_tips
        json step_help
    }

    STATEMENT {
        int id PK
        int study_id FK
        string code
        int display_order
    }

    STATEMENT_TRANSLATION {
        int id PK
        int statement_id FK
        string language_code
        string text
    }

    PARTICIPANT {
        int id PK
        int study_id FK
        uuid session_token UK
        string language_used
        string random_seed
        enum status "started | completed"
        string confirmation_code UK
        boolean is_discarded
        string discard_reason
        string ip_address
        string user_agent
        json presort_answers
        json postsort_answers
        int last_step_reached
        datetime created_at
        datetime submitted_at
        datetime consented_at
        string consent_hash
    }

    QSORT_ENTRY {
        int id PK
        int participant_id FK
        int statement_id FK
        int grid_score
        string card_comment
    }

    AUDIO_RECORDING {
        int id PK
        int participant_id FK
        string question_key
        string s3_bucket
        string s3_key UK
        int file_size_bytes
        float duration_seconds
        string mime_type
        datetime created_at
    }

    RECRUITMENT_LINK {
        int id PK
        int study_id FK
        enum type "public | individual | limited"
        string token UK
        string name
        int capacity
        int usage_count
        int start_count
        boolean is_active
        datetime created_at
        datetime expires_at
    }

    INVITATION {
        int id PK
        string email
        int project_id FK
        int study_id FK
        enum role
        string token UK
        datetime created_at
        datetime expires_at
        datetime accepted_at
    }
```

Study states: `draft`, `active`, `paused`, `closed`, `archived`.

### Key Data Integrity Patterns

- **Consent Hashing**: `consent_hash` stores a hash of the consent text version the participant saw, enabling audit trails.
- **IP Hashing**: `ip_address` stores a SHA-256 hash (salted with `IP_HASH_SALT`), never the raw IP — ensuring GDPR compliance.
- **Forward-Only Progress**: `last_step_reached` only advances forward, never regresses. This prevents participants from artificially rolling back their progress in analytics.
- **Deterministic Randomization**: When `randomize_statement_order` is enabled, the participant's `session_token` seeds the shuffle, so refreshing produces the same order.

---

## Permission Model (RBAC)

Qualis uses a two-tier RBAC system to balance global maintenance and fine-grained study collaboration.

### 1. Global Hierarchy

- **Superuser**: Can manage all users in the system and perform global maintenance. Designated by `is_superuser: true` on the `User` model.
- **User**: Standard account. Can be a member of one or more projects.

### 2. Project-Level Roles

Permissions are scoped per-project via the `ProjectMember` relationship:

| Role           | Ability                                                                 |
| :------------- | :---------------------------------------------------------------------- |
| **Owner**      | Full control over project: manage members, create/delete studies.       |
| **Researcher** | Can create/edit studies, export results. Cannot manage project users.   |
| **Viewer**     | Read-only access to study configuration. Cannot export data.            |

---

## Data Lifecycle

### 1. Study Initialization

```mermaid
sequenceDiagram
    participant Browser
    participant Frontend
    participant API
    participant DB

    Browser->>Frontend: Visit /study/:slug
    Frontend->>API: GET /api/study/:slug
    API->>DB: Query Study + Translations + Statements
    DB-->>API: Study Data
    API-->>Frontend: JSON Config
    Frontend->>Frontend: Store in useConfigStore
    Frontend-->>Browser: Render UI
```

### 2. Sort & Submission

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant DB

    User->>Frontend: Complete Pre-Sort
    Frontend->>Frontend: Store in useResponseStore

    User->>Frontend: Complete Rough Sort
    Frontend->>Frontend: Store rough data

    User->>Frontend: Complete Fine Sort
    Frontend->>Frontend: Store qsort data

    User->>Frontend: Complete Post-Sort
    Frontend->>Frontend: Store postsort data

    User->>Frontend: Submit
    Frontend->>API: POST /api/submit
    API->>DB: Create Participant + QSortEntries
    DB-->>API: Confirmation Code
    API-->>Frontend: { status: "success", confirmation_code: "ABC123" }
    Frontend-->>User: Show Confirmation
```

---

## Where to find what

Conventions for the code layout live in the contributing guides, not here. See [`../contributing/backend-guidelines.md`](../contributing/backend-guidelines.md) for the backend's three-tier organisation (`routers` → `services` → `models`/`schemas`) and [`../reference/components.md`](../reference/components.md) for the frontend component map. The full HTTP API surface is documented in [`../reference/api.md`](../reference/api.md).

---

## Why this shape

The architectural choices visible above (project-scoped requests, hybrid Zustand + TanStack Query, contract-first OpenAPI generation, async SQLAlchemy, JSON columns for open-ended config, hashed IPs, persisted analysis runs) are not neutral. They follow from three commitments that override the "default" answer at each junction:

1. **Self-hosting under a researcher's institution.** A SaaS architecture would have made several design decisions easier (centralised auth, shared object storage, fewer env vars). Self-hosting with GDPR data-residency in mind dictates that secrets, hashing salts, S3 endpoints, and SMTP routing all stay configurable per deployment, and that the participant flow contains no third-party calls.

2. **Critical Q-methodology rather than classical Q-as-a-tool.** The persistence of every analysis run with its parameters, the editability of researcher notes on a run, the per-statement audit of who flagged what — these only make sense if you treat analytical choices as part of the result, rather than as a one-shot computation. The schema is shaped to keep the trail.

3. **Auditable handling of participant data.** IP hashing with a per-deployment salt, consent-version hashes per participant, forward-only `last_step_reached`, deterministic randomisation seeded by the session token, and admin- and participant-mediated GDPR Art. 17 erasure are not features added on top — they are constraints that ruled out simpler implementations from the start.

For the runtime defaults that fall out of these commitments (rate-limiting modes, connection pool sizing, security headers, error response shape), see [`../guides/deployment.md#runtime-behaviour-reference`](../guides/deployment.md#runtime-behaviour-reference) and [`../reference/api.md#error-response-format`](../reference/api.md#error-response-format).
