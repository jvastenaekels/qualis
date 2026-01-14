# Open-Q

**Open-Q** is an open-source platform for conducting **Q-methodology** research. It provides a seamless, modern interface for participants to perform Q-sorts and for researchers to collect and analyze subjective viewpoints.

**Mission:** We seek to contribute to **Open Science** by providing a transparent, reproducible, and accessible tool for subjectivity research, ensuring that data ownership remains with the researcher.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/jvastenaekels/open-q/actions/workflows/ci.yml/badge.svg)](https://github.com/jvastenaekels/open-q/actions/workflows/ci.yml)

---

## 📚 Documentation

The documentation is organized using the **Diátaxis** framework:

- **[Tutorials](docs/tutorials/)**: Learning-oriented lessons.
  - [Production Deployment](docs/guides/deployment.md) (Scalingo, Docker)
- **[Guides](docs/guides/)**: Task-oriented how-to guides.
  - [Admin Dashboard Features](docs/guides/admin-features.md)
  - [Admin & Team Management](docs/guides/admin-management.md)
  - [Conducting Studies](docs/guides/conducting-studies.md)
  - [Exporting Data](docs/guides/data-export.md)
  - [Contributing & Development](docs/guides/contributing/development.md)
- **[Reference](docs/reference/)**: Information-oriented reference.
  - [API Reference](docs/reference/api.md)
  - [Configuration Options](docs/reference/configuration.md)
  - [Frontend Components](docs/reference/components.md)
- **[Explanation](docs/explanation/)**: Understanding-oriented background.
  - [Architecture Overview](docs/explanation/architecture.md)
  - [Mobile UX Decisions](docs/explanation/design-decisions/mobile-ux.md)

## ✨ Why Open-Q?

Open-Q is designed to address specific pain points of modern Q-methodology research.

### 1. Designed for the Modern Participant (UX)

_Solves high dropout rates with a friction-free experience._

- **Zero-Install, Browser-Based**: Works instantly on any device (Smartphone, Tablet, Desktop). No executables or Java runtimes required.
- **Mobile-First "Focus Flow"**: A drag-and-drop interface specifically engineered for touchscreens, ensuring less tech-savvy populations or mobile users aren't excluded.
- **Cognitive Easing**: Automatically stages the sorting process (Rough Sort -> Fine Sort) to reduce participant fatigue and improve data quality.

### 2. Uncompromising Methodological Rigor

_Solves the validity problems of standard drag-and-drop tools._

- **Enforced Bell Curve**: The interface strictly enforces your specific forced distribution. Participants cannot submit invalid grids.
- **Live Validation**: Immediate visual feedback prevents missing items or duplicates.
- **Integrated Qualitative Context**: Seamlessly transitions from the Q-Sort to post-sort interviews, capturing the qualitative "Why" behind the factors.

### 3. Real-Time Research Command Center

_Solves the "Black Box" of data collection._

- **Live Analytics Dashboard**: Monitor recruitment progress, completion rates, and flag anomalies (e.g., speed-runners) in real-time.
- **Collaborative Workspaces**: Invite colleagues with specific roles (Owner, Editor, Viewer) to collaborate securely.
- **One-Click Analysis Export**: Download data in ready-to-use formats for **PQMethod**, **KADE**, or **R** (qmethod package).

### 4. Native Multi-Language Support

_Built for global, cross-cultural research from day one._

- **Fully Localized UI**: The participant interface adapts seamlessly to multiple languages ensuring language is never a barrier.
- **Cross-Cultural Study Management**: Design studies with multiple languages in mind. Switch participant instructions, statements, and consent forms instantly to compare cultural perspectives without technical friction.

---

## 🤝 Contributing & Standards

We welcome contributions! Open-Q follows an **"Agent-First"** development philosophy, prioritizing strict typing and explicit contracts to facilitate AI-assisted coding.

Please read our guidelines before submitting a PR:

- **[Coding Standards](docs/contributing/coding-standards.md)**: The "Read First" manifesto.
- **[Frontend Guidelines](docs/contributing/frontend-guidelines.md)**: React 19, Tailwind, and Mobile-First UX.
- **[Backend Guidelines](docs/contributing/backend-guidelines.md)**: Python 3.13, Pydantic, and Inverse TDD.
- **[Prompting Strategy](docs/contributing/prompting-strategy.md)**: How to effectively pair-program with AI on this codebase.

## 🚀 Quick Start

1. **Prerequisites**: [uv](https://docs.astral.sh/uv/) (Python), [Node.js](https://nodejs.org/)

2. **Clone & Install**:

   ```bash
   git clone https://github.com/jvastenaekels/open-q.git
   cd open-q
   make install
   ```

3. **Run Locally**:

```bash
# Install everything
make install

# Run backend (FastAPI)
make run-backend

# Run frontend (React/Vite)
make run-frontend

# Run fast CI check (Lint + Type + Unit Tests)
make ci

# Run full CI check (Lint + Type + Security + E2E)
make ci-full
```

3. **Visit**: [http://localhost:5173/study/my-study/welcome](http://localhost:5173/study/my-study/welcome)

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0** — see the [LICENSE](LICENSE) file for details.
