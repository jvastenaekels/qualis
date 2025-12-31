# Open-Q Frontend

A modern, responsive React application for conducting Q-methodology sorts.

## 🏗️ Architecture

- **React + Vite**: Fast bundling and HMR.
- **Zustand**: Lightweight state management (see `src/store`).
- **dnd-kit**: Flexible drag-and-drop primitives.
- **Framer Motion**: Production-ready animations.
- **Tailwind CSS**: Utility-first styling.

## 📁 Project Structure

```text
frontend/
├── src/
│   ├── components/     # Reusable UI components (CardStack, GridSort, etc.)
│   ├── pages/          # Page-level components (Landing, Sort, etc.)
│   ├── store/          # Zustand store definitions
│   ├── hooks/          # Custom React hooks
│   ├── api/            # API client and communication logic
│   ├── locales/        # i18n translation files (EN, FR, FI)
│   └── layouts/        # Shared page layouts
├── public/             # Static assets
└── scripts/            # Frontend utility scripts
```

## ⚙️ Development

1. **Install Dependencies**:

    ```bash
    npm install
    ```

2. **Run Development Server**:

    ```bash
    npm run dev
    ```

3. **Run Tests**:
    ```bash
    npm test
    ```

## 🧠 State Management: Zustand

The application's state logic is split into atomic, domain-specific stores:

- **useConfigStore**: Current study configuration (read-only mostly).
- **useSessionStore**: Participant session state (consent, progress).
- **useResponseStore**: Q-sort data (rough sort, fine sort placements).
- **useUIStore**: Ephemeral UI state (drag operations, hover states).

## 🌍 Internationalization

Translations are managed in `src/locales/`. We use `i18next` for UI labels and dynamic study content (titles, instructions) fetched from the backend. Supported languages: **English (en)**, **French (fr)**, and **Finnish (fi)**.
