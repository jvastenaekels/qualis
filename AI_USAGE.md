# AI usage disclosure

Generative AI assistants (primarily Anthropic Claude, with occasional cross-checks via OpenAI Codex) were used during Qualis's development and documentation:

- **Code generation and refactoring:** AI assistants drafted parts of the implementation (notably some boilerplate FastAPI routers, React components, and test scaffolding), which were then reviewed, edited, and integrated by the human author.
- **Documentation drafting:** README, tutorials, and inline documentation were partially drafted with AI assistance and edited for accuracy and tone.
- **Code review and audit:** A multi-axis code audit was conducted with AI sub-agents; findings were reviewed and prioritised by the human author before remediation.

**Human responsibility:** All architectural decisions, methodological choices (extraction method, rotation, flagging logic), security-sensitive code paths, and the final published version are the responsibility of the listed authors. AI-generated content was reviewed and edited prior to inclusion.

**Reproducibility:** This disclosure is reflected in the project's commit history (commits co-authored with `Claude Opus 4.7` and `Codex` markers in trailer lines).
