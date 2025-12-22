# Open-Q Documentation

Welcome to the Open-Q documentation. Choose a section based on your role:

---

## 🔬 For Researchers

| Guide                                                  | Description                                    |
| ------------------------------------------------------ | ---------------------------------------------- |
| [What is Q-Methodology?](researchers/q-methodology.md) | Introduction to Q-methodology for newcomers    |
| [Study Configuration](CONFIG_REFERENCE.md)             | How to configure grid, pre-sort, and post-sort |
| [Data Export](DATA_EXPORT.md)                          | Understanding the exported data format         |

---

## 👩‍💻 For Developers

| Guide                                        | Description                                   |
| -------------------------------------------- | --------------------------------------------- |
| [Architecture](ARCHITECTURE.md)              | Tech stack, state management, database schema |
| [API Reference](developers/api-reference.md) | REST endpoints and OpenAPI docs               |
| [Testing](developers/testing.md)             | Unit, integration, and E2E testing            |
| [Components](developers/components.md)       | Key frontend components (GridSort, CardStack) |

---

## 🚀 Getting Started

| Guide                                          | Description                 |
| ---------------------------------------------- | --------------------------- |
| [Local Development](../README.md#-quick-start) | Quick start for local setup |
| [Deployment](getting-started/deployment.md)    | Production deployment guide |

---

## 📂 Full Documentation Index

```
docs/
├── index.md                    ← You are here
├── ARCHITECTURE.md             # Tech stack and data flow
├── CONFIG_REFERENCE.md         # Study configuration options
├── DATA_EXPORT.md              # Export format documentation
│
├── researchers/
│   └── q-methodology.md        # Q-methodology introduction
│
├── developers/
│   ├── api-reference.md        # REST API documentation
│   ├── components.md           # Frontend component guide
│   └── testing.md              # Test strategy
│
└── getting-started/
    └── deployment.md           # Production deployment
```
