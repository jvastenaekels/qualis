# Création et gestion des utilisateurs — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un superuser crée un compte depuis l'interface par un lien d'invitation, sans jamais connaître le mot de passe de la personne, puis ferme l'inscription publique de l'API en production.

**Architecture:** Le jeton d'invitation existant sert aussi aux invitations sans projet : `create_invitation_token` accepte déjà l'absence de `project_id`. `/api/register` consomme désormais le `jti` de toute invitation, et `RegistrationPage` gagne une variante sans projet. La suppression d'un utilisateur est refusée s'il possède un projet. Aucune migration de schéma.

**Tech Stack:** FastAPI, SQLAlchemy async, pytest-asyncio (`uv run pytest`) ; React 19, TanStack Query, client généré (`make generate-api`), Vitest.

**Spec:** les constats ci-dessous, tous vérifiés dans le code le 2026-11-04 à l'occasion de la création du compte d'Olli Hacklin. La learning `.trail/learnings/2026-11-04-on-prod-create-an-account-through-julien.md` documente le constat 1.

| # | Constat | Preuve | Tâche |
|---|---|---|---|
| 1 | `create_user.py` poste sur une route qui n'existe pas ; deux documents le recommandent | `scripts/create_user.py`, `routers/admin/users.py` sans `POST ""`, `docs/guides/running-without-smtp.md:48`, `scripts/README.md:31` | 5 |
| 2 | Aucun moyen dans l'interface de créer un compte hors d'un projet : seule l'invitation d'un Owner existe, et un superuser n'est Owner que de ses projets | `routers/admin/projects.py:458` | 1, 2 |
| 3 | L'interface exige un jeton, l'API non : `POST /api/register` sans jeton crée en prod un compte actif sans vérifier l'adresse, et ce compte peut créer projets et études sans limite | `RegistrationPage.tsx:102`, `routers/auth.py:254`, `/api/config` = `manual`, `create_project` | 6 |
| 4 | Faute de mieux, l'admin choisit le mot de passe et le transmet par e-mail | création du compte du 2026-11-04 | 1, 2 |
| 5 | La page d'inscription lit `workspace_name`, l'API renvoie `project_name` : le nom du projet s'affiche vide pour toute invitation | `RegistrationPage.tsx:47`, `routers/admin/invitations.py` | 3 |
| 6 | La page d'inscription ne demande pas de nom : l'admin ne voit qu'une adresse | `RegistrationPage.tsx:62` | 3 |
| 7 | Supprimer l'Owner d'un projet laisse un projet sans Owner : `project_members` part en cascade, `delete_user` ne contrôle rien, et `list_projects` ne montre à un superuser que ses propres projets. Études et données participant deviennent inaccessibles depuis l'interface | `models/project.py:77`, `routers/admin/users.py:263`, `routers/admin/projects.py:39` | 4 |
| 8 | `delete_user` n'a aucun test | `tests/integration/test_admin*.py` | 4 |
| 10 | Un compte sans projet tombe sur « Access denied » à la connexion : `RequireAdmin` bloque aussi `/hub` et `/app/projects/new`, alors que l'API autorise tout compte actif à créer un projet. Trouvé en cours d'exécution ; sans correction, les invitations de compte mènent à une impasse | `components/auth/RequireAdmin.tsx`, `App.tsx:161,294-302`, `create_project` | 7 |
| 11 | Un compte existant invité à un projet reçoit un faux succès et ne rejoint pas le projet : `/api/admin/invitations/accept` n'a aucun appelant côté interface, alors que `admin-management.md` promet l'accès immédiat | `RegistrationPage.tsx`, `routers/admin/invitations.py`, relecture finale | 8 |
| 9 | `CLAUDE.md` et `pyproject.toml` déclarent `app.services.quotas`, un module absent | `pyproject.toml:361-363` | 5 |

## Décisions

- **D1 — pas de `must_change_password`.** La personne choisit son mot de passe via le lien, donc aucun mot de passe temporaire n'existe plus.
- **D2 — `ALLOW_PUBLIC_REGISTRATION` garde son défaut `True`.** Le test e2e `src/frontend/e2e/integration/auth-email.spec.ts` s'en sert et `docs/guides/deployment.md` documente ce défaut. Seule la prod change, par variable d'environnement (tâche 6).
- **D3 — refuser plutôt que transférer.** La suppression d'un Owner est refusée ; désactiver le compte reste possible. `OWNER_ROLE_IMMUTABLE` interdit de toute façon le transfert aujourd'hui.

**Hors périmètre, à reprendre au premier besoin réel :** transfert de propriété d'un projet ; table des invitations (liste, révocation : les jetons sont sans état, donc « renvoyer les invitations en attente » reste impossible à outiller) ; colonne `users.created_at` (migration) ; quotas ; protection du compte de démo partagé, dont n'importe qui peut changer le mot de passe via `/api/me/password` ; pagination au-delà de 100 utilisateurs.

## Global Constraints

- `app.routers.admin.users`, `app.services.admin_user_service`, `app.utils.email` restent sous leur niveau mypy strict actuel.
- Nouvelle chaîne affichée : `t('clé', 'Fallback')`. Les clés vont dans `src/frontend/public/locales/en/admin.json` (`auth.*` et `admin.users.*` vivent dans `admin.json`). Parité admin : best-effort.
- Aucun jeton ni mot de passe dans les journaux ou `log_admin_action`.
- Pas de migration Alembic.
- `make ci-fast` entre chaque tâche, `make ci` avant tout push. Un push sur `main` est un déploiement en production.

## Review Focus

1. **Adresse déjà inscrite quand la personne clique sur le lien.** `register_user` passe par la branche doublon et répond comme un succès ; le mot de passe du compte existant ne doit pas changer (test en tâche 1).
2. **Rejeu d'un lien après suppression du compte.** Le rejeu doit répondre `invitation_already_used`, or aujourd'hui le `jti` n'est consommé que si le jeton porte un projet (test en tâche 1).
3. **Casse de l'adresse.** `user_by_email` compare exactement : `Olli@x.fi` et `olli@x.fi` feraient deux comptes. L'invitation normalise en minuscules et refuse sans tenir compte de la casse (test en tâche 1).
4. **Instance sans SMTP.** `_send_or_log` écrit le corps du message dans les journaux, lien compris. Sans SMTP, le superuser a déjà le lien dans la réponse : ne rien envoyer (test en tâche 1).
5. **Utilisateur simple Member d'un projet.** Sa suppression doit rester possible ; seul l'Owner bloque (test en tâche 4).

---

### Task 1: Invitation de compte côté API

**Files:**
- Modify: `src/backend/app/routers/admin/users.py`, `src/backend/app/schemas/users.py`, `src/backend/app/utils/email.py`, `src/backend/app/routers/auth.py` (bloc « 5. Process invitation »), `src/backend/app/routers/admin/invitations.py` (`verify_invitation`), `src/backend/vulture_whitelist.py`
- Generated: `src/frontend/src/api/**` via `make generate-api`
- Test: `src/backend/tests/integration/test_account_invitation.py`

**Interfaces:**
- Produces: `POST /api/admin/users/invitations`, corps `AccountInvitationCreate{email: EmailStr}`, réponse 201 `AccountInvitationLink{invite_url: str, expires_at: datetime}`, superuser seul. `GET /api/admin/invitations/verify` renvoie `project_id: null, project_name: null` pour une invitation sans projet.

- [ ] **Step 1: Écrire les tests qui échouent**, avec les fixtures de `tests/integration/test_admin_user_guards.py` :

```python
test_superuser_invites_and_invitee_registers    # 201 ; /api/register avec le jeton ; /api/token 200 ; aucune ligne ProjectMember
test_invitation_requires_superuser              # 403
test_invitation_refuses_registered_email_any_case  # compte a@x.fi, invitation A@X.FI -> 409 "email_already_registered"
test_invitation_lowercases_email                # sub du jeton == adresse en minuscules
test_register_works_when_public_registration_closed  # ALLOW_PUBLIC_REGISTRATION=False -> 201
test_replay_after_account_deletion_is_refused   # inscrire, supprimer la ligne, rejouer -> 400 "invitation_already_used"
test_existing_account_password_unchanged        # compte créé après l'invitation ; register -> ancien mot de passe valide, nouveau refusé
test_accept_refuses_account_invitation          # /api/admin/invitations/accept -> 400
test_verify_reports_no_project                  # project_id None, project_name None
test_no_email_and_no_token_in_logs_without_smtp # caplog ne contient pas le jeton ; send_account_invitation_email non appelé
test_email_sent_when_smtp_configured            # tâche de fond planifiée
```

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/backend && uv run pytest tests/integration/test_account_invitation.py -v`. Expected: FAIL, route absente (405 ou 404).

- [ ] **Step 3: Implémenter.**
  - `create_account_invitation(request, invitation_in: AccountInvitationCreate, background_tasks: BackgroundTasks, db, current_user = Depends(check_superuser)) -> AccountInvitationLink`, déclaré avant les routes `/{user_id}`, `@limiter.limit("30/minute")`. Recherche par `func.lower(User.email)`. Jeton : `create_invitation_token(email=<minuscules>, role="member", expires_delta=timedelta(days=7))`. URL : `f"{settings.FRONTEND_URL}/register?token={token}"`. Envoi seulement si `settings.is_smtp_configured`. Audit : `log_admin_action(action="invite", resource="user", target_email=...)`.
  - `send_account_invitation_email(email_to: str, invite_url: str) -> None` dans `utils/email.py`, via `_send_or_log`, sujet `Your Qualis account`.
  - `register_user` : sortir `mark_jti_consumed` du `if invitation_project_id` pour qu'il s'applique à tout `invitation_payload`, dans le même `try` et avant le `commit`.
  - `verify_invitation` : `project_name = None` sans `project_id` ; `"Unknown Project"` seulement si le projet a disparu.
  - `vulture_whitelist.py` : remplacer `create_user` (`# admin/users.py`) par `create_account_invitation`.

- [ ] **Step 4: Vérifier.** Run: `cd src/backend && uv run pytest tests/integration/test_account_invitation.py tests/integration/test_invitation_single_use.py tests/integration/test_auth.py -v`. Expected: PASS.

- [ ] **Step 5: Régénérer le client.** Run: `make generate-api && make check-api`. Expected: client à jour.

- [ ] **Step 6: Commit** — `feat(admin): invite a researcher without a project`.

### Task 2: Inviter depuis la page Users

**Files:**
- Create: `src/frontend/src/components/admin/InviteUserDialog.tsx`, `src/frontend/src/components/admin/InviteUserDialog.test.tsx`
- Modify: `src/frontend/src/hooks/admin/useAdminUsersPage.ts`, `src/frontend/src/hooks/admin/useAdminUsersPage.test.ts`, `src/frontend/src/pages/admin/AdminUsersPage.tsx`, `src/frontend/public/locales/en/admin.json`

**Interfaces:**
- Consumes: le hook généré pour `POST /api/admin/users/invitations`.
- Produces: `actions.invite(email: string): Promise<string>` (renvoie `invite_url`, invalide la liste) ; `InviteUserDialog` avec props `{ open: boolean; onOpenChange: (open: boolean) => void; onInvite: (email: string) => Promise<string>; isEmailManual: boolean }`.

- [ ] **Step 1: Écrire les tests qui échouent.** Hook : `invite` renvoie `invite_url`. Dialogue : `shows the link and copy button after inviting`, `says the link must be sent by hand when isEmailManual`, `says an email was sent otherwise`, `keeps the dialog open and shows the error on 409`, `refuses an invalid address without calling onInvite`.

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/frontend && npx vitest run src/components/admin/InviteUserDialog.test.tsx src/hooks/admin/useAdminUsersPage.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implémenter.** Bouton **Invite user** dans `StudyPageHeader`. Le dialogue reprend la validation d'adresse et le bloc lien + copie déjà présents dans `AdminUsersPage.tsx` (dialogues `set_email_dialog` et `recovery_link`). Erreurs via `readMutationError`. Clés : `admin.users.invite_dialog.{title,label,submit,link_manual,link_sent,copy}` ; texte de `link_manual` : `Send this link to the person yourself. It works once and expires in 7 days.`

- [ ] **Step 4: Vérifier.** Même commande, puis `npm run i18n-check`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(admin): invite user from the Users page`.

### Task 3: Page d'inscription

**Files:**
- Create: `src/frontend/src/pages/RegistrationPage.test.tsx`
- Modify: `src/frontend/src/pages/RegistrationPage.tsx`, `src/frontend/public/locales/en/admin.json`

**Interfaces:**
- Consumes: la réponse `verify` de la tâche 1, typée `{ email: string; project_id: number | null; project_name: string | null; role: string }`.

- [ ] **Step 1: Écrire les tests qui échouent.** `shows the project name on a project invitation` (constat 5) ; `hides the project box and role on an account invitation` ; `uses the account wording on an account invitation` (`subtitle_account`, `success_desc_account`, pas de `privacy_hint`) ; `sends full_name when filled` ; `omits full_name when empty`.

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/frontend && npx vitest run src/pages/RegistrationPage.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implémenter.** Remplacer `workspace_name` par `project_name`. Ajouter le champ optionnel `full_name`, envoyé dans le corps de `registerUserApiRegisterPost`. Retirer `admin.project.switcher.new_project_desc`, sans rapport avec cet écran. Clés : `auth.register.subtitle_account` = `Create your researcher account`, `auth.register.success_desc_account` = `Your account is ready.`, `auth.register.full_name_label` = `Full name (optional)`.

- [ ] **Step 4: Vérifier.** Même commande. Expected: PASS.

- [ ] **Step 5: Commit** — `fix(auth): show the project on invitations, add the account variant and a name field`.

### Task 4: Ne pas orpheliner un projet

**Files:**
- Modify: `src/backend/app/services/admin_user_service.py`, `src/backend/app/routers/admin/users.py` (`delete_user`), `docs/guides/admin-management.md`
- Test: `src/backend/tests/integration/test_admin_user_guards.py`

**Interfaces:**
- Produces: `async def assert_can_delete(*, db: AsyncSession, target: User) -> None`, qui lève `AdminUserError`. Le routeur répond 400 avec `detail=str(e)`, comme `patch_user`. L'interface affiche déjà `mutationError`.

- [ ] **Step 1: Écrire les tests qui échouent.** `test_delete_user_succeeds`, `test_delete_refuses_self`, `test_delete_403_for_non_superuser`, `test_delete_refuses_project_owner` (400, `detail` contient chaque slug possédé, ligne toujours présente), `test_delete_allows_plain_member` (ligne supprimée, projet intact avec son Owner).

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/backend && uv run pytest tests/integration/test_admin_user_guards.py -k delete -v`. Expected: `test_delete_refuses_project_owner` FAIL, les autres PASS.

- [ ] **Step 3: Implémenter `assert_can_delete`.** Message : `User owns project(s): <slugs>. Delete those projects or deactivate the account instead.`

- [ ] **Step 4: Vérifier.** Même commande. Expected: PASS.

- [ ] **Step 5: Documenter** dans `admin-management.md` : en fin de collaboration, désactiver plutôt que supprimer.

- [ ] **Step 6: Commit** — `fix(admin): refuse to delete a project owner`.

### Task 5: Retirer ce qui ne marche pas

**Files:**
- Delete: `src/backend/scripts/create_user.py`
- Modify: `docs/guides/running-without-smtp.md`, `src/backend/scripts/README.md`, `docs/guides/admin-management.md`, `src/backend/pyproject.toml:360-367`, `CLAUDE.md`

- [ ] **Step 1: Supprimer le script** et sa ligne dans `scripts/README.md`.

- [ ] **Step 2: Réécrire « Recovering the last superuser ».** Sans superuser fonctionnel, le bloc Python direct en base est le seul chemin, quel que soit le cas ; retirer la branche `create_user.py`. Avec un autre superuser disponible, il utilise **Reset 2FA**.

- [ ] **Step 3: Ajouter « Create an account »** en tête de `admin-management.md` : **Admin → Users → Invite user**, lien à usage unique valable 7 jours, la personne choisit son mot de passe. Dans la matrice de `running-without-smtp.md`, ligne **Registration** : le lien s'affiche, l'admin l'envoie.

- [ ] **Step 4: Retirer l'override `app.services.quotas`** de `pyproject.toml` et la ligne correspondante de `CLAUDE.md`, en corrigeant le total de modules.

- [ ] **Step 5: Vérifier.** Run: `grep -rn "create_user.py\|services.quotas" docs CLAUDE.md src/backend/scripts src/backend/pyproject.toml | grep -v "docs/superpowers\|docs/audits"`. Expected: aucune ligne. Puis `make ci`. Expected: PASS.

- [ ] **Step 6: Commit** — `chore: remove the dead create_user script and the quotas override`.

### Task 7: Ouvrir le hub aux comptes sans projet

**Files:**
- Create: `src/frontend/src/components/auth/RequireAdmin.test.tsx`
- Modify: `src/frontend/src/components/auth/RequireAdmin.tsx`, `docs/guides/admin-management.md`

- [ ] **Step 1: Écrire les tests qui échouent.** `shows the hub to a user without a project`, `shows /app/projects/new to a user without a project`, `denies a project page to a user without a project`, `redirects an anonymous visitor to login`, `lets a project member through`.

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/frontend && npx vitest run src/components/auth/RequireAdmin.test.tsx`. Expected: FAIL sur les deux premiers.

- [ ] **Step 3: Implémenter.** Dans `RequireAdmin`, accorder l'accès à un compte authentifié sans projet quand `location.pathname` vaut `/hub` ou `/app/projects/new`. Le reste de la garde ne change pas.

- [ ] **Step 4: Vérifier.** Même commande. Expected: PASS. Puis contrôler que `ResearcherHub` affiche `New project` à un compte sans projet.

- [ ] **Step 5: Documenter** dans `admin-management.md` : un compte invité arrive sur le hub et crée son projet.

- [ ] **Step 6: Commit** — `fix(auth): let an account without a project reach the hub`.

### Task 8: Rejoindre un projet avec un compte existant

**Files:**
- Modify: `src/frontend/src/pages/RegistrationPage.tsx`, `src/frontend/src/pages/RegistrationPage.test.tsx`, `src/frontend/public/locales/en/admin.json`, `docs/guides/admin-management.md:48`

**Interfaces:**
- Consumes: `POST /api/admin/invitations/accept`, corps `{ token }` ; 403 si le jeton vise une autre adresse, 400 s'il est expiré ou déjà utilisé. `useAuth()` donne `isAuthenticated` et `user`.

Comportement, sur une invitation **à un projet** uniquement (`project_id` non nul) :
- **Personne non connectée :** sous le formulaire, le lien `Already have an account? Sign in` mène à `/login?redirect=<encodeURIComponent('/register?token=…')>`.
- **Personne connectée :** le formulaire disparaît. La page montre le projet, le rôle et le bouton `Join project`, qui appelle `accept`, invalide la liste des projets, puis navigue vers `/hub`.
- **Invitation de compte :** rien ne change.

- [ ] **Step 1: Écrire les tests qui échouent.** `offers sign-in on a project invitation`, avec l'URL exacte du lien ; `does not offer sign-in on an account invitation` ; `shows Join project instead of the form when signed in` ; `joining calls accept with the token and goes to the hub` ; `joining refreshes the project list` ; `shows the wrong-account message on 403 and stays on the page` ; `shows the invalid-link screen on 400`.

- [ ] **Step 2: Vérifier l'échec.** Run: `cd src/frontend && npx vitest run src/pages/RegistrationPage.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implémenter.** Utiliser le client généré pour `accept`. Vérifier dans `LoginPage.tsx` que `redirect` garde bien le paramètre `token` et refuse une URL externe ; si elle l'accepte, le signaler. Clés dans `auth.register` : `have_account` = `Already have an account? Sign in`, `join_project` = `Join project`, `wrong_account` = `This invitation was sent to another address. Sign out, then open the link again.`

- [ ] **Step 4: Corriger `admin-management.md:48`** : une personne déjà inscrite se connecte depuis le lien, puis clique sur **Join project**.

- [ ] **Step 5: Vérifier.** Même commande, puis `npm run i18n-check`. Expected: PASS.

- [ ] **Step 6: Commit** — `feat(auth): let an existing account join a project from its invitation`.

### Task 6: Fermer l'inscription publique en production

**Requiert l'accord explicite de Julien :** cette tâche suit un déploiement et modifie la production.

- [ ] **Step 1: Déployer** les tâches 1 à 5, 7 et 8, puis contrôler `scalingo --app qualis ps` et `/health` : `scalingo deployments` peut dire `success` avec `web-1` en panne.

- [ ] **Step 2: Fermer.** Run: `scalingo --app qualis env-set ALLOW_PUBLIC_REGISTRATION=false && scalingo --app qualis restart`. `env-set` seul ne redémarre pas l'application.

- [ ] **Step 3: Vérifier.** `POST /api/register` sans jeton, avec une adresse jetable : Expected 403. Depuis **Admin → Users**, inviter une adresse de test et s'inscrire : Expected connexion réussie. Supprimer ensuite ce compte de test.
