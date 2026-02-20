# Documentation Style Guide

To maintain consistency and professionalism across Libre-Q documentation, please follow these guidelines.

## Markdown Conventions

- **Headers**: Use ATX-style headers (`#`, `##`, etc.). Ensure there is a space after the `#`.
- **Lists**: Prefer `-` for unordered lists.
- **Emphasis**: Use `**bold**` for key terms and `*italics*` for UI element names.
- **Code Blocks**: Always specify the language for syntax highlighting (e.g., ` ```bash `, ` ```typescript `).
- **Links**: Use descriptive link text. Avoid "click here".
- **Headings**: Do not use emojis in headings. Use plain text.

## Diagrams (Mermaid)

We use **Mermaid** for technical diagrams.

- Always include an ID or descriptive title.
- Keep diagrams simple; focus on the high-level flow.
- Use `graph TD` for top-down flows and `graph LR` for left-to-right flows.

## Tone and Voice

- **Professional yet Accessible**: Avoid overly academic jargon where simpler terms suffice.
- **Active Voice**: Use "The system saves the data" instead of "The data is saved by the system".
- **Researcher-Centric**: When writing for researchers, emphasize the methodology and data integrity.
- **Developer-Centric**: Be concise, provide code examples, and explain the "why" behind architectural choices.

## File Linking

- When linking to files within the repository, use relative paths.
- For READMEs, link to the `docs/` folder for deeper architectural or procedural details.
- Avoid absolute URLs for internal links to ensure they work in forks and local clones.

## Naming

- Always use **Libre-Q** (not "Open-Q") when referring to the project.
- Use consistent terminology: "participants" (not "respondents" or "subjects"), "statements" (not "items" or "cards"), "workspace" (not "organization" or "team").
