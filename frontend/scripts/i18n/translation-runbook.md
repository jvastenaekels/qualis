# Translation runbook

Procedure for translating `frontend/public/locales/en/translation.json` into a new
locale using an interactive Claude Code session. Claude (the agent) reads this file,
the glossary, and the English translation, then writes the target locale file in
place.

## Inputs

- `frontend/public/locales/en/translation.json` — source of truth, ~2647 keys.
- `frontend/scripts/i18n/glossaries/<code>.yaml` — Q-methodology + product
  terminology for the target language. **Must exist and be reviewed before
  translation starts.**

## Output

- `frontend/public/locales/<code>/translation.json` — full translation, same key
  set as the English file, every leaf translated.

## Hard rules

1. **Preserve every key path exactly.** No additions, no deletions, no renames.
2. **Preserve every `{{placeholder}}`** by name and position. `{{count}}` stays
   `{{count}}`, never `{{conteo}}`. i18next placeholder names are case-sensitive.
3. **Preserve HTML tags, attributes, and entities.** `<strong>` stays `<strong>`.
   `&nbsp;` stays `&nbsp;`. Translate only text nodes.
4. **Preserve `\n`, `\t`, and Unicode punctuation** that carries meaning (em dash,
   curly quotes if they appear).
5. **Do not translate identifier-like values.** Slugs, URLs, technical codes (e.g.
   `"resume_code"`, `"#FFFFFF"`), single emoji characters: keep verbatim.
6. **Emit JSON valid for `json.loads`.** No trailing commas. Escape quotes inside
   strings.
7. **Honour the glossary.** Every term listed in `glossaries/<code>.yaml`
   `terms:` is the only acceptable rendering of that English term in this locale.

## Chunking order

Translate top-level namespaces in this order, one at a time. After each, write
the partial output to the target file via `Edit`, re-read the glossary, then
move to the next.

1. `common`
2. `layout`
3. `footer`
4. `errors`
5. `landing`
6. `auth`
7. `welcome`
8. `consent`
9. `presort`
10. `rough`
11. `fine`
12. `post`
13. `audio`
14. `resume`
15. `erasure`
16. `study`
17. `admin` — **largest namespace (~75% of the file).** Sub-chunk by its
    second-level keys (e.g. `admin.dashboard`, `admin.studies`,
    `admin.recruitment`, `admin.concourses`, `admin.analysis`, `admin.members`,
    `admin.settings`, etc.). Translate one sub-namespace at a time.

## Per-chunk procedure

1. Read the chunk from `en/translation.json` in full.
2. Re-read `glossaries/<code>.yaml` (the entire file, not just `terms`).
3. Translate every leaf value, respecting the hard rules and the glossary.
4. Write the chunk into `public/locales/<code>/translation.json` using `Edit`
   (or `Write` if the file does not yet exist — initialise with the full English
   file first, then overwrite namespace by namespace).
5. Before moving to the next chunk, spot-check three translations in the chunk
   you just wrote for terminology consistency with what you wrote earlier.

## Stop conditions

The locale is ready for human review when **all** of these hold:

- `npm run i18n-check` reports `✓ Perfect sync.` for the new locale.
- `python3 frontend/scripts/i18n/check_interpolations.py <code>` reports
  `✓ <code>: interpolations OK`.
- No English text remains in the target file. Quick check:
  `python3 -c "import json,re; d=json.load(open('frontend/public/locales/<code>/translation.json')); ..."`
  — or open the file and scan visually for stop-words like ` the `, ` and `,
  ` is `.
- The file parses as valid JSON:
  `python3 -c "import json; json.load(open('frontend/public/locales/<code>/translation.json'))"`.

## Human review checklist

The author (not the agent) reviews these namespaces line by line before opening
the PR:

- [ ] `common.*` — buttons, generic UI verbs, status labels.
- [ ] `auth.*` — login, registration, verification flows, legal-adjacent wording.
- [ ] `consent.*` — compliance wording.
- [ ] `welcome.*`, `presort.*`, `rough.*`, `fine.*`, `post.*` — participant
      critical path.
- [ ] `admin.studies.*` — researcher-facing study designer copy.
- [ ] `admin.recruitment.*` — researcher-facing recruitment flow.
- [ ] `errors.*` — error messages a user might actually see.

## Visual review

Run `cd frontend && npm run dev`, open the app, switch to the new language via
the sidebar selector or `?lang=<code>` querystring, and walk:

- The participant flow on a 1280×800 viewport.
- The admin dashboard and one study's designer page.
- The recruitment dashboard.

Note any overflow on long words (especially in `nl` and `pl`); fix in the same
PR by tightening copy or adding `truncate` / `min-w-0` where needed.
