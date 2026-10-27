# Corrections de l'audit ponytail du 2026-10-27 — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 18 constats de l'audit ponytail du 2026-10-27 (intégrité des données participant, contrôle d'accès, tenue en charge, code mort) sans migration de schéma.

**Architecture:** Chaque constat est corrigé à l'endroit où vit la règle : le recrutement passe de `/submit` à `/consent` (là où naît la ligne participant), l'invitation devient à usage unique via la table `consumed_email_tokens` existante, bcrypt sort de la boucle async par `asyncio.to_thread`, l'IP client passe par l'unique helper `_get_real_ip`. Côté frontend, les stores persistés cessent de garder le jeton d'une session terminée et sont cloisonnés par étude.

**Tech Stack:** FastAPI, SQLAlchemy async, pytest-asyncio (backend, `uv run pytest`) ; React 19, Zustand `persist`, Vitest (frontend) ; nginx (Compose).

**Spec:** le rapport d'audit ponytail du 2026-10-27 (conversation). Sa table de constats est reprise ci-dessous ; la learning `.trail/learnings/2026-10-27-participant-rows-are-created-by-consent-julien.md` documente la cause du constat 1.

| # | Constat | Tâche |
|---|---|---|
| 1 | Plafond et attribution des liens de recrutement jamais appliqués ; `start_count` compté ≥ 2 fois | 1 |
| 2 | Invitation réutilisable après retrait ; jeton d'invitation refusé comme jeton d'accès par accident | 2 |
| 3 | Appareil partagé : le participant suivant hérite de la session précédente | 10 |
| 4 | bcrypt bloque la boucle async | 3 |
| 5 | Chaque requête participant charge tous les participants | 4 |
| 6 | nginx Compose refuse les uploads > 1 Mo | 5 |
| 7 | Le mot de passe d'étude ne protège ni `/consent` ni `/submit` | 6 |
| 8 | Deux onglets partagent la même clé de stockage | 11 |
| 9 | Hors-ligne : brouillon perdu, indicateur caché sur mobile | 12 |
| 10 | `X-Forwarded-For` falsifiable (entrée la plus à gauche) | 7 |
| 11 | L'empreinte IP participant est celle du proxy | 7 |
| 12 | Codes de reprise en clair dans les logs | 8 |
| 13 | Ping silencieux affiche « Submission failed » ; lien expiré bloque la soumission finale | 1 (backend), 13 (frontend) |
| 14 | La production démarre avec la `SECRET_KEY` publique | 9 |
| 15 | Huit méthodes-relais `StudyService` | 14 |
| 16 | Normalisation d'URL de base dupliquée | 15 |
| 17 | Trois scripts de debug orphelins | 15 |
| 18 | `email_hash_key_func` async inutilisée | 15 |

## Global Constraints

- Aucune migration Alembic : head reste `1d82a52cfe76` ; `consumed_email_tokens.purpose` est un `String` libre, la valeur `"invitation"` y entre sans DDL.
- Python : toujours via `uv run` depuis `src/backend` (jamais le Python système) ; modules sous `mypy --strict` (liste dans `CLAUDE.md`) restent stricts — pas de `Any` nouveau sans `# type: ignore[explicit-any]` justifié.
- Toute modification de schéma Pydantic ou de route ⇒ `make generate-api` puis commit de `openapi.json` et `src/frontend/src/api/` régénérés.
- i18n : aucune nouvelle clé participant (parité stricte sur 9 locales : de en es fi fr it nl pl pt) ; réutiliser `welcome.restart` (« Start a new session ») qui existe déjà.
- `make ci-fast` entre chaque tâche ; `make ci` avant push. E2E non requis (pas de code admin-flow touché, sauf tâche 2 côté invitation : lancer `make e2e` une fois en fin de plan).
- Commits : messages conventionnels, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Travailler sur une branche (`fix/audit-2026-10-27`), jamais sur `main`.
- Garde-fous source-grep existants : si un test « wave_N » épingle une ligne déplacée, le repointer vers la fonction qui porte désormais la propriété, ne jamais le supprimer (cf. mémoire architecture-diagnostic).

## Review Focus

1. **Participant déjà en cours au déploiement de la tâche 1** (consentement donné sans lien, `link_token` encore dans l'URL) : sa soumission finale doit passer en 200, sans 403 ni double comptage — test ajouté en tâche 1.
2. **Frontend ancien en cache** qui envoie `link_token` à `/submit` et pas à `/consent` : requête acceptée, champ ignoré — test ajouté en tâche 1.
3. **Invitation émise avant la tâche 2** (sans `jti`) : réponse 400 lisible « invitation_expired », jamais 500 — test ajouté en tâche 2.
4. **Session participant persistée sous l'ancienne clé `qualis-session` au déploiement de la tâche 11** : l'état est retrouvé (lecture de repli sur la clé héritée) — test ajouté en tâche 11.
5. **Requête sans `X-Forwarded-For`, ou en-tête avec espaces/entrées vides, derrière proxy de confiance** : repli sur le pair TCP, pas d'exception — test ajouté en tâche 7.

---

### Task 1: Le recrutement s'enregistre au consentement

**Files:**
- Modify: `src/backend/app/schemas/participants.py:40-46` (`ConsentInput`), `:68` (`SubmissionInput.link_token`)
- Modify: `src/backend/app/services/submission_service.py:38-162` (`record_consent`), `:319-400` (`_find_or_create_participant`), `:409-465` (`_update_existing_participant`), `:502-616` (`process_submission`)
- Modify: `src/backend/app/routers/participants.py:37-65`, `src/backend/app/routers/submissions.py:100-110`
- Modify: `src/frontend/src/pages/ConsentPage.tsx:78-86`, `src/frontend/src/hooks/useSubmitStudy.ts:120-128,190-199`
- Create: `src/backend/tests/integration/test_recruitment_consent_flow.py`
- Modify: `src/backend/tests/integration/test_recruitment.py:44-55` (le `start_count` ne bouge plus au GET)
- Regenerate: `openapi.json`, `src/frontend/src/api/`

**Interfaces:**
- Produces: `ConsentInput.link_token: str | None = Field(None, max_length=128)` ; `SubmissionService.record_consent(db, study_slug, session_token, language_code, consent_hash=None, ip_address=None, user_agent=None, link_token: str | None = None) -> dict[str, Any]` ; `SubmissionService._find_or_create_participant` perd son paramètre `link`.
- Consumes: `RecruitmentService.validate_link_token`, `increment_usage`, `record_start` (inchangés).

- [ ] **Step 1: Écrire les tests qui échouent** dans `tests/integration/test_recruitment_consent_flow.py`. Fixture locale `capped_link(db, active_study)` : `RecruitmentLink(study_id=active_study.id, type=RecruitmentLinkType.limited, token="cap-one", capacity=1)`. Helper `_consent(client, slug, token, link_token=None)` qui POST `/api/study/{slug}/consent` (forme de `test_participation.py:20-28`) et `_complete(client, study, token, link_token=None)` qui POST `/api/submit` avec la grille de `test_participation.py:31-47`.
  - `test_consent_through_link_counts_usage_start_and_attribution` : consent avec `link_token="cap-one"` → 200 ; après `db.refresh(link)` : `usage_count == 1`, `start_count == 1` ; participant chargé par `session_token` : `recruitment_token == "cap-one"`.
  - `test_attribution_survives_final_submit` : consent avec lien, puis `_complete` (presort `{"age": 25}`) → 200 ; `participant.recruitment_token == "cap-one"` et `presort_answers["age"] == 25`.
  - `test_full_link_refuses_new_consent` : premier consent OK, second `session_token` → 403 ; `select(count(Participant.id))` pour l'étude == 1.
  - `test_reconsent_same_session_counts_once` : deux consents même token + lien → `usage_count == 1`.
  - `test_study_page_load_does_not_count_start` : deux `GET /api/study/{slug}?link_token=cap-one` → 200, `start_count == 0`.
  - `test_old_client_link_token_on_submit_is_ignored` (Review Focus 1 et 2) : consent **sans** lien, puis `_complete(..., link_token="cap-one")` → 200 ; `usage_count == 0`.
  - `test_expired_link_does_not_block_final_submit` : consent avec lien, puis `link.expires_at = now - 1 day`, commit, `_complete(..., link_token="cap-one")` → 200.

- [ ] **Step 2: Vérifier l'échec**
  Run: `cd src/backend && uv run pytest tests/integration/test_recruitment_consent_flow.py -v`
  Expected: FAIL (usage_count 0, start_count 2, 403 attendu non obtenu…).

- [ ] **Step 3: Implémenter côté backend.**
  - `ConsentInput` : ajouter `link_token`.
  - `record_consent` : dans la branche « participant inexistant » **avant** de construire `Participant`, si `link_token` : `link = await RecruitmentService.validate_link_token(db, study.id, link_token)` ; `None` ou `increment_usage` à `False` ⇒ `raise ForbiddenError("Invalid, expired, or full recruitment link")` ; puis `record_start(db, link.id)` et `presort_answers={"_recruitment_token": link_token}` sur le nouveau participant. Ligne existante : aucune action de lien.
  - Router `participants.py` : passer `link_token=data.link_token`.
  - `process_submission` : supprimer le bloc de validation du lien (l. 523-530) ; `_find_or_create_participant` : supprimer le paramètre `link` et le bloc `_recruitment_token`/`increment_usage` (l. 381-387).
  - `_update_existing_participant` : conserver `_recruitment_token` existant — `presort_answers = {**presort_answers, "_recruitment_token": participant.recruitment_token}` quand celui-ci n'est pas `None`.
  - `SubmissionInput.link_token` : garder le champ, commentaire d'une ligne « ignoré : le recrutement est enregistré au consentement ; accepté pour les clients antérieurs ».
  - `submissions.py` `get_study` : garder la validation 403 du lien, supprimer `record_start` et le `db.commit()` qui le suit.

- [ ] **Step 4: Mettre à jour `test_recruitment.py::test_recruitment_logic`** : le compteur passe par un consent avec `link_token` (au lieu du GET), assertion `start_count == 1` conservée.

- [ ] **Step 5: Vérifier le backend**
  Run: `cd src/backend && uv run pytest tests/integration/test_recruitment_consent_flow.py tests/integration/test_recruitment.py tests/integration/test_participation.py tests/security/wave_5 -v`
  Expected: PASS.

- [ ] **Step 6: Régénérer le client et brancher le frontend.**
  Run: `make generate-api`. Puis `ConsentPage.tsx` : ajouter `link_token: new URLSearchParams(window.location.search).get('token') ?? undefined` au `data` de `recordConsentMutation`. `useSubmitStudy.ts` : retirer `linkToken` de `SubmissionContext`, de `resolveSubmissionContext` et de `buildPayload`.
  Ajouter dans `ConsentPage.test.tsx` : `it('sends the recruitment token from the URL with the consent')` — URL `?token=abc`, assertion que la mutation reçoit `data.link_token === 'abc'`. Adapter les assertions de `useSubmitStudy.test.ts` qui attendaient `link_token`.

- [ ] **Step 7: Vérifier**
  Run: `cd src/frontend && npx vitest run src/pages/ConsentPage.test.tsx src/hooks/useSubmitStudy.test.ts && cd ../.. && make ci-fast`
  Expected: PASS.

- [ ] **Step 8: Commit**
  `git commit -m "fix(recruitment): count link usage and attribution at consent, where the participant row is created"`

---

### Task 2: Invitations à usage unique ; un jeton typé n'est jamais un jeton d'accès

**Files:**
- Modify: `src/backend/app/utils/security.py:70-97` (`create_invitation_token`), `:100-116` (`decode_access_token`), `:119-133` (`decode_invitation_token`)
- Modify: `src/backend/app/routers/admin/invitations.py:66-120`, `src/backend/app/routers/auth.py:309-352`
- Create: `src/backend/tests/integration/test_invitation_single_use.py`
- Modify: `src/backend/tests/integration/test_jwt_isolation.py` (deux tests ajoutés)

**Interfaces:**
- Produces: les jetons d'invitation portent `jti: str` (`secrets.token_urlsafe(16)`) ; `decode_invitation_token` lève `jwt.InvalidTokenError("invitation_expired")` si `jti` absent ; `decode_access_token` lève `jwt.InvalidTokenError` si le payload contient `type` ou `aud`.
- Consumes: `mark_jti_consumed(db, jti, purpose="invitation")`, `is_jti_consumed(db, jti)` de `app.services.email_token_consume_service`.

- [ ] **Step 1: Tests qui échouent.**
  `test_invitation_single_use.py` (fixtures `project_factory`, `user_factory`, `auth_token_factory`, `project_member_factory`) :
  - `test_removed_member_cannot_reaccept_same_invitation` : owner invite B (POST `/api/admin/projects/{slug}/invitations`), B accepte (200), owner retire B (DELETE `/members/{id}`, 204), B re-POST `/api/admin/invitations/accept` même jeton → 400 `detail == "invitation_already_used"` ; B n'est pas membre.
  - `test_invitation_used_at_register_cannot_be_accepted_again` : register avec `invitation_token` → membre ; puis accept du même jeton par ce compte → 400 `invitation_already_used`.
  - `test_legacy_invitation_without_jti_is_refused_cleanly` (Review Focus 3) : jeton signé à la main sans `jti` (`jwt.encode({"sub":…, "role":"member", "type":"invitation", "project_id":…, "exp":…}, settings.SECRET_KEY, algorithm="HS256")`) → accept 400 `detail == "invitation_expired"`.
  `test_jwt_isolation.py` :
  - `test_invitation_token_rejected_as_access_token` : `create_invitation_token(email=user.email, role="member", project_id=…)` en `Authorization: Bearer` sur `/api/me` → 401, **même** après avoir patché le payload pour y ajouter `iat=now` (re-signé), ce qui prouve que le refus vient de `type`, plus de l'absence d'`iat`.
  - `test_email_token_rejected_as_access_token_by_type_check` : déjà couvert par `aud` — ajouter seulement si absent.

- [ ] **Step 2: Vérifier l'échec**
  Run: `cd src/backend && uv run pytest tests/integration/test_invitation_single_use.py tests/integration/test_jwt_isolation.py -v`
  Expected: FAIL (200 au lieu de 400 ; 200 au lieu de 401 avec `iat`).

- [ ] **Step 3: Implémenter.**
  - `create_invitation_token` : ajouter `"jti": secrets.token_urlsafe(16)`.
  - `decode_invitation_token` : après le contrôle `type`, `if not payload.get("jti"): raise jwt.InvalidTokenError("invitation_expired")`.
  - `decode_access_token` : après `jwt.decode`, `if "type" in payload or "aud" in payload: raise jwt.InvalidTokenError("not an access token")`.
  - `accept_invitation` : distinguer le message `invitation_expired` (400 `detail="invitation_expired"`) ; après le contrôle e-mail et avant l'ajout du membre, `try: await mark_jti_consumed(db, payload["jti"], purpose="invitation")` / `except IntegrityError: await db.rollback(); raise HTTPException(400, "invitation_already_used")`. Le cas « déjà membre » consomme aussi le jeton (même transaction).
  - `register_user` : avant le `try` de création, `if invitation_payload and await is_jti_consumed(db, invitation_payload["jti"]): raise HTTPException(400, "invitation_already_used")` ; dans le `try`, `await mark_jti_consumed(db, invitation_payload["jti"], purpose="invitation")` juste après l'ajout de `ProjectMember`.

- [ ] **Step 4: Vérifier**
  Run: `cd src/backend && uv run pytest tests/integration/test_invitation_single_use.py tests/integration/test_jwt_isolation.py tests/integration/test_auth.py tests/integration/test_recruitment.py -k invitation_flow tests/security -q && cd ../.. && make ci-fast`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "fix(auth): make invitations single-use and refuse typed tokens as access tokens"`
  Mentionner dans le corps : les invitations en attente au déploiement sont à renvoyer (sans `jti`, refusées en `invitation_expired`).

---

### Task 3: bcrypt hors de la boucle async

**Files:**
- Modify: `src/backend/app/utils/security.py:39-50`
- Modify: `src/backend/app/routers/submissions.py:112-119,141-147`, `src/backend/app/routers/auth.py:120-133,493,590`, `src/backend/app/services/study_service.py:236-239`
- Create: `src/backend/tests/unit/test_password_thread_offload.py`
- Test: `src/backend/tests/integration/test_public_study_endpoint.py`

**Interfaces:**
- Produces: `async def verify_password_async(plain_password: str, hashed_password: str) -> bool` et `async def get_password_hash_async(password: str) -> str` dans `app.utils.security` (chacune un `asyncio.to_thread` de la fonction synchrone). Les fonctions synchrones restent (scripts, fixtures).

- [ ] **Step 1: Tests qui échouent** (`test_password_thread_offload.py`) :
  - `test_verify_password_async_does_not_block_loop` : lancer `verify_password_async("x", hash)` et, en parallèle, une tâche qui incrémente un compteur toutes les 10 ms ; assert compteur ≥ 5 à la fin (bcrypt ≈ 300 ms).
  - `test_get_study_without_password_skips_bcrypt` (dans `tests/integration/test_public_study_endpoint.py`, fixture `active_study` avec `access_password = get_password_hash("pw")`) : patcher `app.routers.submissions.verify_password_async` avec un `AsyncMock` ; `GET /api/study/{slug}` sans `password` → `requires_password is True` et le mock **n'a pas** été appelé.

- [ ] **Step 2: Vérifier l'échec**
  Run: `cd src/backend && uv run pytest tests/unit/test_password_thread_offload.py -v`
  Expected: FAIL (`ImportError: verify_password_async`).

- [ ] **Step 3: Implémenter** les deux fonctions, puis remplacer chaque appel en contexte `async` : `get_study` (court-circuit : `if study.access_password and (password is None or not await verify_password_async(password, study.access_password))`), `unlock_study`, `login_for_access_token` (les deux bras, decoy compris), `change_password`, `disable_totp`, `password_reset_confirm`, `register_user` et `update_study` (hash). Grep de contrôle : `grep -n "verify_password(\|get_password_hash(" src/backend/app --include=*.py -r` ne doit plus montrer d'appel dans une `async def` de router/service.

- [ ] **Step 4: Vérifier**
  Run: `cd src/backend && uv run pytest tests/unit/test_password_thread_offload.py tests/integration/test_public_study_endpoint.py tests/integration/test_auth.py tests/security -q && cd ../.. && make ci-fast`
  Expected: PASS (si un test wave épingle `verify_password(form_data.password, _LOGIN_DECOY_HASH)` par grep, le repointer vers la forme async).

- [ ] **Step 5: Commit** — `perf(auth): run bcrypt in a worker thread so one password check no longer stalls every request`

---

### Task 4: Ne plus charger les participants sur les routes participant

**Files:**
- Modify: `src/backend/app/services/study_service.py:62-73` (`get_study_by_slug`)
- Test: `src/backend/tests/integration/test_participation.py`

**Interfaces:**
- Produces: `get_study_by_slug` charge `translations` et `statements.translations` seulement ; accéder à `study.participants` sur son résultat lève (relation `lazy="raise"`), ce qui est voulu.

- [ ] **Step 1: Test qui échoue** — `test_get_study_by_slug_does_not_load_participants` (intégration via fixture `active_study` + 3 participants) : `study = await StudyService.get_study_by_slug(db, slug)` ; `assert "participants" not in sqlalchemy.inspect(study).dict` (après `db.expunge_all()` avant l'appel pour vider l'identity map).
- [ ] **Step 2: Vérifier l'échec** — `cd src/backend && uv run pytest tests/integration/test_participation.py -k participants -v` → FAIL.
- [ ] **Step 3: Supprimer** `selectinload(Study.participants)` à la ligne 70. Vérifier par grep que `studies.py:276` (`change_study_state`) n'utilise pas `updated_study.participants` (réponse `StudyRead`, `participant_count` calculé ailleurs).
- [ ] **Step 4: Vérifier** — `cd src/backend && uv run pytest tests/ -q -x` (suite complète : c'est ici qu'un accès caché lèverait) → PASS.
- [ ] **Step 5: Commit** — `perf(participant): stop loading every participant row on each participant request`

---

### Task 5: nginx Compose accepte les enregistrements audio

**Files:**
- Modify: `src/frontend/nginx.conf:37-43`
- Modify: `src/backend/tests/unit/test_deployment_entrypoints.py` (ou le test de configuration de déploiement existant le plus proche)

- [ ] **Step 1: Test qui échoue** — `test_nginx_body_limit_covers_audio_limit` : lire `src/frontend/nginx.conf`, extraire `client_max_body_size (\d+)m` dans le bloc `location /api/`, assert valeur ≥ `Settings().AUDIO_MAX_FILE_SIZE_MB + 1`.
- [ ] **Step 2: Vérifier l'échec** — `cd src/backend && uv run pytest tests/unit/test_deployment_entrypoints.py -k nginx -v` → FAIL (motif absent).
- [ ] **Step 3: Ajouter** `client_max_body_size 12m;` dans `location /api/`, avec un commentaire d'une ligne : « ≥ AUDIO_MAX_FILE_SIZE_MB (10) + marge multipart ; défaut nginx = 1m ».
- [ ] **Step 4: Vérifier** — même commande → PASS ; `docker compose -f docker-compose.production.yml config -q` sans erreur si Docker disponible.
- [ ] **Step 5: Commit** — `fix(docker): raise nginx body limit so audio answers over 1 MB reach the backend`

---

### Task 6: Le mot de passe d'étude protège le consentement

**Files:**
- Modify: `src/backend/app/schemas/participants.py:40-46`, `src/backend/app/services/submission_service.py` (`record_consent`), `src/backend/app/routers/participants.py:37-65`
- Modify: `src/frontend/src/pages/ConsentPage.tsx` (payload), `src/frontend/src/hooks/useStudyConfig.ts:127` (déverrouillage), `src/frontend/src/store/useSessionStore.ts` (champ non persisté)
- Test: `src/backend/tests/integration/test_public_study_endpoint.py`, `src/frontend/src/pages/ConsentPage.test.tsx`
- Regenerate: `openapi.json`, `src/frontend/src/api/`

**Interfaces:**
- Consumes: `verify_password_async` (tâche 3), `record_consent(..., link_token=...)` (tâche 1).
- Produces: `ConsentInput.password: str | None = Field(None, max_length=256)` ; `record_consent(..., password: str | None = None)` lève `ForbiddenError("study_password_required")` quand `study.access_password` est défini et que le mot de passe manque ou est faux. `/submit` n'est pas modifié : il exige déjà `consented_at`.

- [ ] **Step 1: Tests qui échouent** (`test_public_study_endpoint.py`, étude active avec `access_password`) : `test_consent_without_password_is_refused` → 403, aucun participant créé ; `test_consent_with_wrong_password_is_refused` → 403 ; `test_consent_with_password_succeeds` → 200 ; `test_completed_submit_without_consent_still_refused` → 4xx « consent has not been recorded ». Frontend : `it('sends the unlocked study password with the consent')`.
- [ ] **Step 2: Vérifier l'échec** — `cd src/backend && uv run pytest tests/integration/test_public_study_endpoint.py -k consent -v` → FAIL.
- [ ] **Step 3: Implémenter** : contrôle en tête de `record_consent` (avant toute écriture), uniquement pour un participant **nouveau** (une reconsentement d'une session existante n'exige pas de ressaisie) ; router passe `password=data.password` ; `make generate-api` ; côté frontend, `useStudyConfig` écrit le mot de passe accepté dans un nouveau champ `studyPassword: string | null` de `useSessionStore`, exclu de `partialize` (jamais persisté) et remis à `null` par `resetSession` ; `ConsentPage` l'ajoute au `data` du consentement.
- [ ] **Step 4: Vérifier** — backend + `npx vitest run src/pages/ConsentPage.test.tsx` + `make ci-fast` → PASS.
- [ ] **Step 5: Commit** — `fix(participant): require the study password at consent, the step that creates the participant`

---

### Task 7: Une seule source pour l'IP client

**Files:**
- Modify: `src/backend/app/limiter.py:13-38` (`_get_real_ip`)
- Modify: `src/frontend/nginx.conf:41` (et le bloc `/health`)
- Modify: `src/backend/app/routers/participants.py:57`, `src/backend/app/routers/submissions.py:39-42`, `src/backend/app/routers/logs.py:47`
- Create: `src/backend/tests/unit/test_limiter_real_ip.py`
- Test: `src/backend/tests/integration/test_participation.py`
- Modify: `docs/guides/deployment.md:324`, `docs/reference/configuration.md:184`

**Interfaces:**
- Produces: `_get_real_ip(request: Request) -> str` renvoie, derrière un proxy de confiance, **l'entrée non vide la plus à droite** de `X-Forwarded-For` (celle ajoutée par le proxy le plus proche, non falsifiable par le client) ; sans en-tête ou en-tête vide : le pair TCP. Le nginx de Compose transmet l'en-tête reçu sans s'ajouter (`proxy_set_header X-Forwarded-For $http_x_forwarded_for;`), de sorte que l'entrée la plus à droite est celle du proxy TLS de l'hôte.

- [ ] **Step 1: Tests qui échouent** (`test_limiter_real_ip.py`, `Request` Starlette construit depuis un `scope` comme `test_resume_code_brute_force.py::_make_request`, `monkeypatch` sur `settings.TRUSTED_PROXIES`) :
  - `test_spoofed_leftmost_entry_is_ignored` : `"*"`, en-tête `"6.6.6.6, 203.0.113.7"` → `"203.0.113.7"`.
  - `test_untrusted_peer_ignores_header` : `""`, même en-tête, pair `10.0.0.2` → `"10.0.0.2"`.
  - `test_missing_or_blank_header_falls_back_to_peer` (Review Focus 5) : `"*"`, en-têtes absents, `""`, `" , "` → pair TCP.
  - `test_participant_routes_hash_the_forwarded_ip` (dans `tests/integration/test_participation.py`) : deux `POST /consent` avec `X-Forwarded-For` différents, `TRUSTED_PROXIES="*"` → `ip_address` des deux participants différents.
- [ ] **Step 2: Vérifier l'échec** — `cd src/backend && uv run pytest tests/unit/test_limiter_real_ip.py -v` → FAIL.
- [ ] **Step 3: Implémenter** : dans `_get_real_ip`, `entries = [e.strip() for e in forwarded.split(",") if e.strip()]` puis `entries[-1]` si non vide ; mettre à jour la docstring (« rightmost hop ») ; remplacer `request.client.host` par `_get_real_ip(request)` dans les trois routers ; nginx comme ci-dessus ; une phrase dans les deux docs : le proxy TLS de l'hôte doit poser ou compléter `X-Forwarded-For` (Caddy, Traefik et nginx `$proxy_add_x_forwarded_for` conviennent).
- [ ] **Step 4: Vérifier** — `uv run pytest tests/unit/test_limiter_real_ip.py tests/security/wave_5/test_resume_code_brute_force.py tests/integration -q` → PASS ; `make ci-fast`.
- [ ] **Step 5: Vérification manuelle post-déploiement (à noter dans la PR)** : `for i in $(seq 7); do curl -s -o /dev/null -w '%{http_code}\n' -H "X-Forwarded-For: 10.0.0.$i" -d 'username=x&password=y' https://<instance>/api/token; done` → la 6ᵉ réponse doit être `429`.
- [ ] **Step 6: Commit** — `fix(security): key rate limits and participant IP hashes on the proxy-added client IP`

---

### Task 8: Les codes de reprise ne vont plus dans les logs

**Files:**
- Modify: `src/backend/app/middleware/log_scrub.py:54-57` (`_TOKEN_RE`, `scrub_token_query`)
- Modify: `src/backend/app/routers/logs.py:52-62`
- Test: `src/backend/tests/unit/test_email_log_scrub.py`

**Interfaces:**
- Produces: `scrub_token_query(path_with_query: str) -> str` masque aussi `/resume/<code>` → `/resume/REDACTED` ; `logs.py` applique `scrub_token_query` à chaque valeur `str` de `entry.context` (un niveau, les valeurs non-str inchangées).

- [ ] **Step 1: Tests qui échouent** : `scrub_token_query("/api/study/s/resume/brave-tiger-427?x=1") == "/api/study/s/resume/REDACTED?x=1"` ; `scrub_token_query("GET /resume/brave-tiger-427 500") ` contient `REDACTED` ; test de route `POST /api/logs` avec `context={"endpoint": "/api/study/s/resume/brave-tiger-427"}` : l'enregistrement capturé (`caplog`) ne contient pas `brave-tiger-427`.
- [ ] **Step 2: Vérifier l'échec** — `cd src/backend && uv run pytest tests/unit/test_email_log_scrub.py -v` → FAIL.
- [ ] **Step 3: Implémenter** : seconde regex `_RESUME_PATH_RE = re.compile(r"(/resume/)[^/?\s]+")` appliquée dans `scrub_token_query` ; scrub du `context` dans `logs.py` ; ajouter « resume path segment » à la docstring du module.
- [ ] **Step 4: Vérifier** — même commande + `make ci-fast` → PASS.
- [ ] **Step 5: Commit** — `fix(logs): redact resume codes carried in URL paths and frontend error context`

---

### Task 9: Refuser de démarrer en production avec la clé publique

**Files:**
- Modify: `src/backend/app/main.py:79-94`
- Test: `src/backend/tests/unit/test_deployment_entrypoints.py`

**Interfaces:**
- Produces: `lifespan` lève `RuntimeError("SECRET_KEY is the published development default")` (idem `IP_HASH_SALT`) quand `settings.ENVIRONMENT == "production"` ; `"test"` et `"development"` gardent l'avertissement actuel.

- [ ] **Step 1: Test qui échoue** — `test_production_refuses_default_secret_key` : `monkeypatch` `settings.ENVIRONMENT="production"`, `settings.SECRET_KEY=_INSECURE_DEFAULT_SENTINEL` ; `async with lifespan(app):` → `pytest.raises(RuntimeError)` ; même chose pour `IP_HASH_SALT` ; `test_staging_keeps_warning` pour `ENVIRONMENT="staging"` → pas d'exception.
- [ ] **Step 2: Vérifier l'échec** — `uv run pytest tests/unit/test_deployment_entrypoints.py -k secret -v` → FAIL.
- [ ] **Step 3: Implémenter** — dans la branche `!= "development"`, `raise` quand `ENVIRONMENT == "production"`, `logger.critical` sinon. Vérifier que `export_openapi.py` (`make generate-api` tourne avec `ENVIRONMENT=production`) n'entre pas dans `lifespan` ; s'il y entre, lui passer une clé factice dans la cible Makefile.
- [ ] **Step 4: Vérifier** — même commande + `make generate-api` + `make ci-fast` → PASS.
- [ ] **Step 5: Commit** — `fix(config): refuse to start production with the published SECRET_KEY`

---

### Task 10: Appareil partagé — une session terminée ne laisse pas son jeton

**Files:**
- Modify: `src/frontend/src/store/useSessionStore.ts:95-103` (`partialize`)
- Modify: `src/frontend/src/pages/PostSortPage.tsx` (écran de confirmation, autour de l. 120-135)
- Modify: `src/frontend/src/layouts/StudyLayout.tsx` (lien « recommencer » en cours de session) et `src/frontend/src/hooks/study/useResumeSession.ts:177-183` (`handleAlreadyCompleted`)
- Test: `src/frontend/src/store/useSessionStore.test.ts`, `src/frontend/src/pages/PostSortPage.test.tsx`, `src/frontend/src/layouts/StudyLayout.test.tsx`

**Interfaces:**
- Produces: quand `isCompleted` est vrai, `partialize` ne persiste que `{ studySlug, isCompleted, confirmationCode, language }` (pas de `token`, `resumeCode`, `hasConsented`, `maxReachedStep`) et le store de réponses est vidé (déjà fait par `finalizeCompletion → resetResponses`). En mémoire, la page de confirmation garde le jeton jusqu'au rechargement : le bouton d'effacement fonctionne pendant cette vie de page, puis est désactivé (`EraseMyDataDialog` gère déjà `sessionToken === null`).
- Le garde « soumission unique » (`StudyLayout.tsx:324-330`) continue de fonctionner (il ne lit que `isCompleted` et `studySlug`).
- Lien « Start a new session » (clé existante `welcome.restart`) vers `/study/:slug/reset` : sur l'écran de confirmation, et dans l'en-tête de `StudyLayout` quand `hasConsented && !isCompleted`.

- [ ] **Step 1: Tests qui échouent.**
  - `useSessionStore.test.ts` : `it('does not persist the session token once the session is completed')` — `setToken('t'); setConsent(true); completeSession('ABC')` ; lire `localStorage['qualis-session']` (ou la clé de la tâche 11 si exécutée avant) : `state.token === null`, `state.confirmationCode === 'ABC'`, `state.hasConsented === false`.
  - `PostSortPage.test.tsx` : `it('offers a new session link on the confirmation screen')` — lien `name: /start a new session/i` avec `href` `/study/<slug>/reset`.
  - `StudyLayout.test.tsx` : `it('shows the restart link during an unfinished session')`.
  - `useResumeSession` : `it('clears local answers when the resume code belongs to a completed session')` — 410 ⇒ `useResponseStore.getState().qsort` vide.
- [ ] **Step 2: Vérifier l'échec** — `cd src/frontend && npx vitest run src/store/useSessionStore.test.ts src/pages/PostSortPage.test.tsx src/layouts/StudyLayout.test.tsx src/hooks/study` → FAIL.
- [ ] **Step 3: Implémenter** comme décrit ; `handleAlreadyCompleted` appelle `useResponseStore.getState().resetResponses()` avant `completeSession`.
- [ ] **Step 4: Vérifier** — même commande + `npm run lint && npm run i18n-check` (aucune clé nouvelle) → PASS.
- [ ] **Step 5: Commit** — `fix(participant): stop persisting a finished session's token on shared devices`

---

### Task 11: Une clé de stockage par étude

**Files:**
- Modify: `src/frontend/src/store/safeStorage.ts` (nouveau stockage)
- Modify: `src/frontend/src/store/useSessionStore.ts:95-97`, `src/frontend/src/store/useResponseStore.ts:318-320`
- Test: `src/frontend/src/store/safeStorage.test.ts`

**Interfaces:**
- Produces: `export const studyScopedLocalStorage` (même type que `safeLocalStorage`, construit avec `createJSONStorage`) dont `getItem/setItem/removeItem(name)` opèrent sur `` `${name}:${slug}` `` où `slug` est extrait de `window.location.pathname` par `/^\/study\/([^/]+)/` ; hors route d'étude, la clé reste `name`. `getItem` lit la clé scopée puis, si absente, la clé héritée `name` **seulement si** son `state.studySlug` égale le slug courant (repli de migration).
- Consumes: `safeBrowserLocalStorage`.

- [ ] **Step 1: Tests qui échouent** (`safeStorage.test.ts`, `window.history.pushState` pour fixer le chemin) :
  - `it('isolates two studies')` : écrire sous `/study/a/presort`, lire sous `/study/b/presort` → `null`.
  - `it('falls back to the legacy key for the same study')` (Review Focus 4) : `localStorage['qualis-session'] = {state:{studySlug:'a', token:'t'}}`, chemin `/study/a/fine-sort` → `getItem('qualis-session')` renvoie ce state.
  - `it('ignores the legacy key of another study')`.
- [ ] **Step 2: Vérifier l'échec** — `npx vitest run src/store/safeStorage.test.ts` → FAIL.
- [ ] **Step 3: Implémenter** puis brancher `storage: studyScopedLocalStorage` dans les deux stores (les clés pilote `qualis-pilot-*` aussi). Vérifier que l'effet de nettoyage inter-études (`StudyLayout.tsx:153-157`) reste correct : il ne voit plus que la session de l'étude courante, il devient un no-op en pratique — le garder (cas de la clé héritée).
- [ ] **Step 4: Vérifier** — `npx vitest run src/store src/layouts src/pages` + `make ci-fast` → PASS.
- [ ] **Step 5: Commit** — `fix(participant): keep each study's local answers under its own storage key`

---

### Task 12: Brouillon hors-ligne renvoyé à la reconnexion

**Files:**
- Modify: `src/frontend/src/hooks/study/useDraftAutoSave.ts:50-125`
- Modify: `src/frontend/src/layouts/StudyLayout.tsx:695-700` (indicateur)
- Test: `src/frontend/src/hooks/study/useDraftAutoSave.test.ts` (créer s'il n'existe pas)

**Interfaces:**
- Produces: `useDraftAutoSave` enregistre un écouteur `online` qui, si le dernier envoi a échoué (`draftSaveStatus === 'error'` ou un drapeau `pendingRef`), envoie immédiatement le brouillon courant (même payload que `buildDraftPayload`) ; un écouteur `pagehide` réutilise `handleBeforeUnload` (Safari mobile). L'indicateur passe de `hidden sm:flex` à `flex` quand `draftSaveStatus === 'error'`.

- [ ] **Step 1: Tests qui échouent** : `it('resends the draft when the browser comes back online after a failed save')` (mutation mockée qui rejette puis résout ; `window.dispatchEvent(new Event('online'))` ; assert 2 appels, le second avec le dernier `qsort`) ; `it('flushes the draft on pagehide')` ; dans `StudyLayout.test.tsx`, `it('shows the save error indicator on small screens')`.
- [ ] **Step 2: Vérifier l'échec** — `npx vitest run src/hooks/study/useDraftAutoSave.test.ts` → FAIL.
- [ ] **Step 3: Implémenter** comme décrit (nettoyer les deux écouteurs dans le cleanup existant).
- [ ] **Step 4: Vérifier** — même commande + `npx vitest run src/layouts` → PASS.
- [ ] **Step 5: Commit** — `fix(participant): resend the draft after reconnecting and flush it on pagehide`

---

### Task 13: Le ping silencieux n'affiche plus d'erreur

**Files:**
- Modify: `src/frontend/src/hooks/useSubmitStudy.ts:245-252` (`runSubmission`)
- Test: `src/frontend/src/hooks/useSubmitStudy.test.ts`

**Interfaces:**
- Produces: `runSubmission(status, isCompletion, silent)` n'appelle `setError` que si `!silent` ; l'échec silencieux est seulement journalisé.

- [ ] **Step 1: Test qui échoue** — `it('keeps error null when a silent started ping fails')` : mutation rejetée, `submit('started', { silent: true })` ⇒ `result.current.error === null`.
- [ ] **Step 2: Vérifier l'échec** — `npx vitest run src/hooks/useSubmitStudy.test.ts` → FAIL.
- [ ] **Step 3: Implémenter** — garder `console.error`, conditionner `setError`.
- [ ] **Step 4: Vérifier** — même commande → PASS.
- [ ] **Step 5: Commit** — `fix(participant): a failed background ping no longer shows "Submission failed"`

---

### Task 14: Supprimer les méthodes-relais de `StudyService`

**Files:**
- Modify: `src/backend/app/services/study_service.py:1-15` (docstring), `:845-896` (suppression)
- Modify: `src/backend/app/routers/submissions.py:18,47`, `src/backend/app/routers/admin/exports.py:172,272,426`, `src/backend/app/schemas/responses.py:103` (docstring)
- Modify: tests qui appellent `StudyService.{record_consent,validate_distribution,process_submission,get_study_stats,get_study_full_dump}` (grep : `grep -rln "StudyService\.\(record_consent\|validate_distribution\|process_submission\|get_study_stats\|get_study_full_dump\)" src/backend/tests`)
- Modify: `CLAUDE.md` (ligne `app.services.study_service` du bloc strict : retirer la mention des proxies)

**Interfaces:**
- Consumes: `SubmissionService.process_submission`, `SubmissionService.validate_distribution`, `SubmissionService.record_consent`, `StudyDataService.get_study_full_dump`, `StudyDataService.get_study_stats`.

- [ ] **Step 1: Repointer** chaque appel de production et de test vers le service réel (mêmes arguments).
- [ ] **Step 2: Supprimer** le bloc l. 845-896 et la phrase de docstring sur la compatibilité.
- [ ] **Step 3: Vérifier** — `grep -rn "StudyService\.\(record_consent\|validate_distribution\|process_submission\|delete_audio_files_for_study\|reset_study_participants\|get_study_stats\|get_study_full_dump\|get_study_sort_data\)" src/backend` → aucun résultat ; `cd src/backend && uv run mypy app && uv run pytest tests -q` → PASS (mypy voit désormais les vrais types : corriger toute erreur révélée, c'est le but).
- [ ] **Step 4: Commit** — `refactor(services): call the real services instead of eight untyped StudyService relays`

---

### Task 15: Supprimer le code mort restant

**Files:**
- Delete: `src/backend/check_alembic.py`, `src/backend/check_db_schema.py`, `src/backend/check_db_tables.py`
- Modify: `src/backend/app/database.py:18-34` (bloc de normalisation d'URL supprimé ; `SQLALCHEMY_DATABASE_URL = cast(str, settings.DATABASE_URL)` reste)
- Modify: `src/backend/app/limiter.py:42-71` (`email_hash_key_func` async supprimée), `src/backend/vulture_whitelist.py:362`
- Test: `src/backend/tests/unit/test_db_isolation.py` ou nouveau test court dans `tests/unit/test_s3_config.py` voisin

- [ ] **Step 1: Test de non-régression d'abord** — `test_settings_normalise_database_url` : `Settings(DATABASE_URL="postgres://u:p@h/db?sslmode=require").DATABASE_URL == "postgresql+asyncpg://u:p@h/db"` ; idem pour `postgresql://`. Il doit **passer avant** la suppression (il prouve que `config.py` fait déjà le travail).
- [ ] **Step 2: Supprimer** les trois scripts, le bloc de `database.py`, `email_hash_key_func` et son entrée vulture. Re-grep de chaque nom sur tout l'arbre (`grep -rn "check_alembic\|check_db_schema\|check_db_tables\|email_hash_key_func\b" --exclude-dir=node_modules --exclude-dir=.trail .`) → seules les occurrences `_sync` restent.
- [ ] **Step 3: Vérifier** — `make ci-fast` puis `cd src/backend && uv run vulture app vulture_whitelist.py` (ou la cible `make check` qui l'appelle) → PASS.
- [ ] **Step 4: Commit** — `chore: delete orphan debug scripts, a duplicated URL normaliser and an unused key function`

---

### Task 16: Clôture

- [ ] **Step 1:** `make ci` → vert ; `make e2e` une fois (tâches 1, 2, 6, 10 touchent le parcours participant et l'invitation).
- [ ] **Step 2:** `trail check` → aucun conflit ; puis remplacer la learning du constat 1 : `trail note --replaces l-dda6a72a --title "Recruitment links are recorded at consent, where the participant row is created"` (sections Decided / Watch out : le champ `SubmissionInput.link_token` est ignoré ; `_recruitment_token` est préservé au submit).
- [ ] **Step 3:** CHANGELOG via release-please (messages conventionnels suffisent) ; noter dans la PR : invitations en attente à renvoyer (tâche 2), vérification `curl` post-déploiement (tâche 7), la page de confirmation perd le bouton d'effacement après rechargement (tâche 10, l'effacement reste possible par le chercheur).
