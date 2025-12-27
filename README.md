# Open-Q

**Open-Q** is an open-source platform for conducting **Q-methodology** research. It provides a seamless, modern interface for participants to perform Q-sorts and for researchers to collect and analyze subjective viewpoints.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/jvastenaekels/open-q/actions/workflows/ci.yml/badge.svg)](https://github.com/jvastenaekels/open-q/actions/workflows/ci.yml)

---

## 📚 Documentation

The documentation is organized using the **Diátaxis** framework:

- **[Tutorials](docs/tutorials/)**: Learning-oriented lessons.
  - [Production Deployment](docs/guides/deployment.md) (Scalingo, Docker)
- **[Guides](docs/guides/)**: Task-oriented how-to guides.
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

---

## ✨ Features

- **Modern Q-Sort Interface** — Drag-and-drop with fluid animations (Framer Motion).
- **Multi-language Support** — Fully internationalized (i18n).
- **Responsive Design** — "Focus Flow" UX optimized for mobile devices.
- **Flexible Configuration** — Define grid shapes and logic via JSON.
- **Robust Architecture** — FastAPI Backend + React Frontend + Architectural Governance.

---

## 🚀 Quick Start (Development)

1. **Clone & Install**:

   ```bash
   git clone https://github.com/jvastenaekels/open-q.git
   cd open-q
   make install # (Requires Make) OR see docs/guides/contributing/development.md
   ```

2. **Run Locally**:

   ```bash
   make run
   ```

3. **Visit**: [http://localhost:5173/study/example-study/welcome](http://localhost:5173/study/example-study/welcome)

For detailed setup instructions, see the [Development Guide](docs/guides/contributing/development.md).

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0** — see the [LICENSE](LICENSE) file for details.
