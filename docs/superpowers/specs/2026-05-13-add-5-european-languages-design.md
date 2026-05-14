# Add Five European Languages — Design

**Date:** 2026-05-13
**Status:** Draft, pending implementation plan
**Scope:** Frontend SPA (`frontend/`), no backend changes, emails out of scope
**Languages added:** Spanish (`es`), Italian (`it`), Dutch (`nl`), Polish (`pl`), Portuguese (`pt`)

## Problem

Qualis ships UI translations in four locales today: `en`, `fr`, `fi`, `de`. To broaden accessibility for European researchers and participants, we add the five largest EU language communities not yet covered. The work is conceptually trivial (declare the language + drop a translation file in the right place) but produces ~13 000 lines of translated JSON whose quality and key-parity must be guaranteed before merge.

## Decisions

### Scope

**In scope.**
- 5 new locales: `es`, `it`, `nl`, `pl`, `pt`, each shipped with a 100% complete `translation.json` matching the key set of `en/translation.json`.
- Declarations in `frontend/src/i18n.ts` (`SUPPORTED_I18N_LANGUAGES`) and `frontend/src/constants/languages.ts` (`SUPPORTED_LANGUAGES`).
- A translation runbook + per-language glossaries + an interpolation validator, living in `frontend/scripts/i18n/`.
- A new CI check (`check_interpolations.py`) wired into `make check`.

**Out of scope.**
- Localising outbound emails (`backend/app/utils/email.py` remains English-only — matches current parity with `fr/fi/de`).
- Adding a `preferred_language` field to the user model.
- Localised number/date formatting (already handled by `Intl`).
- Pluralisation refactor (i18next's `_one`/`_few`/`_many` already supported; only adopted per-locale if a real key requires it).
- Right-to-left support (none of the five languages need it).
- Backend migrations. `language_code` is `Mapped[str]` with regex `^[a-z]{2}(-[A-Z]{2})?$` and `max_length=5`, already permissive.

### Architecture

The change splits into four independent units. Each can be reasoned about and reviewed on its own.

**1. Language declarations** — 2 files, 1 entry per language in each.

- `frontend/src/i18n.ts:12` — add `'es', 'it', 'nl', 'pl', 'pt'` to `SUPPORTED_I18N_LANGUAGES`.
- `frontend/src/constants/languages.ts:7` — append five `{ code, label, flag }` entries.

The flag emojis are `🇪🇸 🇮🇹 🇳🇱 🇵🇱 🇵🇹`. Labels are endonymic (`Español`, `Italiano`, `Nederlands`, `Polski`, `Português`), matching the existing convention (`Français`, `Suomi`, `Deutsch`).

All UI consumers (`AppSidebar`, `CreateStudyDialog`, `LanguageManagerModal`, `IntroductionEditor`, `ConcourseDetailPage`, `MultiLangFieldIcon`) already iterate over `SUPPORTED_LANGUAGES` — no further code change required.

**2. Translation files** — 5 new files, ~2647 keys each, 100% complete at merge time.

- `frontend/public/locales/<code>/translation.json` for each new code.
- Strict key parity with `en/translation.json` is enforced by the existing `npm run i18n-check` and `locales.test.ts` — no separate setup needed.

**3. Translation tooling** — new directory `frontend/scripts/i18n/`.

- `frontend/scripts/i18n/translation-runbook.md` — the procedure a Claude Code session follows to translate one locale: chunking order, hard rules, validation steps, human-review checklist.
- `frontend/scripts/i18n/glossaries/<code>.yaml` — 15-30 Q-methodology + product terms per language with their validated translation. Written manually (with LLM assistance acceptable) the first time a language is added; treated as a contract for future re-translations.
- `frontend/scripts/i18n/check_interpolations.py` — validator described below.

**4. Interpolation validator + CI wiring.**

`check_interpolations.py` walks every key in `en/translation.json`, extracts the set of `{{…}}` placeholders, and compares it against each declared non-`en` locale. Any per-key mismatch (missing placeholder, extra placeholder, renamed placeholder) is a hard failure. Added to `make check` alongside `check_i18n`.

### Translation workflow (per language)

Translation is performed by **Claude Code in an interactive session**, not by a script that calls the Anthropic API. The tooling is a runbook + glossary + validator; Claude reads them and produces the JSON file in place.

For each new language:

1. **Glossary first.** Author writes `frontend/scripts/i18n/glossaries/<code>.yaml` with the agreed renderings of Q-methodology and product terms (concourse, Q-sort, statement, factor, presort, rough sort, fine sort, study, recruitment, participant, member, owner, …). This is the lever for terminological consistency; everything downstream depends on it.

2. **Translation pass.** Author opens a Claude Code session in the repo and asks Claude to translate the locale following `frontend/scripts/i18n/translation-runbook.md`. Claude:
   - Loads `en/translation.json` and the language's glossary into context.
   - Processes top-level namespaces in order (`common`, `layout`, `study`, `auth`, `welcome`, `consent`, `presort`, `rough`, `fine`, `post`, `audio`, `resume`, `landing`, `erasure`, `footer`, `errors`, `admin`). For `admin` (~76 KB, ~75% of the file), Claude sub-chunks by its second-level keys.
   - After each namespace, writes the partial output to `public/locales/<code>/translation.json` via `Write`/`Edit` and runs `npm run i18n-check` mentally (the script tolerates partial-then-complete states because we only commit once full).
   - Before moving to a new namespace, re-reads the glossary and a sample of already-translated entries to maintain consistency.

3. **Mechanical validation.** Author runs:
   ```bash
   cd frontend
   npm run i18n-check
   python3 scripts/i18n/check_interpolations.py <code>
   ```
   Any failure → Claude fixes the offending entries, re-validates.

4. **Human review.** Author opens the new `translation.json` and reviews at minimum:
   - `common.*` (buttons, generic UI verbs)
   - `auth.*` (legal-sounding flows)
   - `consent.*` (compliance-adjacent wording)
   - `admin.studies.*` and `admin.recruitment.*` (researcher-facing copy with terminology weight)
   - `welcome.*`, `presort.*`, `rough.*`, `fine.*`, `post.*` (participant-facing critical path)

   Native-speaker review is strongly preferred where available. Corrections are made inline.

5. **Visual review.** Author runs `npm run dev`, switches to the new language via the `AppSidebar` selector or the `?lang=<code>` querystring, and spot-checks dense screens (study designer toolbar, recruitment dashboard, admin sidebar). Long-word locales (`nl`, `pl`) may surface overflow that needs a copy or layout tweak.

6. **PR.** Author runs `make ci` locally, opens a single PR named `feat(i18n): add <Language> locale` containing exactly: the two constant updates, the new `translation.json`, and (only for the first language) the new tooling in `frontend/scripts/i18n/`.

### Delivery: five independent PRs

Each language ships in its own PR. No batched super-PR.

- One PR per language keeps the review surface tractable (~2.6 KLOC of JSON each).
- Native-speaker reviewers can be invited per language without seeing irrelevant locales.
- Regression risk per merge stays minimal.
- If a language fails review (terminology disagreement, missed terms), only that PR is blocked.

The tooling (`translation-runbook.md`, `check_interpolations.py`) ships **with the first language PR** (likely `es`). Subsequent PRs only add their `translation.json`, glossary file, and the two-line constants edit. The recent `feat(i18n): add German locale` commit (`5c202da7`) is the template.

**Suggested order:** `es → it → pt → nl → pl`. Technically indifferent; this order reflects expected ease of finding a native reviewer.

**Drift handling.** Between PRs, `en/translation.json` may gain new keys. The next language PR rebases onto `main`, then Claude re-runs a complete pass on the newly-added keys for in-flight locales (already-translated locales are caught by `make check` failing in their respective branches; the simplest fix is a small follow-up PR per language that adds the missing keys).

### Risks and mitigations

- **Interpolation corruption.** LLM may rewrite `{{count}}` as `{{compte}}` or drop it. → `check_interpolations.py` blocks merge.
- **Key drift / hallucinated keys.** LLM may invent or drop keys in long namespaces. → `npm run i18n-check` (existing) blocks merge with exit 1 on missing or extra keys.
- **Glossary not respected.** LLM may revert to a generic rendering for a term mid-document. → Glossary loaded at session start + re-read before each namespace + human review pass.
- **UI overflow** on long German-style compounds in `nl`/`pl`. → Visual review step before each PR; copy tightening or `text-ellipsis`/`truncate` adjustments are acceptable in the same PR.
- **Language selector height.** `AppSidebar`'s `DropdownMenu` will list 9 entries. → Visible from the first new-language PR; if it overflows the viewport on a small screen, switch to a scrollable popover (one-line fix). No proactive change.
- **Polish pluralisation.** Polish has `one`/`few`/`many`/`other`. → If any `en` key encodes a count, i18next's `_one`/`_few`/`_many` suffix syntax handles it. We do **not** add pluralisation keys proactively; we add them only if review surfaces a sentence where the singular/plural rendering is wrong.
- **Endonym vs exonym in language labels.** Convention is endonymic (`Español`, not `Spanish`). Confirmed by the existing `Français`/`Suomi`/`Deutsch` triplet.

### Tooling files — concrete contents

**`frontend/scripts/i18n/translation-runbook.md`** (sketch — to be authored as part of the first PR):

- Goal and scope (one paragraph).
- Inputs: `en/translation.json`, `glossaries/<code>.yaml`.
- Output: `public/locales/<code>/translation.json`.
- Hard rules: preserve keys; preserve `{{var}}`, HTML tags, `\n`, Unicode punctuation; never translate slug-like values; emit valid JSON only.
- Chunking order (the 17 top-level namespaces; sub-chunk `admin` by second-level key).
- Per-chunk procedure: read glossary → translate → write to file → mental parity check.
- Stop conditions: `npm run i18n-check` passes; `check_interpolations.py <code>` passes.
- Human review checklist (the namespaces listed in step 4 above).

**`frontend/scripts/i18n/glossaries/<code>.yaml`** (template):

```yaml
# Q-methodology and product terminology for <Language>.
# Used by Claude Code during translation. Edit before translating; treat as a contract.
terms:
  concourse: <translation>
  Q-sort: <translation>
  Q-set: <translation>
  statement: <translation>
  factor: <translation>
  presort: <translation>
  rough sort: <translation>
  fine sort: <translation>
  study: <translation>
  recruitment: <translation>
  participant: <translation>
  member: <translation>
  owner: <translation>
  consent: <translation>
  audio recording: <translation>
  memo: <translation>
  # … 15-30 entries total
notes: |
  - Tone: formal academic, but accessible to non-specialist participants.
  - When in doubt between exonym and endonym for methodological terms, prefer endonym.
```

**`frontend/scripts/i18n/check_interpolations.py`** (sketch):

```python
"""Verify interpolation parity between en/translation.json and every other locale.

For each key, the set of {{...}} placeholders in en must equal the set in the target locale.
Exits 1 on any mismatch.
"""
import json, os, re, sys
from i18n_utils import iter_leaf_strings  # existing helper in scripts/

PLACEHOLDER = re.compile(r"\{\{([^}]+)\}\}")
# Walk en/translation.json, build {key_path: frozenset_of_placeholders}.
# For each non-en locale, walk and compare per key_path.
# Report missing/extra/renamed placeholders. Exit 1 if any.
```

Add to `frontend/package.json` scripts: `"check-interpolations": "python3 scripts/i18n/check_interpolations.py"`.

Add to `Makefile` `check` target: invoke `npm run check-interpolations` after `npm run i18n-check`.

### Files touched (cumulative across the 5 PRs)

**First PR (e.g. `es`):**
- `frontend/src/i18n.ts` — 1 line
- `frontend/src/constants/languages.ts` — 1 line
- `frontend/public/locales/es/translation.json` — new, ~2647 keys
- `frontend/scripts/i18n/translation-runbook.md` — new
- `frontend/scripts/i18n/glossaries/es.yaml` — new
- `frontend/scripts/i18n/check_interpolations.py` — new
- `frontend/package.json` — add `check-interpolations` script
- `Makefile` — wire into `check`

**Each subsequent PR (`it`, `nl`, `pl`, `pt`):**
- `frontend/src/i18n.ts` — 1 line
- `frontend/src/constants/languages.ts` — 1 line
- `frontend/public/locales/<code>/translation.json` — new
- `frontend/scripts/i18n/glossaries/<code>.yaml` — new

## Acceptance criteria

A language PR is mergeable when:

1. `make ci` passes (lint + types + i18n-check + interpolation-check + tests + build).
2. The language appears in the `AppSidebar` selector with correct label and flag.
3. Switching to it via `?lang=<code>` renders the participant flow (welcome → consent → presort → rough sort → fine sort → post → resume) without any visible English fallback.
4. The admin landing (`/app/dashboard`) and one study designer page render without overflow on a 1280×800 viewport.
5. The glossary YAML exists and contains at least 15 terms.
6. Human review of the namespaces listed in workflow step 4 has been performed; no LLM-tell phrasings remain (e.g. "Sumérgete en…", "En el ámbito de…" patterns).

## Non-goals (for clarity)

- Not adding a language-preference field to the user model.
- Not localising email content.
- Not introducing Crowdin / Weblate / any external TMS.
- Not changing the i18n loader, the namespace structure, or the file-per-language layout.
- Not adding RTL support, BiDi tooling, or non-Latin script font fallbacks.
- Not pre-emptively splitting `translation.json` into multiple namespace files (would be a bigger refactor; current single-file layout is what we ship).
