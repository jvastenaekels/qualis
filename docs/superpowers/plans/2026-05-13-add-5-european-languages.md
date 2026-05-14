# Add Five European Languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship UI translations for Spanish, Italian, Dutch, Polish, and Portuguese in five independent PRs, with a small Python validator and a Claude-Code-driven translation procedure to guarantee key parity and interpolation correctness.

**Architecture:** First PR bootstraps the tooling (interpolation validator, runbook, `make check` wiring) and ships the first locale. Each subsequent PR adds one locale by writing its glossary, declaring the language in two constants files, generating the JSON via a Claude Code session that follows the runbook, and passing all CI checks. No backend changes; emails out of scope.

**Tech Stack:** TypeScript (React + i18next), Python 3.13 (validator + `check_i18n.py`), JSON locale files, GNU Make, YAML glossaries.

**Reference spec:** `docs/superpowers/specs/2026-05-13-add-5-european-languages-design.md`.

---

## File Map

**New files (first PR only — tooling):**
- `frontend/scripts/i18n/check_interpolations.py` — validator: per-key `{{var}}` parity across locales.
- `frontend/scripts/i18n/test_check_interpolations.py` — pytest tests for the validator.
- `frontend/scripts/i18n/translation-runbook.md` — procedure Claude Code follows to translate a locale.
- `frontend/scripts/i18n/glossaries/.gitkeep` — keep the directory.

**New files (each language PR):**
- `frontend/scripts/i18n/glossaries/<code>.yaml` — Q-methodology + product terminology for the language.
- `frontend/public/locales/<code>/translation.json` — full translation (~2647 keys).

**Modified files (every language PR):**
- `frontend/src/i18n.ts` — append code to `SUPPORTED_I18N_LANGUAGES`.
- `frontend/src/constants/languages.ts` — append `{ code, label, flag }` entry.

**Modified files (first PR only — wiring):**
- `Makefile` — add `npm run check-interpolations` after `npm run i18n-check` in the `check` target.
- `frontend/package.json` — add `"check-interpolations"` npm script.

---

## Phase 1 — First PR: tooling + Spanish (`es`)

### Task 1: Add the interpolation validator with tests

**Files:**
- Create: `frontend/scripts/i18n/check_interpolations.py`
- Create: `frontend/scripts/i18n/test_check_interpolations.py`
- Create: `frontend/scripts/i18n/glossaries/.gitkeep`

- [ ] **Step 1: Create directory and write failing tests**

```bash
mkdir -p frontend/scripts/i18n/glossaries
touch frontend/scripts/i18n/glossaries/.gitkeep
```

Create `frontend/scripts/i18n/test_check_interpolations.py`:

```python
"""Tests for the interpolation parity validator."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from check_interpolations import (  # noqa: E402
    check_locale,
    extract_placeholders,
    walk,
)


class TestExtractPlaceholders:
    def test_no_placeholders(self):
        assert extract_placeholders("Hello world") == frozenset()

    def test_single_placeholder(self):
        assert extract_placeholders("Hello {{name}}") == frozenset({"name"})

    def test_multiple_placeholders(self):
        assert extract_placeholders("{{count}} of {{total}}") == frozenset(
            {"count", "total"}
        )

    def test_with_whitespace(self):
        assert extract_placeholders("Hi {{ name }}") == frozenset({"name"})

    def test_non_string_returns_empty(self):
        assert extract_placeholders(None) == frozenset()
        assert extract_placeholders(42) == frozenset()
        assert extract_placeholders(["a"]) == frozenset()


class TestWalk:
    def test_flat_dict(self):
        result = dict(walk({"a": "1", "b": "2"}))
        assert result == {"a": "1", "b": "2"}

    def test_nested_dict(self):
        result = dict(walk({"a": {"b": "v"}}))
        assert result == {"a.b": "v"}

    def test_deeply_nested(self):
        result = dict(walk({"x": {"y": {"z": "v"}}}))
        assert result == {"x.y.z": "v"}

    def test_skips_non_string_leaves(self):
        result = dict(walk({"a": 42, "b": None, "c": "ok"}))
        assert result == {"c": "ok"}


class TestCheckLocale:
    def test_perfect_match_returns_no_errors(self):
        en = {"msg": "Hello {{name}}"}
        target = {"msg": "Hola {{name}}"}
        assert check_locale(en, target) == []

    def test_missing_placeholder_is_error(self):
        en = {"msg": "Hello {{name}}"}
        target = {"msg": "Hola"}
        errors = check_locale(en, target)
        assert len(errors) == 1
        assert errors[0]["key"] == "msg"
        assert errors[0]["expected"] == ["name"]
        assert errors[0]["found"] == []

    def test_renamed_placeholder_is_error(self):
        en = {"msg": "Hello {{name}}"}
        target = {"msg": "Hola {{nombre}}"}
        errors = check_locale(en, target)
        assert len(errors) == 1
        assert errors[0]["expected"] == ["name"]
        assert errors[0]["found"] == ["nombre"]

    def test_extra_placeholder_is_error(self):
        en = {"msg": "Hello {{name}}"}
        target = {"msg": "Hola {{name}} {{extra}}"}
        errors = check_locale(en, target)
        assert len(errors) == 1

    def test_no_placeholders_in_en_is_skipped(self):
        en = {"msg": "Hello world"}
        target = {"msg": "Hola {{rogue}}"}
        assert check_locale(en, target) == []

    def test_missing_target_key_is_skipped(self):
        # check_i18n.py owns missing-key reporting.
        en = {"msg": "Hello {{name}}", "other": "x"}
        target = {"other": "y"}
        assert check_locale(en, target) == []

    def test_multiple_keys_reported_independently(self):
        en = {"a": "{{x}}", "b": "{{y}}"}
        target = {"a": "no var", "b": "{{y}}"}
        errors = check_locale(en, target)
        assert len(errors) == 1
        assert errors[0]["key"] == "a"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend/scripts/i18n && python3 -m pytest test_check_interpolations.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'check_interpolations'`.

- [ ] **Step 3: Implement the validator**

Create `frontend/scripts/i18n/check_interpolations.py`:

```python
"""Verify interpolation parity between en/translation.json and every other locale.

For each key whose en value contains {{placeholders}}, the set of placeholders
in the target locale must equal the en set. Missing, renamed, or extra
placeholders are reported as errors.

Missing keys (target lacks a key present in en) are not reported here —
`scripts/check_i18n.py` owns that check.

Usage:
    python3 frontend/scripts/i18n/check_interpolations.py            # all non-en locales
    python3 frontend/scripts/i18n/check_interpolations.py es it      # specific locales
"""
import json
import re
import sys
from pathlib import Path
from typing import Iterator

PLACEHOLDER_RE = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")


def extract_placeholders(value: object) -> frozenset[str]:
    """Return placeholders found in a string value, empty set otherwise."""
    if not isinstance(value, str):
        return frozenset()
    return frozenset(m.group(1).strip() for m in PLACEHOLDER_RE.finditer(value))


def walk(data: object, prefix: str = "") -> Iterator[tuple[str, str]]:
    """Yield (dotted-key-path, string-value) for every leaf string."""
    if isinstance(data, dict):
        for k, v in data.items():
            new_prefix = f"{prefix}.{k}" if prefix else k
            yield from walk(v, new_prefix)
    elif isinstance(data, str):
        yield prefix, data


def check_locale(en_data: dict, target_data: dict) -> list[dict]:
    """Return a list of mismatch dicts: {key, expected, found}."""
    target_map = dict(walk(target_data))
    errors: list[dict] = []
    for key, en_value in walk(en_data):
        en_placeholders = extract_placeholders(en_value)
        if not en_placeholders:
            continue
        if key not in target_map:
            continue
        target_placeholders = extract_placeholders(target_map[key])
        if en_placeholders != target_placeholders:
            errors.append(
                {
                    "key": key,
                    "expected": sorted(en_placeholders),
                    "found": sorted(target_placeholders),
                }
            )
    return errors


def main() -> int:
    locales_dir = Path(__file__).resolve().parent.parent.parent / "public" / "locales"
    en_path = locales_dir / "en" / "translation.json"
    if not en_path.exists():
        print(f"Error: {en_path} not found.", file=sys.stderr)
        return 1
    with open(en_path, encoding="utf-8") as f:
        en_data = json.load(f)

    if len(sys.argv) > 1:
        targets = sys.argv[1:]
    else:
        targets = sorted(
            d.name
            for d in locales_dir.iterdir()
            if d.is_dir() and d.name != "en"
        )

    overall_ok = True
    for code in targets:
        target_path = locales_dir / code / "translation.json"
        if not target_path.exists():
            print(f"⚠️  {code}: translation.json not found")
            overall_ok = False
            continue
        with open(target_path, encoding="utf-8") as f:
            target_data = json.load(f)
        errors = check_locale(en_data, target_data)
        if errors:
            overall_ok = False
            print(f"❌ {code}: {len(errors)} interpolation mismatch(es)")
            for e in errors:
                print(f"   {e['key']}: expected {e['expected']}, got {e['found']}")
        else:
            print(f"✓ {code}: interpolations OK")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend/scripts/i18n && python3 -m pytest test_check_interpolations.py -v`

Expected: PASS — all 17 tests pass.

- [ ] **Step 5: Run validator against current 4 locales — must pass**

Run: `python3 frontend/scripts/i18n/check_interpolations.py`

Expected: `✓ de: interpolations OK`, `✓ fi: interpolations OK`, `✓ fr: interpolations OK`. Exit 0.

If this fails on existing locales, that is a real existing bug; pause and surface it before continuing.

- [ ] **Step 6: Commit**

```bash
git add frontend/scripts/i18n/check_interpolations.py \
        frontend/scripts/i18n/test_check_interpolations.py \
        frontend/scripts/i18n/glossaries/.gitkeep
git commit -m "feat(i18n): add interpolation parity validator"
```

---

### Task 2: Wire the validator into `make check`

**Files:**
- Modify: `frontend/package.json`
- Modify: `Makefile:76` (insert after the `i18n-check` line)

- [ ] **Step 1: Add the npm script**

In `frontend/package.json`, find the `"scripts"` block and the line `"i18n-check": "python3 scripts/check_i18n.py"`. Add immediately after it:

```json
"check-interpolations": "python3 scripts/i18n/check_interpolations.py",
```

- [ ] **Step 2: Wire into Makefile `check` target**

In `Makefile`, find line 76:
```makefile
	cd frontend && npm run i18n-check
```

Append a new line directly below it:
```makefile
	cd frontend && npm run check-interpolations
```

- [ ] **Step 3: Verify it runs**

Run: `make check`

Expected: existing checks plus `✓ de: interpolations OK` etc., all green.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json Makefile
git commit -m "ci(i18n): wire interpolation check into make check"
```

---

### Task 3: Write the translation runbook

**Files:**
- Create: `frontend/scripts/i18n/translation-runbook.md`

- [ ] **Step 1: Write the runbook**

Create `frontend/scripts/i18n/translation-runbook.md` with the following content:

````markdown
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
   `{{count}}`, never `{{conteo}}`.
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
- No English text remains in the target file (a quick grep for common English
  stopwords like ` the `, ` and `, ` is ` returns nothing meaningful).
- The file parses as valid JSON: `python3 -c "import json; json.load(open('frontend/public/locales/<code>/translation.json'))"`.

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
````

- [ ] **Step 2: Commit**

```bash
git add frontend/scripts/i18n/translation-runbook.md
git commit -m "docs(i18n): add translation runbook for new locales"
```

---

### Task 4: Author the Spanish glossary

**Files:**
- Create: `frontend/scripts/i18n/glossaries/es.yaml`

- [ ] **Step 1: Write the glossary**

Create `frontend/scripts/i18n/glossaries/es.yaml`:

```yaml
# Q-methodology and product terminology for Spanish (es).
# Used by Claude Code during translation. Edit before translating; treat as a contract.
language: es
language_name: Español

terms:
  concourse: concurso
  Q-methodology: metodología Q
  Q-sort: clasificación Q
  Q-set: conjunto Q
  statement: enunciado
  factor: factor
  factor analysis: análisis factorial
  presort: pre-clasificación
  rough sort: clasificación inicial
  fine sort: clasificación fina
  postsort: post-clasificación
  study: estudio
  study design: diseño del estudio
  recruitment: reclutamiento
  participant: participante
  member: miembro
  owner: propietario
  consent: consentimiento
  consent form: formulario de consentimiento
  audio recording: grabación de audio
  memo: memo
  draft: borrador
  resume code: código de reanudación
  invitation: invitación
  workspace: proyecto      # legacy term, surface label is now "project"
  project: proyecto

notes: |
  - Tone: formal but accessible. Use the "usted" form for participants and
    administrators alike (matches Spain + Latin America academic norms).
  - Prefer endonymic methodological terms (clasificación Q rather than Q-sort)
    except inside section titles where "Q" is a label of art.
  - Numbers: keep decimal points unless a per-locale formatter handles it
    elsewhere (Qualis uses Intl, so do not edit numeric tokens).
  - Buttons (`Save`, `Cancel`, `Continue`): prefer the imperative second-person
    plural / impersonal form ("Guardar", "Cancelar", "Continuar").
```

- [ ] **Step 2: Commit**

```bash
git add frontend/scripts/i18n/glossaries/es.yaml
git commit -m "i18n(es): add Spanish terminology glossary"
```

---

### Task 5: Declare Spanish in the constants

**Files:**
- Modify: `frontend/src/i18n.ts:12`
- Modify: `frontend/src/constants/languages.ts:7-12`

- [ ] **Step 1: Update `i18n.ts`**

In `frontend/src/i18n.ts` line 12, change:
```ts
export const SUPPORTED_I18N_LANGUAGES = ['en', 'fr', 'fi', 'de'];
```
to:
```ts
export const SUPPORTED_I18N_LANGUAGES = ['en', 'fr', 'fi', 'de', 'es'];
```

- [ ] **Step 2: Update `constants/languages.ts`**

In `frontend/src/constants/languages.ts`, append before the closing `];`:
```ts
    { code: 'es', label: 'Español', flag: '🇪🇸' },
```

Final array:
```ts
export const SUPPORTED_LANGUAGES: Language[] = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'fi', label: 'Suomi', flag: '🇫🇮' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
];
```

- [ ] **Step 3: Verify the locale test fails (file not yet created)**

Run: `cd frontend && npm run test -- --run src/constants/locales.test.ts`

Expected: FAIL — `Missing translations.json for language: es`.

- [ ] **Step 4: Do NOT commit yet**

This task is intentionally left uncommitted; it commits together with Task 6.

---

### Task 6: Translate `es/translation.json` via Claude Code

**Files:**
- Create: `frontend/public/locales/es/translation.json`

This task is performed by an interactive Claude Code session. The plan-execution
agent does NOT translate inline; it dispatches or instructs the author to run
this in a fresh session, then resumes here.

- [ ] **Step 1: Bootstrap the target file with the English content**

```bash
mkdir -p frontend/public/locales/es
cp frontend/public/locales/en/translation.json frontend/public/locales/es/translation.json
```

This guarantees key parity from the start; translation overwrites values
namespace by namespace.

- [ ] **Step 2: Open a Claude Code session and translate**

Open Claude Code in the repo root and issue this prompt to the agent:

> Translate `frontend/public/locales/es/translation.json` from English to Spanish
> by following `frontend/scripts/i18n/translation-runbook.md` and the glossary
> at `frontend/scripts/i18n/glossaries/es.yaml`. Translate one top-level
> namespace at a time using `Edit`. After each namespace, do not move on until
> you have re-read the glossary and spot-checked three of the values you just
> wrote against it. Stop when the stop conditions in the runbook are all met.

The agent will iteratively `Edit` the file. Treat it as a long-running task —
expect ~17 namespace passes (more, since `admin` is sub-chunked).

- [ ] **Step 3: Run mechanical validation**

```bash
cd frontend
npm run i18n-check
python3 scripts/i18n/check_interpolations.py es
python3 -c "import json; json.load(open('public/locales/es/translation.json'))"
```

All three must pass. If any fails, return to step 2 with the specific failing
keys.

- [ ] **Step 4: Human review**

Walk through the namespaces listed in the runbook's "Human review checklist".
Edit the JSON file directly for any corrections — do not re-invoke the LLM for
small fixes.

- [ ] **Step 5: Visual review**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/?lang=es`. Walk the participant flow, the admin
dashboard, the study designer, the recruitment dashboard. Note overflow
issues and fix copy or layout inline.

- [ ] **Step 6: Run full local CI**

```bash
make ci
```

Must pass cleanly.

- [ ] **Step 7: Commit and open PR**

```bash
git add frontend/src/i18n.ts \
        frontend/src/constants/languages.ts \
        frontend/public/locales/es/translation.json
git commit -m "feat(i18n): add Spanish locale"
git push -u origin HEAD
gh pr create --title "feat(i18n): add Spanish locale" --body "$(cat <<'EOF'
## Summary
- Adds Spanish (`es`) UI translation, completing the work scoped in `docs/superpowers/specs/2026-05-13-add-5-european-languages-design.md` for this locale.
- Also lands the supporting tooling: `frontend/scripts/i18n/check_interpolations.py`, runbook, and `make check` wiring (first PR of five).

## Test plan
- [ ] `make ci` passes locally
- [ ] Visual smoke on participant flow + admin in Spanish
- [ ] Native-speaker review of `common`, `auth`, `consent`, participant flow, study designer

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 2 — Subsequent language PRs

Each remaining language (`it`, `nl`, `pl`, `pt`) follows the same five-step
pattern as Tasks 4–6 above, plus a `git pull --rebase origin main` at the
start. The tooling created in Phase 1 is already on `main` by then, so these
PRs do not touch `frontend/scripts/i18n/check_interpolations.py`, the runbook,
or the Makefile.

### Task 7: Add Italian (`it`)

- [ ] **Step 1: Rebase**

```bash
git checkout main && git pull --rebase origin main && git checkout -b feat/i18n-italian
```

- [ ] **Step 2: Author `glossaries/it.yaml`**

Create `frontend/scripts/i18n/glossaries/it.yaml` modelled on `es.yaml`:

```yaml
language: it
language_name: Italiano

terms:
  concourse: concorso
  Q-methodology: metodologia Q
  Q-sort: classificazione Q
  Q-set: insieme Q
  statement: affermazione
  factor: fattore
  factor analysis: analisi fattoriale
  presort: pre-classificazione
  rough sort: classificazione iniziale
  fine sort: classificazione fine
  postsort: post-classificazione
  study: studio
  study design: progettazione dello studio
  recruitment: reclutamento
  participant: partecipante
  member: membro
  owner: proprietario
  consent: consenso
  consent form: modulo di consenso
  audio recording: registrazione audio
  memo: nota
  draft: bozza
  resume code: codice di ripresa
  invitation: invito
  project: progetto

notes: |
  - Tone: formal "Lei" form for participants and administrators.
  - Avoid English loanwords where an Italian academic equivalent exists,
    except for "Q" which stays as a label of art.
  - Imperative form for buttons ("Salva", "Annulla", "Continua").
```

- [ ] **Step 3: Declare in constants**

In `frontend/src/i18n.ts`, change `SUPPORTED_I18N_LANGUAGES` to:
```ts
export const SUPPORTED_I18N_LANGUAGES = ['en', 'fr', 'fi', 'de', 'es', 'it'];
```

In `frontend/src/constants/languages.ts`, append:
```ts
    { code: 'it', label: 'Italiano', flag: '🇮🇹' },
```

- [ ] **Step 4: Bootstrap and translate**

```bash
mkdir -p frontend/public/locales/it
cp frontend/public/locales/en/translation.json frontend/public/locales/it/translation.json
```

Open Claude Code and issue the same prompt as Task 6 step 2, swapping `es` → `it`.

- [ ] **Step 5: Validate**

```bash
cd frontend
npm run i18n-check
python3 scripts/i18n/check_interpolations.py it
python3 -c "import json; json.load(open('public/locales/it/translation.json'))"
```

- [ ] **Step 6: Human + visual review**

Same checklist as Task 6 steps 4–5, in Italian, via `?lang=it`.

- [ ] **Step 7: Run full CI**

```bash
make ci
```

- [ ] **Step 8: Commit and PR**

```bash
git add frontend/src/i18n.ts \
        frontend/src/constants/languages.ts \
        frontend/scripts/i18n/glossaries/it.yaml \
        frontend/public/locales/it/translation.json
git commit -m "feat(i18n): add Italian locale"
git push -u origin HEAD
gh pr create --title "feat(i18n): add Italian locale" --body "$(cat <<'EOF'
## Summary
- Adds Italian (`it`) UI translation per `docs/superpowers/specs/2026-05-13-add-5-european-languages-design.md`.

## Test plan
- [ ] `make ci` passes locally
- [ ] Visual smoke on participant flow + admin in Italian
- [ ] Native-speaker review of `common`, `auth`, `consent`, participant flow, study designer

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

### Task 8: Add Portuguese (`pt`)

**Files:**
- Create: `frontend/scripts/i18n/glossaries/pt.yaml`
- Create: `frontend/public/locales/pt/translation.json`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/constants/languages.ts`

- [ ] **Step 1: Rebase**

```bash
git checkout main && git pull --rebase origin main && git checkout -b feat/i18n-portuguese
```

- [ ] **Step 2: Author the glossary**

Create `frontend/scripts/i18n/glossaries/pt.yaml`:

```yaml
language: pt
language_name: Português

terms:
  concourse: concurso
  Q-methodology: metodologia Q
  Q-sort: classificação Q
  Q-set: conjunto Q
  statement: afirmação
  factor: fator
  factor analysis: análise fatorial
  presort: pré-classificação
  rough sort: classificação inicial
  fine sort: classificação fina
  postsort: pós-classificação
  study: estudo
  study design: desenho do estudo
  recruitment: recrutamento
  participant: participante
  member: membro
  owner: proprietário
  consent: consentimento
  consent form: formulário de consentimento
  audio recording: gravação áudio
  memo: nota
  draft: rascunho
  resume code: código de retoma
  invitation: convite
  project: projeto

notes: |
  - Variant: European Portuguese. Use the "você" form throughout.
  - Imperative form for buttons ("Guardar", "Cancelar", "Continuar").
  - If Brazilian Portuguese is needed later, fork to `pt-BR` rather than
    overwriting this glossary.
```

- [ ] **Step 3: Declare in `i18n.ts`**

In `frontend/src/i18n.ts`, update `SUPPORTED_I18N_LANGUAGES`:
```ts
export const SUPPORTED_I18N_LANGUAGES = ['en', 'fr', 'fi', 'de', 'es', 'it', 'pt'];
```

- [ ] **Step 4: Declare in `constants/languages.ts`**

In `frontend/src/constants/languages.ts`, append before the closing `];`:
```ts
    { code: 'pt', label: 'Português', flag: '🇵🇹' },
```

- [ ] **Step 5: Bootstrap the target file**

```bash
mkdir -p frontend/public/locales/pt
cp frontend/public/locales/en/translation.json frontend/public/locales/pt/translation.json
```

- [ ] **Step 6: Translate in a Claude Code session**

Open Claude Code in the repo root and issue:

> Translate `frontend/public/locales/pt/translation.json` from English to
> European Portuguese by following `frontend/scripts/i18n/translation-runbook.md`
> and the glossary at `frontend/scripts/i18n/glossaries/pt.yaml`. Translate one
> top-level namespace at a time using `Edit`. After each namespace, re-read the
> glossary and spot-check three of the values you just wrote against it. Stop
> when the stop conditions in the runbook are all met.

- [ ] **Step 7: Run mechanical validation**

```bash
cd frontend
npm run i18n-check
python3 scripts/i18n/check_interpolations.py pt
python3 -c "import json; json.load(open('public/locales/pt/translation.json'))"
```

All three must pass.

- [ ] **Step 8: Human review**

Walk the namespaces in the runbook's review checklist: `common`, `auth`,
`consent`, `welcome`, `presort`, `rough`, `fine`, `post`, `admin.studies`,
`admin.recruitment`, `errors`. Edit the JSON inline for fixes.

- [ ] **Step 9: Visual review**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/?lang=pt`. Walk participant flow, admin dashboard,
study designer, recruitment dashboard. Fix any overflow inline.

- [ ] **Step 10: Full CI**

```bash
make ci
```

- [ ] **Step 11: Commit and PR**

```bash
git add frontend/src/i18n.ts \
        frontend/src/constants/languages.ts \
        frontend/scripts/i18n/glossaries/pt.yaml \
        frontend/public/locales/pt/translation.json
git commit -m "feat(i18n): add Portuguese locale"
git push -u origin HEAD
gh pr create --title "feat(i18n): add Portuguese locale" --body "$(cat <<'EOF'
## Summary
- Adds Portuguese (`pt`, European variant) UI translation per `docs/superpowers/specs/2026-05-13-add-5-european-languages-design.md`.

## Test plan
- [ ] `make ci` passes locally
- [ ] Visual smoke on participant flow + admin in Portuguese
- [ ] Native-speaker review of `common`, `auth`, `consent`, participant flow, study designer

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

### Task 9: Add Dutch (`nl`)

**Files:**
- Create: `frontend/scripts/i18n/glossaries/nl.yaml`
- Create: `frontend/public/locales/nl/translation.json`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/constants/languages.ts`

- [ ] **Step 1: Rebase**

```bash
git checkout main && git pull --rebase origin main && git checkout -b feat/i18n-dutch
```

- [ ] **Step 2: Author the glossary**

Create `frontend/scripts/i18n/glossaries/nl.yaml`:

```yaml
language: nl
language_name: Nederlands

terms:
  concourse: concours
  Q-methodology: Q-methodologie
  Q-sort: Q-sortering
  Q-set: Q-set
  statement: stelling
  factor: factor
  factor analysis: factoranalyse
  presort: voorsortering
  rough sort: grove sortering
  fine sort: fijne sortering
  postsort: nasortering
  study: onderzoek
  study design: onderzoeksopzet
  recruitment: werving
  participant: deelnemer
  member: lid
  owner: eigenaar
  consent: toestemming
  consent form: toestemmingsformulier
  audio recording: audio-opname
  memo: notitie
  draft: concept
  resume code: hervattingscode
  invitation: uitnodiging
  project: project

notes: |
  - Tone: formal "u" form for participants and administrators.
  - Imperative form for buttons ("Opslaan", "Annuleren", "Doorgaan").
  - Dutch is prone to long compounds; flag any overflow in dense admin views
    during visual review and trim copy in the same PR.
```

- [ ] **Step 3: Declare in `i18n.ts`**

In `frontend/src/i18n.ts`, update `SUPPORTED_I18N_LANGUAGES`:
```ts
export const SUPPORTED_I18N_LANGUAGES = ['en', 'fr', 'fi', 'de', 'es', 'it', 'pt', 'nl'];
```

- [ ] **Step 4: Declare in `constants/languages.ts`**

In `frontend/src/constants/languages.ts`, append before the closing `];`:
```ts
    { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
```

- [ ] **Step 5: Bootstrap the target file**

```bash
mkdir -p frontend/public/locales/nl
cp frontend/public/locales/en/translation.json frontend/public/locales/nl/translation.json
```

- [ ] **Step 6: Translate in a Claude Code session**

Open Claude Code in the repo root and issue:

> Translate `frontend/public/locales/nl/translation.json` from English to Dutch
> by following `frontend/scripts/i18n/translation-runbook.md` and the glossary
> at `frontend/scripts/i18n/glossaries/nl.yaml`. Translate one top-level
> namespace at a time using `Edit`. After each namespace, re-read the glossary
> and spot-check three of the values you just wrote against it. Stop when the
> stop conditions in the runbook are all met.

- [ ] **Step 7: Run mechanical validation**

```bash
cd frontend
npm run i18n-check
python3 scripts/i18n/check_interpolations.py nl
python3 -c "import json; json.load(open('public/locales/nl/translation.json'))"
```

- [ ] **Step 8: Human review**

Walk the runbook's review-checklist namespaces. Edit JSON inline for fixes.

- [ ] **Step 9: Visual review (extra attention to overflow)**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/?lang=nl`. Pay extra attention to the study
designer toolbar and the admin sidebar — Dutch compound words commonly
overflow. Fix copy or apply `truncate` / `min-w-0` inline.

- [ ] **Step 10: Full CI**

```bash
make ci
```

- [ ] **Step 11: Commit and PR**

```bash
git add frontend/src/i18n.ts \
        frontend/src/constants/languages.ts \
        frontend/scripts/i18n/glossaries/nl.yaml \
        frontend/public/locales/nl/translation.json
git commit -m "feat(i18n): add Dutch locale"
git push -u origin HEAD
gh pr create --title "feat(i18n): add Dutch locale" --body "$(cat <<'EOF'
## Summary
- Adds Dutch (`nl`) UI translation per `docs/superpowers/specs/2026-05-13-add-5-european-languages-design.md`.

## Test plan
- [ ] `make ci` passes locally
- [ ] Visual smoke on participant flow + admin in Dutch
- [ ] Native-speaker review of `common`, `auth`, `consent`, participant flow, study designer
- [ ] No compound-word overflow in study designer / admin sidebar

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

### Task 10: Add Polish (`pl`)

**Files:**
- Create: `frontend/scripts/i18n/glossaries/pl.yaml`
- Create: `frontend/public/locales/pl/translation.json`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/constants/languages.ts`
- Possibly modify: `frontend/public/locales/en/translation.json` and all other locales (only if a count-bearing key needs plural variants — see Step 8)

- [ ] **Step 1: Rebase**

```bash
git checkout main && git pull --rebase origin main && git checkout -b feat/i18n-polish
```

- [ ] **Step 2: Author the glossary**

Create `frontend/scripts/i18n/glossaries/pl.yaml`:

```yaml
language: pl
language_name: Polski

terms:
  concourse: konkurs
  Q-methodology: metodologia Q
  Q-sort: sortowanie Q
  Q-set: zbiór Q
  statement: stwierdzenie
  factor: czynnik
  factor analysis: analiza czynnikowa
  presort: wstępne sortowanie
  rough sort: sortowanie zgrubne
  fine sort: sortowanie szczegółowe
  postsort: sortowanie końcowe
  study: badanie
  study design: projekt badania
  recruitment: rekrutacja
  participant: uczestnik
  member: członek
  owner: właściciel
  consent: zgoda
  consent form: formularz zgody
  audio recording: nagranie audio
  memo: notatka
  draft: szkic
  resume code: kod wznowienia
  invitation: zaproszenie
  project: projekt

notes: |
  - Tone: formal "Pan/Pani" form for participants where addressed directly;
    impersonal infinitive for buttons and labels.
  - Imperative for buttons ("Zapisz", "Anuluj", "Kontynuuj").
  - Polish has four plural cases (one/few/many/other). See Step 8 for handling.
```

- [ ] **Step 3: Declare in `i18n.ts`**

In `frontend/src/i18n.ts`, update `SUPPORTED_I18N_LANGUAGES`:
```ts
export const SUPPORTED_I18N_LANGUAGES = ['en', 'fr', 'fi', 'de', 'es', 'it', 'pt', 'nl', 'pl'];
```

- [ ] **Step 4: Declare in `constants/languages.ts`**

In `frontend/src/constants/languages.ts`, append before the closing `];`:
```ts
    { code: 'pl', label: 'Polski', flag: '🇵🇱' },
```

- [ ] **Step 5: Bootstrap the target file**

```bash
mkdir -p frontend/public/locales/pl
cp frontend/public/locales/en/translation.json frontend/public/locales/pl/translation.json
```

- [ ] **Step 6: Translate in a Claude Code session**

Open Claude Code in the repo root and issue:

> Translate `frontend/public/locales/pl/translation.json` from English to Polish
> by following `frontend/scripts/i18n/translation-runbook.md` and the glossary
> at `frontend/scripts/i18n/glossaries/pl.yaml`. Translate one top-level
> namespace at a time using `Edit`. After each namespace, re-read the glossary
> and spot-check three of the values you just wrote against it. Stop when the
> stop conditions in the runbook are all met.

- [ ] **Step 7: Run mechanical validation**

```bash
cd frontend
npm run i18n-check
python3 scripts/i18n/check_interpolations.py pl
python3 -c "import json; json.load(open('public/locales/pl/translation.json'))"
```

- [ ] **Step 8: Handle pluralisation (only if needed)**

During the visual review in Step 10, if a Polish rendering of a count-bearing
key reads badly because of plural agreement (e.g. `"5 uczestnik"` should be
`"5 uczestników"`), introduce i18next plural suffixes for that specific key
**in this same PR**:

1. Identify the key in `en/translation.json` (e.g. `admin.recruitment.count`).
2. Replace its single value with the suffixed variants in **every locale**:
   - `en/translation.json`: add `key_one`, `key_other` (English uses two
     forms). Keep the original `key` if i18next requires a fallback.
   - All other locales (`fr`, `fi`, `de`, `es`, `it`, `pt`, `nl`): add
     `key_one`, `key_other` with their correct singular/plural rendering.
   - `pl/translation.json`: add `key_one`, `key_few`, `key_many`, `key_other`.
3. Update the calling React code to pass `count` to `t()` (i18next selects the
   suffix automatically).
4. Re-run `npm run i18n-check` and the interpolation check.

Do **not** add plural suffixes pre-emptively to keys where the existing render
is fine.

- [ ] **Step 9: Human review**

Walk the runbook's review-checklist namespaces. Edit JSON inline for fixes.

- [ ] **Step 10: Visual review**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/?lang=pl`. Pay attention to count-bearing strings
(participant counts, statement counts, factor counts). If any read awkwardly,
return to Step 8.

- [ ] **Step 11: Full CI**

```bash
make ci
```

- [ ] **Step 12: Commit and PR**

```bash
git add frontend/src/i18n.ts \
        frontend/src/constants/languages.ts \
        frontend/scripts/i18n/glossaries/pl.yaml \
        frontend/public/locales/pl/translation.json
# Also stage any locale files updated during Step 8:
git add -u frontend/public/locales/
git commit -m "feat(i18n): add Polish locale"
git push -u origin HEAD
gh pr create --title "feat(i18n): add Polish locale" --body "$(cat <<'EOF'
## Summary
- Adds Polish (`pl`) UI translation per `docs/superpowers/specs/2026-05-13-add-5-european-languages-design.md`.
- If any count-bearing keys were pluralised, that change is bundled here and applied across all locales.

## Test plan
- [ ] `make ci` passes locally
- [ ] Visual smoke on participant flow + admin in Polish
- [ ] Count-bearing strings render with correct Polish plural form
- [ ] Native-speaker review of `common`, `auth`, `consent`, participant flow, study designer

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Drift handling across PRs

If `en/translation.json` gains new keys between Phase-1 merge and Phase-2 PRs:

- The in-flight language branch rebases onto `main`.
- `npm run i18n-check` will fail in the in-flight branch because the new locale
  is missing the new keys.
- The translation agent translates only the new keys (a small `Edit` pass).
- Validate, commit, push.

For already-merged locales, the next language PR's CI catches missing keys in
*all* locales — at that point, open a follow-up PR (`fix(i18n): backfill new
keys for fr/de/es/it/...`) and translate the missing keys for every affected
locale before continuing with the new-language PR.

---

## Acceptance for the full plan

The plan is complete when:

- [ ] All 5 PRs are merged.
- [ ] `make ci` passes on `main` after each merge.
- [ ] The `AppSidebar` language selector lists 9 languages with correct flags
      and endonyms.
- [ ] Switching to each new locale via `?lang=<code>` renders the participant
      flow without any English fallback.
- [ ] `frontend/scripts/i18n/check_interpolations.py` (no args) returns 0 on
      `main` with all 8 non-`en` locales.
