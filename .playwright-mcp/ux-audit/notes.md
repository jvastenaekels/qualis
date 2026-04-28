# Qualis admin UX walkthrough — multi-persona notes

Date: 2026-04-28
Walked by: Claude, channeling 5 personas
- P1 = Marina, senior Q-methodologist, PQMethod since 2008
- P2 = Tomás, PhD student, first Q study
- P3 = Aïcha, mixed-methods sociologist
- P4 = Henrik, applied policy researcher
- P5 = Lina, research ethics + GDPR

Severity scale: 🔴 blocker · 🟠 confusion · 🟡 friction · 🟢 nice-to-have

---

## Page: Landing (`/`)

🔴 **Brand identity mismatch.** Tab title says "Qualis", logo on page says "OPEN-Q".
This is the very first thing every user sees. (P1: "Is this maintained?")

🟠 **No researcher entry point.** Root URL is the participant gate ("Entrez le code
de votre étude"). Researchers have no visible "Sign in" link — they must guess
that `/admin/login` or `/login` exists. (P2: "Wait, where do I go to set up my
study?". P4: "If a colleague sends me the URL, I'll think this is the wrong site.")

🟡 **Locked to French.** No visible language switcher. Three locales are
maintained (en/fr/fi) per CLAUDE.md but the user can't pick. (P1, anglophone,
would feel locked out before login.)

🟡 **CTA disabled with no hint.** "Accéder à l'étude" button is greyed out when
empty, but there's no helper text saying "the code is in the email you received".
A first-time participant might stare at it.

---

## Page: `/login`

🟠 **`?reason=session_expired` shown to first-time visitors.** Going to `/admin`
when never logged in routes to `/login?reason=session_expired`, but the user
never had a session. Should be `auth_required` (or no reason). Misleading.

✅ **Form is clean.** Shield icon, "Panneau d'administration" heading,
"Accès sécurisé à votre tableau de bord de recherche" subtitle, well-iconned
fields, single "Continuer" CTA.

🟡 **No "forgot password" link, no SSO option, no MFA cue.** Users with
TOTP enabled (`is_totp_enabled` exists in DB) get no hint here. Even a passive
"You'll be asked for a 2FA code on the next step if enabled" line would help P5.

🟡 **No language switcher pre-login.** Switcher appears in app shell only.
P1 (anglophone) gets French throughout login.

---

## Page: `/app/<project>/dashboard`

✅ **Strong overall.** Clean breadcrumb, project header with stats
(1 étude / 0 active / 0 participant), study cards with state badge
("Brouillon"), language list (EN, FR), participant count, last-modified
relative time, four sub-action buttons (Conception / Accès / Données / Analyse).

✅ **Study-as-content, project as shell:** sidebar = Tableau de bord / Concours /
Réglages du projet — studies are not listed in the nav, accessed only via
dashboard cards. This is a deliberate IA choice; works because studies are
typically few-per-project. P4 with 10+ studies/year may want a flat list.

🟡 **"étude / active / participant" counter.** What's "active" vs "étude"?
Probably state == active, but P2 doesn't know. Tooltip needed. Same with
"participant" being singular when 0 — French grammar would say "0 participant"
which it does correctly, but EN should also use singular for 0
(check translations).

🟡 **Sub-actions ambiguous to a Q novice.** "Conception" = study design.
"Accès" = recruitment? participant access? "Données" = participant raw data?
"Analyse" = factor analysis. P2 (Tomás) would hover for tooltips — none.
P1 (Marina) might prefer "Q-set", "Recruitment", "Sorts", "Factor analysis".
Case for either:
  - Current labels are short and stable across studies — good for the
    project-level dashboard view.
  - Q-specific labels would orient newcomers and signal that this is real
    Q methodology, not a generic survey tool.

🟢 **Logo absent in app shell** (only on the public landing). So the
OPEN-Q/Qualis brand mismatch is contained to the participant-facing surface.

---

## Page: `/app/<project>/concourses/1`

**Strengths (worth highlighting):**

✅ **Methodological framing.** "Contexte méthodologique" / "Mémo de construction"
with citation prompts (Sneegas 2020 ; Robbins & Krueger 2000) and an explicit
"Optionnel — laissez vide si non pertinent". P1 (Marina) immediate reaction:
"someone here actually reads the Q-methodology literature." This is a
differentiating signal that should appear elsewhere too (analysis page!).

✅ **Curation panel is excellent.** "Q-set 1 / 4 éléments — 2 items encore à
examiner" with progress bar and three status pills. Maps directly to the
researcher's mental model: "I'm narrowing my concourse to a Q-set."

✅ **Status workflow.** Proposé / Accepté / Rejeté + per-item dropdown to change
state. Color coded. P1 (Marina) approves — a real Q-set construction step
made first-class.

✅ **Item-level traceability.** Each item has Historique (versions),
Commentaires, Edit, Supprimer buttons. Implements item-level revision
history — rare in research tooling, P1 will love it.

✅ **Source field per item.** Optional, with helpful placeholder "ex.
Entretien n°3, Revue de littérature" — supports paper trails for
transparent concourse construction.

✅ **Bulk import** correctly defaults to study language ("Français (fr)"),
prefills code prefix ("C"), accepts paste-by-newline. Friction-free.

**Issues:**

🔴 **Header overlaps toolbar at narrower viewports** (~800–900 px). The
"Concours" h1 and the trio of right-aligned buttons (Exporter CSV / Import
en masse / Ajouter un élément) occupy the same flex row but don't reflow
or wrap; they overlap. At 1440px it's fine. Affects 13" laptops in
split-screen, iPads, anyone with sidebar+devtools open.
File to inspect: ConcourseDetailPage's header layout.

🔴 **Single-add language picker shows ALL ISO languages.** When clicking
"Ajouter un élément", the Langue dropdown lists Allemand, Anglais, Arabe,
Chinois, Coréen, Danois… (entire alphabetical ISO list, French-localized).
But the bulk import correctly shows only the study's languages
("Français (fr)" pre-selected). Same field, two different behaviors —
researcher will go "is this concourse multilingual or not?". P3 (Aïcha)
confused, P1 (Marina) annoyed. Fix: filter to the study's `languages`
list, with a "+ Add another language" admin path.

🟠 **Auto-created concourse named "Concours".** The seed-on-study-creation
default uses the literal type name. With multiple studies in one project
(P4's reality), all concourses are titled "Concours" — unidentifiable
in a list. Should derive from study title (e.g. "Concourse — Remote
work perspectives") or prompt for a name on first save.

🟠 **"Q-set" terminology inside the concourse view.** The big curation
banner is labeled "Q-set 1". For Q methodologists, *concourse* and
*Q-set* are distinct: the concourse is the universe of statements, the
Q-set is the curated subset shown to participants. If "Q-set 1" actually
means "Q-set being built from this concourse", the relationship needs
to be explicit (e.g. "→ Q-set 1, derived from this concourse"). P1
(Marina) read this as a category error.

🟡 **Numeric status pills (1 · 2 · 1) lack tooltips.** Color-coded but
no `<title>` / `aria-label`. P1 hovering: nothing. Accessibility issue
too — screen readers announce just "1, 2, 1".

🟡 **Reason for `?reason=session_expired` re-applies here too** — already
flagged.

🟡 **No CSV import.** "Exporter CSV" suggests CSV is the format, but
"Import en masse" only accepts pasted text. P3 with 80 statements from
NVivo/Atlas.ti expects CSV/TSV import with code+text+language columns.

🟢 **"+ Ajouter une langue" inline button** (top right of filter row).
Functionality unclear without trying — adds a concourse-wide language?
A per-item translation? Tooltip would help.

---

## Page: `/app/<project>/studies/<slug>/design` — Conception

This is where the project really shines. Lots of strengths.

**Strengths:**

✅ **Sidebar context shift.** When inside a study, the left rail switches
from project tools (Tableau de bord / Concours / Réglages) to study tools
(Tableau de bord / Conception / Accès / Données / Cycle de vie des
données / Analyse / Réglages). Clear context boundary; back-arrow
"← Example Project" preserved at top. P4 with multiple studies will
appreciate this.

✅ **Tabbed wizard with emoji icons:** 👋 Général · 📋 Pré-tri ·
🎯 Consigne · 🧩 Q-tri · 💬 Post-tri · 🎨 Thème · ✨ Interface.
Maps directly to study phases. Scroll arrows handle overflow. Per-tab
"Étape suivante →" CTA at bottom.

✅ **Right rail "Vérification" checklist:** Titre, Formulaire de
consentement, Consignes, Énoncés, Grille équilibrée — all green ✓ once
ready. Pairs with **Languages panel** ("en — Prêt", "fr — Prêt"). This
is the per-language readiness board P3 (Aïcha) needs.

✅ **State badge + activation gate.** "Brouillon" badge in header, "Activer
l'étude" CTA on the right; orange "Enregistrer" indicates unsaved
changes. Clear lifecycle signaling.

✅ **Q-tri tab (the heart of Q-methodology):**
   - Yellow guidance: *"Équilibre de la grille — Assurez-vous que la
     capacité de votre grille corresponde exactement au nombre d'énoncés.
     Un Q-set équilibré compte généralement entre 30 et 60 items pour
     une analyse factorielle robuste."* P1 (Marina) reaction:
     "OK, this team has read Watts & Stenner / Brown."
   - Two sub-tabs: **Énoncés** + **Distribution** — clean separation.
   - **"Ajout en masse (copier-coller)" with three modes:**
     · Tout remplacer · Ajouter à la liste · **Fusionner par code
     (Multi-langue)** — paste a TSV (`code en fr` / `s1 Hello Salut`)
     and the merge happens by code. P3 (Aïcha) reaction: "Yes,
     finally."
   - Format help inline ("Simple: 1. Mon premier énoncé / Expert:
     code en fr…").
   - **"Importer depuis un concours"** — explicit link from Q-set to
     the project concourse. Resolves the earlier worry about
     concourse↔Q-set traceability. ⭐
   - Statement codes (S01, S02, …) — proper Q-methodology convention.
   - Toggles: "Afficher les codes des énoncés" + "Aléatoriser l'ordre
     des énoncés (constant au sein d'une session)". The latter's
     parenthetical explains *exactly* the right invariant —
     unfortunately (per CLAUDE.md commit log) "manual rotation IDs"
     is a recently-fixed UX issue, so this caption matters.

✅ **Markdown-style editors with B/I/list/link toolbar + "Éditer / Aperçu"
toggle** for consent text, intro text, etc. — signals that researchers
can format properly.

✅ **Reorderable phase steps** with drag handles ("Let's meet", "First
impressions", "Your perspective", "Why"). Configurable per study.

✅ **Yellow guidance card on the General tab:** *"Configurons l'étude
dans les moindres détails. Commencez par définir l'objectif de votre
étude. Ces informations seront présentées aux participants avant qu'ils
ne débutent le processus de tri."* P2 (Tomás) gets oriented immediately.

**Issues:**

🟠 **Bilingual chrome confusion.** The page chrome is rendered in French
(left sidebar locale = FR) but the *content fields* are populated with
English because the language toggle is set to EN ("Titre = Perspectives
on remote work", consent text in English). This dual-language view is
correct in principle, but nothing in the UI says explicitly *"You are
editing the EN version"*. P3 (Aïcha) might overwrite EN content
thinking she is editing FR. Add a one-line banner: "Edition de la version
EN — basculer vers FR via le sélecteur en haut à droite."

🟠 **No methodological-memo equivalent for the study (vs. the concourse).**
Concourse has a beautiful "Mémo de construction" with citations. The
Study Design page has no analog ("Why this distribution? Why these
conditions of instruction? Why this Q-set size?"). This is a missed
chance to extend the transparency philosophy to where it matters most
methodologically. P1 (Marina) wants this for replication / preregistration.

🟡 **"Tester l'étude" semantics unclear.** Button is in the top bar;
does it open a participant-facing preview? Do test runs land in the
participant table flagged `is_test_run=True`? The DB column exists
(per CLAUDE.md migration list) so probably yes — but the button needs
a tooltip: "Open a participant preview — test runs are clearly marked
in the data".

🟡 **"Activer l'étude" is a one-click button.** Going from Brouillon →
Active is a meaningful state change (recruitment opens, public links
work). Should be a confirmation step listing what will become live.
P5 (Lina) on data ethics: "I want a confirm dialog with 'Have you
finalized your consent text? Reviewed your retention policy?'."

🟡 **"Importer une configuration" / "Exporter la configuration" icons
without labels.** These small icon-only buttons next to "Enregistrer"
look like upload/download. P2 (Tomás) won't know what they do until
hovered. Tooltips needed (or labels at this width).

🟢 **Step icons are cute but mixed signal.** "Let's meet" + person,
"First impressions" + lightning, "Your perspective" + gear (?),
"Why" + chat. P1 (Marina) might prefer Q-canonical phase labels
("Pre-sort / Sort / Post-sort") at least as a parenthetical. The
emoji-ed top-tabs (Pré-tri / Consigne / Q-tri / Post-tri) already
do this — just sync vocab between top tabs and step list.
