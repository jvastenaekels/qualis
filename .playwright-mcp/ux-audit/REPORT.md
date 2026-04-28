# Qualis admin interface — multi-persona UX walkthrough

**Date:** 2026-04-28
**Method:** Real navigation through dev environment (`localhost:5173`) with seeded
study, channeling 5 Q-methodology researcher personas. Screenshots in
`.playwright-mcp/ux-audit/`. Detailed per-page notes in `notes.md`.

## Personas

| ID | Profile | Q-experience |
|---|---|---|
| **P1 — Marina** | Senior Q-methodologist (40 studies, PQMethod since 2008), strict on Watts & Stenner orthodoxy | Deep |
| **P2 — Tomás** | PhD student, first Q study, took one workshop | Novice |
| **P3 — Aïcha** | Mixed-methods sociologist, multilingual fieldwork (FR + EN + AR) | Intermediate |
| **P4 — Henrik** | Applied policy researcher, runs Q with stakeholders, time-pressed | Intermediate |
| **P5 — Lina** | Research ethics + GDPR data steward | Bystander but vital |

Severity: 🔴 blocker · 🟠 confusion · 🟡 friction · 🟢 nice-to-have

---

## Headline assessment

Qualis is **a strikingly thoughtful Q-methodology platform.** The product pulls
off something rare: it stays methodologically rigorous (citations, mémo de
construction, factor-rotation rationales, GDPR controls) while remaining
approachable. P1 (Marina) reactions across the walkthrough trended toward "they
read the Q literature"; P5 (Lina) toward "this is what every research platform
should look like."

The remaining work is mostly about **closing small gaps** — terminology
consistency, viewport responsiveness, error surfacing, missing tooltips — not
about rebuilding flows. Below: prioritized findings, then the screen-by-screen
strengths that should be preserved (and replicated).

---

## Top issues (priority order)

### 🔴 1. Brand identity mismatch on the public landing
File: `frontend/src/pages/...` (the participant-facing landing component)
The browser tab says "Qualis", the logo on `/` shows "OPEN-Q". The repo also
contains `.env.before-qualis-rename` — this is a half-finished rename. **First
contact with every participant and every researcher** is on this screen.
Replace the OPEN-Q image with a Qualis mark.

### 🔴 2. Header overlaps toolbar at narrower widths (concourse page)
At ~800–900 px viewport, the "Concours" h1 visually overlaps the
"Exporter CSV / Import en masse / Ajouter un élément" buttons. The DOM is
correct; the flex/grid container fails to wrap or shrink. At 1440 px it is
clean. Affects 13" laptops in split-screen, iPads, anyone with sidebar +
devtools open. Same likely pattern in other page headers — sweep all admin
pages at 800/1024/1440.

### 🔴 3. Single-add language picker shows ALL ISO languages
On a study with `languages = [en, fr]`, clicking "Ajouter un élément" in the
concourse opens a modal whose **Langue** dropdown lists Allemand, Anglais,
Arabe, Chinois, Coréen, Danois, … (the full alphabetical, French-localized ISO
list). The bulk-import modal on the same page correctly defaults to
"Français (fr)". Two different behaviors for the same field. Filter the
single-add picker to the study's configured languages.

### 🟠 4. Recipe for confusion: "Q-set 1" badge inside a concourse view
The concourse curation banner is labeled "Q-set 1 / 4 éléments — 2 items
encore à examiner". For Q-methodologists, **concourse and Q-set are distinct
constructs** (concourse = universe; Q-set = curated subset shown to
participants). If "Q-set 1" means "concourse → first derived Q-set", make the
relationship explicit: "→ Q-set 1, derived from this concourse" or rename to
"Curation". (The link IS implemented elsewhere — Study Design > Q-tri >
"Importer depuis un concours" — the concourse view just doesn't say so.)

### 🟠 5. Auto-created concourse named "Concours"
When a study is seeded, a default concourse is created with the literal type
name "Concours". With multiple studies in one project (P4's reality), all
concourses are titled "Concours" — unidentifiable. Derive from study title
("Concourse — Remote work perspectives") or prompt for a name on first save.

### 🟠 6. Eigenvalues 400 not surfaced — "Chargement..." spinner forever
Analysis page calls `/api/admin/studies/<slug>/analysis/eigenvalues`. With 0
sorts, server returns **400** with body
`{"message":"Need at least 2 valid participants for analysis, got 0"}`.
The frontend keeps showing "Chargement des valeurs propres..." indefinitely
and emits 4 console errors per visit. Fix: show the server message inline as
"L'analyse factorielle requiert au moins 2 participants ayant complété le tri."
Could change the server contract too (200 with empty + reason) but the cheap
fix is client-side.

### 🟠 7. `?reason=session_expired` shown on first-time admin access
Going to `/admin` when never logged in routes to
`/login?reason=session_expired`. Misleading. Use `auth_required` (or no
reason) for the cold path.

### 🟠 8. Bilingual edit context unclear on Study Design
The chrome is in French (left rail = FR locale), but the content fields show
EN values because the language toggle is set to EN. Nothing in the page says
"Vous éditez la version EN". P3 (Aïcha) might overwrite EN content thinking
she is editing FR. Add a one-line banner per language while editing.

### 🟠 9. seed.py is broken against the current API (separate from UX, but
worth fixing while you are here)
`/api/admin/projects` returns `{items: [...]}` (paginated) but
`script_utils.APIClient.login()` treats the response as a flat list:
```python
projects = ws_response.json()
if projects and len(projects) > 0:
    first_proj_id = projects[0]["id"]   # KeyError: 0
```
This blocks the documented `python seed.py data/example-study.json` flow on
a fresh install. Fix: handle both shapes (or just the paginated one).

### 🟡 10. Pile of missing tooltips
- Concourse status mini-pills "1 · 2 · 1" (proposed/accepted/rejected counts)
- "Tester l'étude" button (does it record data?)
- "Importer une configuration" / "Exporter la configuration" icon-only buttons
- Recruitment table "Type d'entrée" header
- Recruitment "Indicateurs" column triangle icon
- Dashboard study counter ("1 étude / 0 active / 0 participant")
- "Activer l'étude" CTA — needs confirmation dialog (irreversible-ish gate)

### 🟡 11. No CSV import on concourse
"Exporter CSV" exists but "Import en masse" only accepts pasted text. P3 with
80 statements from a coded transcript expects code/text/language CSV import.

### 🟡 12. No methodological-memo equivalent on Study Design
Concourse has the beautiful "Mémo de construction" with citations
(Sneegas 2020 ; Robbins & Krueger 2000). The Study Design page has nothing
analogous — no prompt to document why this distribution, why these conditions
of instruction, why this Q-set size. P1 wants this for replication and
preregistration; P5 wants it for ethics dossiers.

### 🟢 13. Smaller items
- Anonymisation date seuil defaults to today (works for retention windows
  longer than zero, but if the study has a retention policy field, default
  there).
- Step icons on Study Design ("Let's meet" / "First impressions" / "Your
  perspective" / "Why") use cute symbols; consider adding parenthetical
  Q-canonical labels (Pre-sort / Sort / Post-sort) or syncing with the top-tab
  vocabulary which already uses "Pré-tri / Q-tri / Post-tri".
- Recruitment strategy descriptions only show on the selected option — would
  be more discoverable to show all on hover.
- No language switcher on the public login page (FR locked).
- No "forgot password" / SSO / MFA cue on login.
- "Q-set vs concourse" terminology — consider an in-product glossary
  accessible from the help icon.

---

## What is genuinely excellent (preserve, replicate)

These are the moments where personas had a positive reaction strong enough to
repeat. The pattern is the same across all of them: **methodology-first
copywriting, transparency built into the workflow, GDPR taken seriously.**

### Concourse: Mémo de construction with citations
> "Optionnel. Documentez comment ce concours a été constitué : sources
> mobilisées, voix retenues ou écartées, rationnel d'échantillonnage. Utile
> pour rendre transparent le processus de curation **(Sneegas 2020 ; Robbins
> & Krueger 2000)**. Laissez vide si non pertinent pour votre design."

This single block tells a Q-purist that the team has read the methodological
literature. Replicate the pattern on **Study Design** (justification of
distribution choice, conditions of instruction, Q-set size).

### Curation panel
"Q-set 1 / 4 éléments — 2 items encore à examiner" with progress bar and
status pills (proposed/accepted/rejected). Maps directly to the researcher's
mental model of narrowing concourse → Q-set. The terminology issue (item #4
above) is the only blemish.

### Item-level traceability
Per-item Historique / Commentaires / Edit / Supprimer. Item-level revision
history is rare in research tooling. P1 (Marina) loves it.

### Bulk-import "Fusionner par code (Multi-langue)"
The third merge mode — paste a TSV with `code en fr` columns and the merge
happens by code — is genuinely thoughtful for multilingual studies.
P3 (Aïcha): "Yes, finally."

### Right-rail Vérification + Languages panel on Study Design
A live readiness checklist (Titre / Formulaire de consentement / Consignes /
Énoncés / Grille équilibrée) plus per-language status ("en — Prêt"
"fr — Prêt"). Researcher always knows what's missing per language.

### Q-tri tab — pedagogy-grade methodology copy
> "Équilibre de la grille — Assurez-vous que la capacité de votre grille
> corresponde exactement au nombre d'énoncés. **Un Q-set équilibré compte
> généralement entre 30 et 60 items pour une analyse factorielle robuste.**"

Combined with the toggles "Afficher les codes des énoncés" + "Aléatoriser
l'ordre des énoncés (constant au sein d'une session)" — the parenthetical
*nails* the right invariant.

### Recruitment "Comment fonctionne l'accès des participants" inline help
Plain-language explanation of the URL/token/QR-code model. Dropdown with three
strategies (Public / Single-use / Capacity-limited), each with a contextual
subtitle. P4 (Henrik) reaction: "I can spin up a study and a stakeholder
LinkedIn link in 3 minutes."

### Cycle de vie des données — best-in-class GDPR surface
Explicit reference to **RGPD Art. 5**. Five-state participant inventory
(Total / Commencé / Complété / Rejeté / Anonymisé). Aged-data alerts ("Anciens
de plus d'un an (non anonymisés)" — proactive risk surfacing). Audio-storage
footprint. Anonymisation en masse with **server-side preview** of candidates
before action, and the line "Les classements Q-sort sont conservés." (purges
identifiers, preserves methodologically meaningful data). P5 (Lina): "this is
what every research platform should look like."

### Analysis configuration with rationale per parameter
Each of {Extraction, Facteurs, Rotation, Marquage} has a plain-language
explanation that **acknowledges Q-methodology debates** instead of forcing a
choice (PCA vs Centroid; rotation vs no-rotation; auto-flagging vs manual).
The bootstrap option cites Zabala & Pascual 2016. The empty state of the
**Historique des analyses** cites Watts & Stenner 2012 and Sneegas 2020 to
motivate why every run is logged. **The empty state has citations.** P1
(Marina) is now considering writing a love letter.

---

## Persona-tagged signal table

| Persona | Strongest reactions | Pain points |
|---|---|---|
| **P1 — Marina** | Mémo de construction; analysis param rationales; bootstrap with citation; "30–60 items" guidance | "Q-set" badge inside concourse view; no concourse → Q-set explicit link on the concourse page; no correlation matrix view in analysis |
| **P2 — Tomás** | Yellow guidance cards; tabbed wizard with emojis; right-rail Vérification | Sub-action labels on dashboard ambiguous (Conception / Accès / Données / Analyse — what's the difference between Accès and recruitment?); "Tester l'étude" semantics; "Type d'entrée" opaque |
| **P3 — Aïcha** | "Fusionner par code (Multi-langue)"; per-language readiness ("en — Prêt"); language pills as filter | Single-add language picker shows all ISO languages; bilingual edit context unclear on Study Design |
| **P4 — Henrik** | Recruitment URL with copy/QR/open triad; three strategies with subtitles; section-level save buttons | No CSV/TSV concourse import; brand mismatch on first contact undermines confidence to share |
| **P5 — Lina** | Lifecycle page top-to-bottom (RGPD Art. 5 reference, aged-data alerts, server-side anonymisation preview); audit log of analysis runs | "Activer l'étude" is one-click without confirmation; no `Réglages → retention policy` field at study level |

---

## Suggested first batch (small, high-leverage)

If only one PR fits, prioritize these (~1 day of work):

1. **Brand**: replace OPEN-Q logo with Qualis on the public landing.
2. **Concourse single-add language picker**: filter to study languages.
3. **Header responsive overlap**: fix the concourse-page header at < 1024 px;
   audit other admin pages similarly.
4. **Eigenvalues error surfacing**: catch 400 from `/analysis/eigenvalues`
   and show the server message inline (replace forever-spinner).
5. **Login `?reason=session_expired` cold path**: switch to `auth_required`.
6. **seed.py paginated-list bug**: fix `script_utils.APIClient.login()`.
7. **Tooltips sweep**: dashboard counters, study sub-actions, "Tester l'étude",
   "Indicateurs" column, status mini-pills.

Then a second batch around the methodological/UX deepening:
- "Mémo de méthodes" on Study Design (mirror of concourse mémo).
- Confirmation dialog on "Activer l'étude".
- Study-level retention policy field driving lifecycle anonymisation date
  default.
- CSV/TSV concourse import.
- Bilingual edit-context banner per language.

---

## Files referenced

- `frontend/src/pages/...` — concourse detail page (header overlap, single-add
  language picker)
- `frontend/src/hooks/admin/useAnalysisPage.ts` (per CLAUDE.md) — eigenvalues
  loading state
- `backend/app/utils/script_utils.py:62-74` — seed login bug
- `backend/init_db.py:96-99` — default project; concourse auto-creation
  (look here for the "Concours" default-name)
- `backend/data/example-study.json` — seed used for this walkthrough
- Screenshots: `.playwright-mcp/ux-audit/01..17-*.png`
- Detailed per-page notes: `.playwright-mcp/ux-audit/notes.md`
