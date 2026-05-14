# i18n Namespace Split — Design

**Date:** 2026-05-14
**Status:** Draft, pending implementation plan
**Scope:** Frontend SPA (`frontend/`), tests, CI scripts. No backend changes. No call-site changes.
**Predecessor:** `docs/superpowers/specs/2026-05-13-add-5-european-languages-design.md` (which this refactor enables to ship cheaper).

## Problem

`frontend/public/locales/<lang>/translation.json` is a monolithic file with **17 top-level namespaces, ~2647 keys, ~100 KB per locale**. Profile by size:

- `admin.*` — **76.8 KB (75.7%)** — researcher-facing dashboards, study designer, recruitment, analysis.
- `auth.*` — 4.4 KB (4.3%) — login, register, 2FA, password reset, email verification. **100% researcher-facing.**
- All other namespaces combined — **24.7 KB (24.3%)** — participant flow, public pages, shared chrome.

This shape creates three frictions:

1. **Per-locale translation cost is dominated by researcher chrome.** Adding a new language means translating 100 KB, of which 75% is admin UI rarely shown to native-speaker participants. Researchers are typically bilingual or comfortable in English; participants often are not. Translation effort is mis-allocated.
2. **Bundle size for participants is 4× larger than needed.** Every participant downloads ~100 KB of i18n JSON to render a Q-sort, when only ~24 KB is theirs.
3. **Calendar coupling.** A "ship Spanish locale" PR cannot ship until admin is fully translated, even though participant strings are ready and reviewed. Native-speaker reviewers must check 4× more text than they should.

The plan to add five European languages (`es`, `it`, `nl`, `pl`, `pt`) makes this 5× worse. Splitting the file unlocks shipping participant-only locales and defers admin translation to a separate, lower-priority track.

## Decisions

### Scope

**In scope.**
- Split `frontend/public/locales/<lang>/translation.json` into `participant.json` and `admin.json` per locale.
- Configure i18next with `ns: ['participant', 'admin']` and `defaultNS: ['participant', 'admin']` (array). Zero call-site changes.
- Differentiate CI parity policy: participant strict, admin best-effort.
- Update `check_i18n.py`, `check_interpolations.py` (introduced by PR #157), `locales.test.ts`, and test fixtures.
- Update the plan `docs/superpowers/plans/2026-05-13-add-5-european-languages.md` to reflect the new file layout.

**Out of scope.**
- Renaming any translation key (no `t('admin:foo')` syntax migration, no `useTranslation('admin')` adoption).
- Lazy-loading `admin.json` only on `/app/*` routes (would be a follow-up if bundle size becomes a measured pain).
- Backend changes. `_format_import_warning("missing_consent_draft")` continues to emit `{"key": "admin.import.validation.warnings.missing_consent_draft"}` unchanged.
- Adding the 5 European languages themselves (separate plan, enabled by this refactor).

### Architecture

Each locale ships **two JSON files** that together contain the same key set as today's single `translation.json`:

- `frontend/public/locales/<lang>/participant.json` — top-level keys: `common`, `layout`, `footer`, `errors`, `landing`, `welcome`, `consent`, `presort`, `rough`, `fine`, `post`, `audio`, `resume`, `erasure`, `study`. Per-locale size: ~24 KB.
- `frontend/public/locales/<lang>/admin.json` — top-level keys: `admin`, `auth`. Per-locale size: ~81 KB.

The keys inside each file keep their **current dotted paths verbatim**, including any prefix. `admin.json` therefore looks like:

```json
{
  "admin": { "dashboard": { "title": "…" }, "studies": { … }, … },
  "auth":  { "login": { "email_label": "…" }, "register": { … }, … }
}
```

The cosmetic redundancy "namespace named `admin` containing a top-level key named `admin`" is intentional. It buys zero call-site changes; in a codebase with 1320 `t(…)` invocations (903 on `admin.*` alone), the saving dominates the aesthetic cost.

### i18next configuration

`frontend/src/i18n.ts` changes:

```ts
.init({
    ns: ['participant', 'admin'],
    defaultNS: ['participant', 'admin'],  // array form: i18next searches namespaces in order
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_I18N_LANGUAGES,
    backend: {
        loadPath: '/locales/{{lng}}/{{ns}}.json?v=20260514_v1',  // already templated, just bumped cache key
    },
    // detection, interpolation unchanged
});
```

Runtime resolution under this config:

- `t('common.next')` → searches `participant` namespace for path `common.next` → found.
- `t('admin.dashboard.title')` → searches `participant` for path `admin.dashboard.title` (not found) → falls through to `admin` namespace, finds path `admin.dashboard.title` (because `admin.json` still uses the full dotted path internally) → found.
- `t('auth.login.email_label')` → searches `participant` (not found) → searches `admin` → found at path `auth.login.email_label`.

i18next loads both namespaces on init for every locale. For a participant-only flow this means one extra HTTP request (`/locales/<lang>/admin.json`) per locale change. The total bytes for participants drop (24 KB participant only used + 81 KB admin downloaded but unused = effectively ~24 KB on the critical path). A follow-up could lazy-load `admin.json` only when entering admin routes; explicitly deferred here.

### Differentiated parity policy

Two locale guarantees, enforced by CI:

**`participant.json` — strict.**
- Every locale declared in `SUPPORTED_I18N_LANGUAGES` must have `participant.json` with **exactly** the key set of `en/participant.json`.
- Missing keys or extra keys → CI exit 1.
- Interpolation parity per key → CI exit 1 on mismatch (handled by `check_interpolations.py`).
- This guarantees a participant going through the Q-sort never sees an English fallback in the path that matters.

**`admin.json` — best-effort.**
- A locale **may** ship without `admin.json`. i18next falls back to `en/admin.json` automatically via `fallbackLng: 'en'`.
- A locale **may** ship with a partial `admin.json` (some keys missing). Missing keys fall back to English at runtime.
- Missing/extra keys → CI **warning** with a colored summary, but exit 0.
- Interpolation parity warnings are reported but never block.
- This guarantees that the cost of admin translation is decoupled from the cost of shipping a new locale.

### CI tooling changes

**`frontend/scripts/check_i18n.py`** — rewrite to iterate over the two namespaces with policy-aware reporting:

```python
NAMESPACES = {
    "participant": {"required": True,  "strict": True},
    "admin":       {"required": False, "strict": False},
}
# For each namespace:
#   - Load en/<ns>.json as the source of truth.
#   - For each declared language:
#     - If <lang>/<ns>.json missing:
#         - required=True   → error, exit 1
#         - required=False  → warning, ok
#     - Else compare key sets:
#         - strict=True   → any diff is an error
#         - strict=False  → any diff is a warning
# Exit code: 1 if any error, 0 otherwise (warnings never gate).
```

**`frontend/scripts/i18n/check_interpolations.py`** (shipped by PR #157) — same shape: strict on participant, warning-only on admin. CLI flag `--strict` to run as gate (used by CI default); `--warn-only` available for ad-hoc inspection.

**`frontend/src/constants/locales.test.ts`** — update the existing presence test to:
- `participant.json` must exist for every entry in `SUPPORTED_LANGUAGES`.
- `admin.json` existence is optional.

### Test fixtures and helpers

**`frontend/src/test-utils/i18n-test.ts`** and **`frontend/src/test-utils/i18n-test-resources.ts`** (currently load a single `translation` resource) — update to register both namespaces. Tests using `t('admin.*')` keys must still resolve. Concretely: load `participant.json` and `admin.json` fixture bundles and pass them to i18next's `resources` config under their respective namespace keys.

This touches a small number of test helpers, not individual test files. Test cases keep their `t('admin.foo.bar')` and `t('common.next')` expectations unchanged.

### Glossary policy

Per-language Q-methodology and product terminology lives in **one unified glossary** per language: `frontend/scripts/i18n/glossaries/<lang>.yaml`. Many terms appear on both sides of the split (`statement`, `factor`, `study`, `participant`); a single glossary prevents drift between participant and admin renderings.

The translation runbook (PR #157) is amended in PR #3 of this refactor to:
- Reference `participant.json` and `admin.json` instead of `translation.json`.
- Note that admin can be skipped or partially translated.
- Keep the chunking order; sub-chunk `admin.json` by its second-level keys as before.

### Delivery: three sequential PRs

The refactor ships as three PRs, each independently mergeable. Each PR keeps the app working end-to-end at every commit.

**PR #1 — File split (no behaviour change)**
- `frontend/scripts/i18n/split_translations.py` — reusable, idempotent script. Reads `<lang>/translation.json`, writes `<lang>/participant.json` + `<lang>/admin.json` according to a hardcoded partition map matching the architecture section above.
- Run the script for `en`, `fr`, `fi`, `de`. Commit the 8 new files.
- Delete the 4 old `translation.json` files in the same commit.
- Update `i18n.ts` to load both namespaces.
- Update `test-utils/i18n-test.ts` + `i18n-test-resources.ts` to register both namespaces.
- `make ci` must pass. `npm run dev` must render the participant flow and the admin in all 4 languages without any visible English fallback.

**PR #2 — CI policy update**
- Rewrite `check_i18n.py` per the differentiated parity spec.
- Adapt `check_interpolations.py` similarly.
- Update `locales.test.ts` to make `admin.json` presence optional.
- Add a regression test: programmatically remove a key from `fr/admin.json` in a tmpdir copy and run the validator — must exit 0 with a warning. Do the same for `fr/participant.json` — must exit 1.

**PR #3 — Update the 5-languages plan**
- Amend `docs/superpowers/plans/2026-05-13-add-5-european-languages.md` to:
  - Bootstrap step copies `en/participant.json` (not `translation.json`) for each new locale.
  - Admin translation is a separate sub-task per language, listed as "optional / follow-up PR".
  - The translation runbook reference is updated.
- No code changes.

### Risks and mitigations

- **Hidden `t()` call with a path neither in participant nor admin.** Mitigated by a post-PR-#1 smoke test: grep all `t('<literal>')` calls in `frontend/src`, resolve each via the new config, assert no missing-key warnings logged. (Optional but cheap insurance.)
- **Pluralised keys (`_one`, `_other`) crossing the split.** Inspected during PR #1 authoring: a pluralised key always lives in a single top-level namespace (e.g. `admin.hub.n_studies_one`), so all variants land in the same target file. Verified by the split script (raises if a `_one` lacks its `_other` sibling in the same target file).
- **Test fixture drift.** `test-utils/i18n-test-resources.ts` becomes a second source of truth for the namespace partition. Mitigated by importing the partition map from `split_translations.py`'s sibling JS/JSON manifest — keep partition in one place.
- **Backend keeps emitting `admin.import.*` keys.** Continues to work because those keys live at full path inside `admin.json`. No coordination needed.
- **A future contributor wonders why `admin.json` has an outer `admin` key.** Mitigated by a comment block at the top of `i18n.ts` explaining the resolver and the intentional cosmetic redundancy.
- **`fallbackLng: 'en'` is already the resolution chain for missing keys.** Verified in current behaviour. The split doesn't change this; it just creates more opportunities for it to trigger (best-effort admin in non-EN locales).
- **Cache invalidation across the split deploy.** Bumping `?v=…` in `loadPath` invalidates both files in step with the deploy. No participant ever holds a mixed-version locale.

## Acceptance criteria

The refactor is complete when:

1. `frontend/public/locales/<lang>/translation.json` no longer exists for any locale; `participant.json` + `admin.json` are present for `en`, `fr`, `fi`, `de`.
2. `make ci` passes on `main`.
3. Removing a participant key from `fr/participant.json` makes `make check` exit 1.
4. Removing an admin key from `fr/admin.json` makes `make check` exit 0 with a warning.
5. Deleting `fr/admin.json` entirely makes `make check` exit 0 with a warning, and at runtime `fr` admin renders the English fallback.
6. The participant flow and the admin render in all 4 languages without visible English fallback (manual smoke).
7. The 5-languages plan reflects the new file layout.
8. The translation runbook references the new layout.

## Non-goals (for clarity)

- Not renaming `t('admin.foo')` to `t('admin:foo')` or `useTranslation('admin')`.
- Not changing how backend emits i18n keys.
- Not adding per-route lazy loading of `admin.json` (acknowledged opportunity; deferred).
- Not introducing a translation management system (Crowdin/Weblate).
- Not changing the `fallbackLng` strategy or the language detector.
- Not introducing pluralisation refactors.
- Not modifying e2e tests or playwright fixtures (they should keep working unchanged).
