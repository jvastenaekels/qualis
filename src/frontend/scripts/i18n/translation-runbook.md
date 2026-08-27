# Translation runbook

Procedure for translating the i18n locale files into a new language using an
interactive Claude Code session. Claude reads this file, the glossary, and the
English source files, then writes the target locale files in place.

After the namespace split (PRs #157/#158/#159), each locale ships two files
with **differentiated parity policy**:

- `participant.json` — **mandatory**, strict parity enforced by CI.
- `admin.json` — **optional**, best-effort parity (mismatches warn but pass CI).
  A locale may legitimately skip admin entirely; i18next falls back to
  `en/admin.json` at runtime.

## Inputs

- `frontend/public/locales/en/participant.json` — mandatory source of truth,
  ~25 KB, 15 top-level namespaces (`common`, `layout`, `footer`, `errors`,
  `landing`, `welcome`, `consent`, `presort`, `rough`, `fine`, `post`, `audio`,
  `resume`, `erasure`, `study`).
- `frontend/public/locales/en/admin.json` — optional source, ~114 KB, 2
  top-level namespaces (`admin`, `auth`). Skip for participant-only locales.
- `frontend/scripts/i18n/glossaries/<code>.yaml` — Q-methodology + product
  terminology for the target language. **Must exist and be reviewed before
  translation starts.**

## Outputs

- `frontend/public/locales/<code>/participant.json` — **mandatory**, full
  translation, same key set as `en/participant.json`, every leaf translated.
- `frontend/public/locales/<code>/admin.json` — optional. If shipped, set
  `hasAdmin: true` in `SUPPORTED_LANGUAGES` for this code; if skipped, set
  `hasAdmin: false` so the admin sidebar selector doesn't offer the locale.

## Hard rules

1. **Preserve every key path exactly.** No additions, no deletions, no renames.
2. **Preserve every `{{placeholder}}`** by name and position. `{{count}}` stays
   `{{count}}`, never `{{conteo}}`. i18next placeholder names are case-sensitive.
3. **Preserve HTML tags, attributes, and entities.** `<strong>` stays
   `<strong>`. `&nbsp;` stays `&nbsp;`. Translate only text nodes.
4. **Preserve `\n`, `\t`, and Unicode punctuation** that carries meaning (em
   dash, curly quotes if they appear).
5. **Do not translate identifier-like values.** Slugs, URLs, technical codes
   (e.g. `"resume_code"`, `"#FFFFFF"`), single emoji characters: keep verbatim.
6. **Emit JSON valid for `json.loads`.** No trailing commas. Escape quotes
   inside strings. UTF-8, 4-space indent, trailing newline (project
   convention).
7. **Honour the glossary.** Every term listed in `glossaries/<code>.yaml`
   `terms:` is the only acceptable rendering of that English term in this
   locale.

## Chunking order

Translate one top-level namespace at a time. After each, write the partial
output to the target file via `Edit`, re-read the glossary, then move to the
next.

### `participant.json` (mandatory)

1. `common`
2. `layout`
3. `footer`
4. `errors`
5. `landing`
6. `welcome`
7. `consent`
8. `presort`
9. `rough`
10. `fine`
11. `post`
12. `audio`
13. `resume`
14. `erasure`
15. `study`

### `admin.json` (optional — skip entirely for participant-only locales)

16. `auth` — login, registration, 2FA, password reset, email verification.
17. `admin` — **largest namespace (~75% of admin.json's size).** Sub-chunk by
    its second-level keys (e.g. `admin.dashboard`, `admin.studies`,
    `admin.recruitment`, `admin.concourses`, `admin.analysis`, `admin.members`,
    `admin.settings`, etc.). Translate one sub-namespace at a time.

## Per-chunk procedure

1. Read the chunk from `en/<namespace>.json` in full.
2. Re-read `glossaries/<code>.yaml` (the entire file, not just `terms`).
3. Translate every leaf value, respecting the hard rules and the glossary.
4. Write the chunk into `public/locales/<code>/<namespace>.json` using `Edit`
   (or `Write` if the file does not yet exist — initialise with the English
   file first, then overwrite namespace by namespace).
5. Before moving to the next chunk, spot-check three translations in the chunk
   you just wrote for terminology consistency with what you wrote earlier.

## Stop conditions

The locale is ready for human review when **all** of these hold:

- `npm run i18n-check` reports `✓ <lang>/participant.json in sync` (mandatory).
  If admin was translated, also `✓ <lang>/admin.json in sync`; if admin was
  skipped, a `⚠️ <lang>/admin.json missing (best-effort, EN fallback)`
  warning is the expected output and does **not** block.
- `python3 frontend/scripts/i18n/check_interpolations.py <code>` reports
  `✓ <code>/participant.json: interpolations OK`. Admin warnings (if any) are
  acceptable.
- No English text remains in the translated files. Quick check: open the
  generated file and scan visually for stop-words like ` the `, ` and `,
  ` is `.
- The file parses as valid JSON:
  `python3 -c "import json; json.load(open('frontend/public/locales/<code>/participant.json'))"`.

## Human review checklist (mandatory namespaces)

The author (not the agent) reviews these namespaces line by line before opening
the PR:

- [ ] `common.*` — buttons, generic UI verbs, status labels.
- [ ] `consent.*` — compliance wording.
- [ ] `welcome.*`, `presort.*`, `rough.*`, `fine.*`, `post.*` — participant
      critical path.
- [ ] `errors.*` — error messages a user might actually see.

If admin was translated, additionally:

- [ ] `auth.*` — login, registration, verification flows, legal-adjacent
      wording.
- [ ] `admin.studies.*` — researcher-facing study designer copy.
- [ ] `admin.recruitment.*` — researcher-facing recruitment flow.

## Visual review

Run `cd frontend && npm run dev`, open the app, switch to the new language via
the sidebar selector or `?lang=<code>` querystring, and walk:

- The participant flow on a 1280×800 viewport (mandatory).
- If admin was translated: the admin dashboard and one study's designer page,
  plus the recruitment dashboard.

Note any overflow on long words (especially in `nl` and `pl`); fix in the same
PR by tightening copy or adding `truncate` / `min-w-0` where needed.

If admin was **not** translated, expect the admin chrome to render in English
when the new locale is active via `?lang=<code>` — that is the intended
fallback behaviour. Confirm the admin sidebar selector does **not** offer the
new locale (because `hasAdmin: false` filters it out via `getAdminLanguages()`).
