# Libre-Q Architecture

This document describes the technical architecture, design choices, and data flow of the Libre-Q platform.

---

## System Architecture

Libre-Q follows a decoupled **Client-Server** architecture with clear separation of concerns.

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

### Workspace-First Flow

Libre-Q 2.0 introduces a **Workspace-First** architecture.

- Most API requests are scoped by a mandatory `X-Workspace-ID` header.
- The `useAdminStore` maintains the global selection context (Active Workspace + Study) across all admin pages.
- Access control is inherited from the Workspace level, ensuring researchers only see the studies and data they are authorized to manage.

---

## State Management

The frontend uses a hybrid approach:

- **TanStack Query (via Orval)**: Manages async server state (caching, fetching, synchronizing).
- **Zustand**: Manages client-only state (drag-and-drop, UI, session progress).

Seven atomic stores are used for clean separation of concerns:

```mermaid
flowchart TD
    subgraph "Zustand Stores"
        Auth["useAuthStore<br/>User, Workspaces"]
        Admin["useAdminStore<br/>Active Workspace, Study Selection"]
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
| `useAuthStore`       | Current authenticated user and workspace list | sessionStorage       |
| `useAdminStore`      | Active workspace and study selection context  | localStorage         |
| `useStudyDesigner`   | Draft study state, sync status, active step   | None (transient)     |
| `useConfigStore`     | Study configuration, statements, grid layout  | None                 |
| `useSessionStore`    | Current step, consent status, language        | localStorage         |
| `useResponseStore`   | Participant data (rough, qsort, postsort)     | localStorage         |
| `useUIStore`         | Transient UI state (hovered/active card)      | None                 |

### Session Isolation

When a participant navigates between studies (or the URL slug changes), all participant-facing stores (`useSessionStore`, `useConfigStore`, `useResponseStore`) are automatically reset and the TanStack Query cache is cleared. This prevents cross-contamination of data between studies.

In pilot/test mode, stores use separate localStorage keys (e.g., `libre-q-pilot-session` instead of `libre-q-session`) to isolate test data from real participant sessions.

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

Libre-Q implements a robust, multi-layer responsiveness strategy to support devices ranging from mobile phones to high-resolution desktops.

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
    WORKSPACE ||--o{ WORKSPACE_MEMBER : has
    USER ||--o{ WORKSPACE_MEMBER : member_of
    WORKSPACE ||--o{ STUDY : contains
    WORKSPACE ||--o{ INVITATION : has
    STUDY ||--o{ STUDY_TRANSLATION : has
    STUDY ||--o{ STATEMENT : contains
    STUDY ||--o{ PARTICIPANT : has
    STUDY ||--o{ RECRUITMENT_LINK : has
    STATEMENT ||--o{ STATEMENT_TRANSLATION : has
    PARTICIPANT ||--o{ QSORT_ENTRY : makes
    PARTICIPANT ||--o{ AUDIO_RECORDING : records
    STATEMENT ||--o{ QSORT_ENTRY : placed_in

    WORKSPACE {
        int id PK
        string title
        string slug UK
        json config
        datetime created_at
    }

    WORKSPACE_MEMBER {
        int workspace_id FK
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
        int workspace_id FK
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
        boolean is_test_run
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
        int workspace_id FK
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

Libre-Q uses a two-tier RBAC system to balance global maintenance and fine-grained study collaboration.

### 1. Global Hierarchy

- **Superuser**: Can manage all users in the system and perform global maintenance. Designated by `is_superuser: true` on the `User` model.
- **User**: Standard account. Can be a member of one or more workspaces.

### 2. Workspace-Level Roles

Permissions are scoped per-workspace via the `WorkspaceMember` relationship:

| Role           | Ability                                                                 |
| :------------- | :---------------------------------------------------------------------- |
| **Owner**      | Full control over workspace: manage members, create/delete studies.     |
| **Researcher** | Can create/edit studies, export results. Cannot manage workspace users. |
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

## Project Structure

```
frontend/src/
├── api/                # API Client (Orval-generated)
│   ├── generated.ts    # Generated hooks & types
│   ├── model/          # Generated Pydantic-to-TS schemas
│   └── mutator.ts      # Custom fetch wrapper
├── components/         # Reusable UI
│   ├── admin/          # Admin-specific UI
│   │   ├── analysis/   # ScreePlot, FactorLoadings, FactorArrays, Statements, Characteristics
│   │   ├── dashboard/  # InteractiveDataView, ParticipantDetail, charts/
│   │   ├── designer/   # Study design editor components
│   │   └── layout/     # Admin layout (sidebar, header)
│   ├── audio/          # Audio recording & playback
│   ├── postsort/       # Post-sort specific components
│   ├── survey/         # Survey form components
│   ├── ui/             # UI primitives (shadcn-style)
│   ├── GridSort.tsx    # Q-grid with zoom/pan
│   ├── CardStack.tsx   # Swipeable card deck
│   ├── SortableCard.tsx
│   ├── DroppableSlot.tsx
│   └── ReadingZone.tsx # Zoomed card display
├── contexts/           # React contexts (ViewportContext)
├── hooks/              # Custom React hooks
├── layouts/            # Shared layouts
├── lib/                # Utility functions (cn, etc.)
├── pages/              # Route components
│   ├── WelcomePage.tsx
│   ├── PreSortPage.tsx
│   ├── RoughSortPage.tsx
│   ├── FineSortPage.tsx
│   ├── PostSortPage.tsx
│   └── admin/          # Admin pages (Overview, Design, Data, Analysis, etc.)
├── schemas/            # Zod validation schemas
├── store/              # Zustand stores
│   ├── useAuthStore.ts
│   ├── useAdminStore.ts
│   ├── useStudyDesigner.ts
│   ├── useConfigStore.ts
│   ├── useSessionStore.ts
│   ├── useResponseStore.ts
│   └── useUIStore.ts
├── styles/             # Global CSS (typography, themes)
├── types/              # TypeScript type definitions
└── utils/              # Shared utilities

frontend/public/
└── locales/            # i18n translations
    ├── en/translation.json
    ├── fr/translation.json
    └── fi/translation.json
```

---

## API Endpoints

| Method | Endpoint           | Description                   |
| ------ | ------------------ | ----------------------------- |
| `GET`  | `/api/study/:slug` | Fetch study configuration     |
| `POST` | `/api/submit`      | Submit participant data       |
| `GET`  | `/api/admin/*`     | Administrative API (auth required) |
| `POST` | `/api/audio/*`     | Audio recording management    |
| `GET`  | `/docs`            | Interactive API documentation |

For the complete API reference, see [docs/reference/api.md](../reference/api.md) or visit `/docs` when the backend is running.

---

## Error Handling

### Backend

All errors are handled by a global exception middleware that returns a standardized JSON format:

```json
{
  "code": 422,
  "message": "Validation Error",
  "details": [ ... ]
}
```

Error categories:
- **HTTP exceptions**: Returned with their status code and message.
- **Validation errors**: Include Pydantic field-level details.
- **Database integrity errors**: Return conflict details (e.g., duplicate slug).
- **Unhandled exceptions**: Logged with full traceback; clients receive a generic 500.

### Frontend

Frontend JavaScript errors are captured and sent to `POST /api/logs` with stack trace, URL, and context metadata. The backend logs these to a dedicated `frontend_error` logger for monitoring.

---

## Security

### Security Headers

The backend injects security headers on all responses:

- **HSTS**: Enforces HTTPS connections.
- **CSP (Content Security Policy)**: Restricts script sources; dynamically includes S3 endpoint for audio playback.
- **X-Frame-Options**: Prevents clickjacking (DENY).
- **Permissions-Policy**: Restricts camera access; enables microphone for audio recording.

### Password Security

User passwords are hashed with bcrypt using auto-generated salts. TOTP 2FA codes use a 1-second time window tolerance for clock skew.
