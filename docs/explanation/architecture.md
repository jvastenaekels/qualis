# Open-Q Architecture

This document describes the technical architecture, design choices, and data flow of the Open-Q platform.

---

## 🏗️ System Architecture

Open-Q follows a decoupled **Client-Server** architecture with clear separation of concerns.

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
```

---

## 💾 State Management

The frontend uses a hybrid approach:

- **TanStack Query (via Orval)**: Manages async server state (caching, fetching, synchronizing).
- **Zustand**: Manages client-only state (drag-and-drop, UI, session progress).

Three atomic stores are used for clean separation of concerns:

```mermaid
flowchart TD
    subgraph "Zustand Stores"
        Config["useConfigStore<br/>📄 Study config, statements, grid"]
        Session["useSessionStore<br/>🔐 Step, consent, language"]
        Response["useResponseStore<br/>📝 Rough sort, Q-sort, post-sort"]
        UI["useUIStore<br/>🖼️ Zoomed card, tips state"]
    end

    subgraph "Pages"
        WP[WelcomePage]
        PS[PreSortPage]
        RS[RoughSortPage]
        FS[FineSortPage]
        Post[PostSortPage]
    end

    Config --> WP & PS & RS & FS & Post
    Session --> WP & PS & RS & FS & Post
    Response --> RS & FS & Post
    UI --> FS

    style Config fill:#dbeafe
    style Session fill:#fef3c7
    style Response fill:#dcfce7
    style UI fill:#f3e8ff
```

| Store              | Purpose                                      | Persisted       |
| ------------------ | -------------------------------------------- | --------------- |
| `useConfigStore`   | Study configuration, statements, grid layout | ❌              |
| `useSessionStore`  | Current step, consent status, language       | ✅ localStorage |
| `useResponseStore` | Participant data (rough, qsort, postsort)    | ✅ localStorage |
| `useUIStore`       | Transient UI state (zoomed card)             | ❌              |

---

## 💻 Technology Stack

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

## 📊 Database Schema

```mermaid
erDiagram
    WORKSPACE ||--o{ WORKSPACE_MEMBER : has
    USER ||--o{ WORKSPACE_MEMBER : member_of
    WORKSPACE ||--o{ STUDY : contains
    STUDY ||--o{ STUDY_TRANSLATION : has
    STUDY ||--o{ STATEMENT : contains
    STUDY ||--o{ PARTICIPANT : has
    PARTICIPANT ||--o{ QSORT_ENTRY : makes
    STATEMENT ||--o{ QSORT_ENTRY : placed_in

    WORKSPACE {
        int id PK
        string title
        string slug UK
        datetime created_at
    }

    WORKSPACE_MEMBER {
        int workspace_id FK
        int user_id FK
        enum role
        datetime joined_at
    }

    USER {
        int id PK
        string email UK
        string hashed_password
        boolean is_superuser
    }

    STUDY {
        int id PK
        string slug UK
        string state
        int workspace_id FK
        json grid_config
        json presort_config
        json postsort_config
    }

    STUDY_TRANSLATION {
        int id PK
        int study_id FK
        string language
        string title
        text description
        text instructions
    }

    STATEMENT {
        int id PK
        int study_id FK
        string code
    }

    PARTICIPANT {
        int id PK
        int study_id FK
        string confirmation_code
        string status
        json presort_data
        json postsort_data
    }

    QSORT_ENTRY {
        int id PK
        int participant_id FK
        int statement_id FK
        int grid_score
    }
```

---

## 🔐 Permission Model (RBAC)

Open-Q uses a two-tier RBAC system to balance global maintenance and fine-grained study collaboration.

### 1. Global Hierarchy

- **Superuser**: Can manage all users in the system and perform global maintenance. Designated by `is_superuser: true` on the `User` model.
- **User**: Standard account. Can be a member of one or more workspaces.

### 2. Workspace-Level Roles

Permissions are scoped per-workspace via the `WorkspaceMember` relationship:

| Role           | Ability                                                                 |
| :------------- | :---------------------------------------------------------------------- |
| **Admin**      | Full control over workspace: manage members, create/delete studies.     |
| **Researcher** | Can create/edit studies, export results. Cannot manage workspace users. |
| **Viewer**     | Read-only access to study configuration and results export.             |

---

## 🔄 Data Lifecycle

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
    API-->>Frontend: { success: true, code: "ABC123" }
    Frontend-->>User: Show Confirmation
```

---

## 📁 Project Structure

```
frontend/src/
├── api/                # API Client (Orval)
│   ├── generated.ts    # Generated hooks & types
│   ├── model/          # Generated schemas
│   └── mutator.ts      # Custom fetch wrapper
├── test/               # Test utilities & mocks
│   ├── test-utils.tsx  # Custom render & providers
│   └── server.ts       # MSW server setup
├── pages/              # Route components
│   ├── WelcomePage.tsx
│   ├── PreSortPage.tsx
│   ├── RoughSortPage.tsx
│   ├── FineSortPage.tsx
│   └── PostSortPage.tsx
├── components/         # Reusable UI
│   ├── GridSort.tsx    # Q-grid with zoom/pan
│   ├── CardStack.tsx   # Swipeable card deck
│   ├── SortableCard.tsx
│   └── DroppableSlot.tsx
├── hooks/              # Custom React hooks
│   ├── useGetStudyConfig.ts # Generated hook wrapper
│   ├── useGridZoom.ts  # Zoom/pan logic
│   ├── useFineSortDrag.ts
│   └── useStudyConfig.ts
├── store/              # Zustand stores
│   ├── useConfigStore.ts
│   ├── useSessionStore.ts
│   ├── useResponseStore.ts
│   └── useUIStore.ts
└── layouts/            # Shared layouts

frontend/public/
└── locales/            # i18n translations
    ├── en/translation.json
    ├── fr/translation.json
    └── fi/translation.json
```

---

## 🔌 API Endpoints

| Method | Endpoint           | Description                   |
| ------ | ------------------ | ----------------------------- |
| `GET`  | `/api/study/:slug` | Fetch study configuration     |
| `POST` | `/api/submit`      | Submit participant data       |
| `GET`  | `/docs`            | Interactive API documentation |

For full API reference, visit `/docs` when the backend is running.
