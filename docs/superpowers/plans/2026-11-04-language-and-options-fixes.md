# Bugs de langue et d'options — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une étude en plusieurs langues fonctionne de bout en bout sur un lien réel, et une question accepte plus de trois options sans confondre les réponses, avant l'enquête finnoise de décembre 2026.

**Architecture:** Corrections locales, à l'endroit où vit chaque règle. Le chargeur de route ne remplace plus la configuration déjà résolue dans la langue du participant. Chaque option reçoit une valeur propre à sa création, et l'activation refuse les doublons. Le designer conserve sa langue au Save. Aucune migration de schéma.

**Tech Stack:** React 19, React Router 7, TanStack Query, Zustand, i18next, Vitest ; FastAPI, pytest.

**Spec:** les constats ci-dessous, relevés le 2026-11-04 au commit `6023d4b5` par une exécution locale (`/home/julien/qualis-olli-guide/shots/NOTES.md`). La learning `.trail/learnings/2026-11-04-options-added-in-questionbuilder-share-one-julien.md` les résume.

| # | Constat | Cause | État de la cause | Tâche |
|---|---|---|---|---|
| A | Sur un lien réel, une langue autre que celle par défaut se fige au tri : le contenu bascule, la page reste grisée, **Confirm sort** ne répond plus | La route `/study/:slug` n'a pas de `shouldRevalidate`. Quand l'URL perd `?lang=` ou `?token=`, `studyLayoutLoader` relit l'étude sans langue, puis `StudyLayout` écrase la configuration avec `setConfig(study)`. L'effet « Stale Language » passe alors `isLoading` à `true`, et rien ne le remet à `false` car `data` n'a pas changé | Lue dans le code, cohérente avec les symptômes, **non reproduite par un test** | 2 |
| B | Un navigateur finnois reçoit l'anglais, alors que le designer promet la langue du navigateur | `useStudyConfig` n'envoie `lang` que depuis la session ou l'URL | Lue dans le code | 3 |
| C | À partir de la quatrième option, des réponses différentes s'exportent sous la même option | **Add option** ajoute le libellé par défaut, conservé ensuite comme `value` (`QuestionBuilder.tsx:963-969`, `:897`) | Lue et observée dans un export | 1 |
| D | **Save** ramène le designer à la langue par défaut, et l'édition suivante écrase ce texte | `setStudy` remet `activeLocale` à `default_language` (`useStudyDesigner.ts:268-277`) | Lue dans le code | 4 |
| E | Les libellés par défaut restent en anglais dans une étude finnoise | `t(key, { lng: 'fi' })` retombe sur l'anglais si `fi` n'est pas chargé | Déduite, à confirmer par le test | 4 |
| F | Le consentement pré-rempli affiche `\n` et `###` en français, allemand et finnois | `\\n` dans `constants/studyDefaults.ts` (24 occurrences par langue) | Comptée | 5 |
| G | **Test run** change la langue de l'interface d'administration | i18next enregistre tout `changeLanguage` (`detection.caches`) | Lue et reproduite | 5 |
| H | Un nouveau lien d'accès n'apparaît qu'après rechargement | `fetchQuery` rend le cache (5 min) car `onSuccess` ne l'invalide pas | Lue dans le code | 6 |
| I | Le slug suggéré perd les lettres accentuées | `replace(/[^a-z0-9]+/g, '-')` sans translittération | Lue dans le code | 6 |
| J | L'écran final finnois garde deux libellés en anglais | `erasure.section_title` et `erasure.button` sont en anglais dans `fi/participant.json` | Lue dans le fichier | 6 |

## Décisions

- **D1 — pas de réparation de données.** Les études publiques vérifiées (`ennallistaminen-pk`, `bioeconomy-futures`) n'ont aucune valeur d'option dupliquée. La tâche 7 contrôle toutes les études.
- **D2 — l'activation refuse les doublons d'options**, mais pas l'enregistrement d'un brouillon : un brouillon ancien reste ainsi éditable.
- **D3 — la langue du navigateur passe après la session et l'URL.** L'API retombe déjà sur la langue par défaut quand la traduction manque.
- **D4 — les études existantes gardent leur texte de consentement.** Seules les nouvelles études reçoivent le texte corrigé.

**Hors périmètre :** le champ `Consent title`, jamais affiché ; le dialogue d'activation qui annonce `Ready` avant le refus du serveur ; le compteur de liens qui compte les consentements et non les soumissions ; le titre d'étude pris sur la première traduction dans le menu latéral.

## Global Constraints

- Partir de `main` sur la branche `fix/language-and-options`, indépendante de `feat/user-lifecycle`.
- `?mode=test` doit survivre à toute restauration : une session pilote ne doit jamais être soumise comme réelle.
- Nouvelle chaîne : `t('clé', 'Fallback')`. Parité `participant.json` obligatoire.
- `app.services.study_service` reste à son niveau mypy strict.
- `make ci-fast` entre chaque tâche, `make ci` avant tout push. Un push sur `main` est un déploiement en production.

## Review Focus

1. **Rechargement en pleine session dans une langue secondaire.** La langue persistée doit tenir après F5, sans page grisée (test en tâche 2).
2. **Option supprimée puis ajoutée.** La nouvelle option ne doit pas réutiliser la valeur d'une option retirée (test en tâche 1).
3. **Options anciennes en chaînes simples mêlées à des objets.** Le calcul de valeur et le contrôle d'activation doivent accepter les deux formes (tests en tâche 1).
4. **Langue retirée de l'étude pendant l'édition.** Après Save, le designer revient à la langue par défaut au lieu de garder une langue absente (test en tâche 4).
5. **Navigateur en `fi-FI`, `pt-BR` ou langue non proposée.** Seul le code de base compte, et une langue absente donne la langue par défaut (test en tâche 3).

---

### Task 1: Une valeur propre par option

**Files:**
- Modify: `src/frontend/src/components/admin/designer/QuestionBuilder.helpers.ts`, `src/frontend/src/components/admin/designer/QuestionBuilder.tsx:963-969`, `src/backend/app/services/study_service.py` (`_check_questions`)
- Test: `src/frontend/src/components/admin/designer/QuestionBuilder.helpers.test.ts`, `src/frontend/src/components/admin/designer/QuestionBuilder.presort.test.tsx`, `src/backend/tests/integration/test_study_service.py`

**Interfaces:**
- Produces: `nextOptionValue(options: readonly (string | { value: string })[]): string`, qui renvoie `opt_<n>`, avec `n` égal au plus grand suffixe `opt_` présent plus un, au moins `options.length + 1`.

- [ ] **Step 1: Écrire les tests qui échouent.**

```ts
expect(nextOptionValue([{ value: 'opt_1' }, { value: 'opt_2' }])).toBe('opt_3');
expect(nextOptionValue([{ value: 'opt_1' }, { value: 'opt_5' }])).toBe('opt_6');   // pas de réemploi
expect(nextOptionValue(['Oui', { value: 'opt_2' }])).toBe('opt_3');               // forme ancienne
```

Dans `QuestionBuilder.presort.test.tsx` : `adding four options gives four distinct values`. Côté backend : `test_activation_refuses_duplicate_option_values` (objets), `test_activation_refuses_duplicate_string_options`, `test_activation_accepts_distinct_options`.

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/frontend && npx vitest run src/components/admin/designer/QuestionBuilder` et `cd src/backend && uv run pytest tests/integration/test_study_service.py -k option -v`. Expected: FAIL.

- [ ] **Step 3: Implémenter.** **Add option** ajoute `{ label: { [activeLocale]: <libellé par défaut> }, value: nextOptionValue(question.options ?? []) }`. `_check_questions` ajoute, au format d'erreur existant, une erreur par question dont deux options partagent une valeur, pour le pré-tri comme pour le post-tri.

- [ ] **Step 4: Vérifier.** Même commande. Expected: PASS.

- [ ] **Step 5: Commit** — `fix(designer): give every added option its own value`.

### Task 2: La langue du participant survit à la navigation

**Files:**
- Modify: `src/frontend/src/layouts/StudyLayout.loader.ts`, `src/frontend/src/App.tsx:346-349`, `src/frontend/src/layouts/StudyLayout.tsx:182-186`
- Test: `src/frontend/src/layouts/StudyLayout.test.tsx`, `src/frontend/src/layouts/StudyLayout.loader.test.ts` (Create), `src/frontend/e2e/participant/secondary-language.spec.ts` (Create)

**Interfaces:**
- Produces: `studyLayoutShouldRevalidate({ currentParams, nextParams }): boolean`, vrai seulement si `slug` change.

- [ ] **Step 1: Reproduire d'abord.** Écrire `keeps the session language when loader data arrives in the default language` : session en `fi`, `useLoaderData` renvoie `language: 'en'`, le store de configuration reste en `fi` et `isLoading` à `false`. Écrire la spec e2e : une étude `en` + `fi`, ouverte avec `?lang=fi` sur un lien réel, va jusqu'à l'écran final en finnois.

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/frontend && npx vitest run src/layouts/StudyLayout.test.tsx`, puis `make e2e` limité à la spec. Expected: FAIL, page grisée au tri. **Si la spec e2e passe, s'arrêter : la cause du constat A est fausse.** Reprendre avec superpowers:systematic-debugging.

- [ ] **Step 3: Implémenter.** Déclarer `shouldRevalidate: studyLayoutShouldRevalidate` sur la route. Dans `StudyLayout`, ignorer `study` du chargeur quand `sessionLanguage` existe et diffère de `study.language`.

- [ ] **Step 4: Ajouter les cas restants.** `a reload mid-session keeps the persisted language`, `the header language menu works up to the final screen`, `test mode keeps ?mode=test`, `a different slug revalidates`.

- [ ] **Step 5: Vérifier.** Mêmes commandes, plus `src/layouts/StudyLayout.session.test.tsx`. Expected: PASS.

- [ ] **Step 6: Commit** — `fix(participant): keep the chosen language when the route reloads`.

### Task 3: Respecter la langue du navigateur

**Files:**
- Modify: `src/frontend/src/hooks/useStudyConfig.ts:147-149`
- Test: `src/frontend/src/hooks/useStudyConfig.test.ts`

**Interfaces:**
- Produces: `browserLanguage(): string | undefined`, code de base de `navigator.language`, limité aux langues de `SUPPORTED_LANGUAGES`.

- [ ] **Step 1: Écrire les tests qui échouent.** `requests the browser language when there is no session or URL language` (`fi-FI` → `lang=fi`), `prefers the session language`, `prefers the URL language`, `sends no language for an unsupported browser language`, `reduces pt-BR to pt`.

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/frontend && npx vitest run src/hooks/useStudyConfig.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implémenter.** `langToRequest = sessionLanguage || urlLang || browserLanguage()`.

- [ ] **Step 4: Vérifier.** Même commande. Expected: PASS.

- [ ] **Step 5: Commit** — `fix(participant): use the browser language when the study offers it`.

### Task 4: Le designer garde sa langue

**Files:**
- Modify: `src/frontend/src/store/useStudyDesigner.ts:268-277`, `src/frontend/src/hooks/admin/useStudyDesignPage.ts`
- Test: `src/frontend/src/store/useStudyDesigner.test.ts`, `src/frontend/src/hooks/admin/useStudyDesignPage.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent.** `setStudy keeps the active locale for the same study`, `setStudy uses the default language for another study`, `setStudy leaves a locale the study no longer has`, `loads the active locale's translations`.

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/frontend && npx vitest run src/store/useStudyDesigner.test.ts src/hooks/admin/useStudyDesignPage.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implémenter.** `setStudy` conserve `activeLocale` si `state.original?.id === study.id` et si `study.translations` contient cette langue. `useStudyDesignPage` appelle `i18n.loadLanguages(activeLocale)` quand la langue change. Si le test ne confirme pas la cause du constat E, signaler `DONE_WITH_CONCERNS`.

- [ ] **Step 4: Vérifier.** Même commande. Expected: PASS.

- [ ] **Step 5: Commit** — `fix(designer): stay on the edited language after saving`.

### Task 5: Consentement pré-rempli et langue d'administration

**Files:**
- Modify: `src/frontend/src/constants/studyDefaults.ts`, `src/frontend/src/i18n.ts:56`, `src/frontend/src/components/admin/AppSidebar.tsx:77`
- Test: `src/frontend/src/constants/studyDefaults.test.ts`, `src/frontend/src/components/admin/AppSidebar.test.tsx`

- [ ] **Step 1: Écrire les tests qui échouent.** `no default text holds a literal backslash-n`, pour chaque langue de `DEFAULT_STUDY_CONTENT`. `the sidebar language menu persists the choice`. `a participant language change does not touch the admin choice`.

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/frontend && npx vitest run src/constants/studyDefaults.test.ts src/components/admin/AppSidebar.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implémenter.** Remplacer `\\n` par `\n`. Passer `detection.caches` à `[]`, et faire écrire `i18nextLng` par le seul menu de `AppSidebar`, via `safeBrowserLocalStorage`.

- [ ] **Step 4: Vérifier.** Même commande. Expected: PASS.

- [ ] **Step 5: Commit** — `fix(i18n): real line breaks in default consent, admin language set only by its menu`.

### Task 6: Trois petites corrections

**Files:**
- Modify: `src/frontend/src/hooks/admin/useRecruitmentPage.ts:226-254`, `src/frontend/src/components/admin/CreateStudyDialog.tsx:86-90`, `src/frontend/public/locales/fi/participant.json:432-434`
- Test: `src/frontend/src/hooks/admin/useRecruitmentPage.test.ts`, le test existant de `CreateStudyDialog`

- [ ] **Step 1: Écrire les tests qui échouent.** `invalidates the links query before revalidating` (création et révocation) ; `the suggested slug keeps accented letters as their base letter` : `Asenteet etätyötä kohtaan` → `asenteet-etatyota-kohtaan`.

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/frontend && npx vitest run src/hooks/admin/useRecruitmentPage.test.ts src/components/admin/CreateStudyDialog`. Expected: FAIL.

- [ ] **Step 3: Implémenter.** Dans les deux `onSuccess`, `await queryClient.invalidateQueries({ queryKey: getListStudyLinksApiAdminRecruitmentSlugLinksGetQueryKey(slug) })` avant `revalidator.revalidate()`. Slug : `.normalize('NFD').replace(/\p{M}/gu, '')` avant le `replace` existant. Traduire `erasure.section_title` et `erasure.button` selon `src/frontend/scripts/i18n/glossaries/fi.yaml`, et contrôler les mêmes clés dans les autres langues.

- [ ] **Step 4: Vérifier.** Même commande, puis `npm run i18n-check`. Expected: PASS.

- [ ] **Step 5: Commit** — `fix: refresh new access links, keep accented letters in slugs, translate erasure labels`.

### Task 7: Vérifier sur le vrai parcours, puis mettre à jour la documentation

**Requiert l'accord explicite de Julien avant le push.** Le contrôle du step 1 lit la production sans rien y écrire.

**Files:**
- Modify: `docs/tutorials/your-first-study.md`, `docs/tutorials/collecting-responses.md`, `/home/julien/qualis-olli-guide/guide.html`

- [ ] **Step 1: Contrôler les options de toutes les études en prod**, par une requête en lecture seule sur `presort_config` et `postsort_config`. Expected: aucun doublon ; sinon, s'arrêter et signaler les études touchées.

- [ ] **Step 2: Rejouer le parcours en local**, avec une étude `en` + `fi` et une question à cinq options : deux tris complets sur lien réel, en `fi-FI` et `en-US`. Expected: écran final atteint, cinq valeurs distinctes dans le CSV.

- [ ] **Step 3: Corriger les tutoriels** avec la liste de `NOTES.md` §3.

- [ ] **Step 4: Après déploiement seulement,** retirer du guide les règles 1 et 2 et les parades devenues inutiles, puis regénérer le PDF : `weasyprint guide.html qualis-quick-setup-guide.pdf`.

- [ ] **Step 5: Commit** — `docs: correct the tutorials against the real interface`.
