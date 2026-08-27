# Documentation Style Guide

To maintain consistency and professionalism across Qualis documentation, please follow these guidelines.

## Diátaxis document types

Choose one primary reader need before writing:

| Type | Reader need | Writing rule |
| ---- | ----------- | ------------ |
| Tutorial | Learn by completing a guided path | Control the sequence, state prerequisites, and end with a visible result. |
| How-to guide | Complete a specific task | Start from a goal, use executable steps, and link to reference for exhaustive facts. |
| Reference | Look up exact information | Organize for scanning; state types, defaults, constraints, and behavior without teaching a journey. |
| Explanation | Understand why the system or method has its shape | Develop context, rationale, trade-offs, and relationships without becoming a procedure. |

Do not combine two document types merely because they concern the same feature. Link
between them instead. Contributor policies and workflows may remain under
`docs/contributing/`, but each page should still identify whether it primarily teaches,
guides, specifies, or explains.

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

- Always use **Qualis** (not "Open-Q") when referring to the project.
- Use consistent terminology: "participants" (not "respondents" or "subjects"), "statements" (not "items" or "cards"), "project" (not "organization" or "team").
