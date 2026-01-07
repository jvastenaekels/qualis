L'implémentation du cycle de vie complet des "workspaces" (espaces de travail) marque la transition d'Open-Q vers une architecture multi-tenant logique, nécessitant une isolation stricte des données (études, participants) et une gestion granulaire des permissions (RBAC) au sein de chaque entité.

Voici le plan d'action structuré pour une implémentation rigoureuse et sécurisée.

### 1. Architecture backend et intégrité des données

Cette phase vise à garantir que chaque ressource est correctement rattachée à un espace de travail et que les contraintes de clés étrangères sont respectées.

#### 1.1. Consolidation du modèle de données (`backend/app/models.py`)

- **Entité Workspace :** S'assurer que le modèle supporte non seulement le nom, mais aussi les métadonnées de configuration (ex: branding par défaut).
- **Entité WorkspaceMember :** Vérifier la table de liaison `user_workspace`. Elle doit inclure le champ `role` (ex: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`) pour la gestion des droits.
- **Migration des données existantes :**
- Créer un script de migration (`alembic`) pour générer un "Default Workspace" si aucun n'existe.
- Rattacher toutes les études orphelines et les utilisateurs existants à ce workspace par défaut pour éviter toute perte d'accès.
- Rendre la colonne `workspace_id` non-nullable (obligatoire) sur la table `studies` après la migration.

#### 1.2. Logique d'isolation (Service Layer)

C'est le point critique de sécurité. Le code ne doit jamais filtrer les données "au cas par cas" mais de manière systémique.

- **Middleware de contexte :** Dans `backend/app/dependencies.py`, implémenter une dépendance `get_current_workspace` qui :

1. Vérifie le header ou le paramètre de route (ex: `X-Workspace-ID`).
2. Valide que l'utilisateur courant est membre de ce workspace.
3. Lève une `403 Forbidden` si l'accès est refusé.

- **Refonte de `StudyService` :** Modifier toutes les méthodes de récupération (`get_all`, `create`, `stats`) pour qu'elles acceptent obligatoirement un `workspace_id` et filtrent les requêtes SQL (`session.query(Study).filter_by(workspace_id=ws_id)`).

### 2. Développement des API (Endpoints)

Mise à jour et création des routes dans `backend/app/routers/admin/workspaces.py` et `users.py`.

#### 2.1. Gestion du cycle de vie (CRUD Workspace)

- `POST /workspaces` : Création d'un nouvel espace. Doit automatiquement assigner le créateur comme `OWNER`.
- `PUT /workspaces/{id}` : Modification (nom, slug).
- `DELETE /workspaces/{id}` : Suppression (avec vérification stricte : impossible si des études sont actives, ou implémentation d'un "soft delete").

#### 2.2. Gestion des membres et invitations

- `GET /workspaces/{id}/members` : Lister les utilisateurs et leurs rôles.
- `POST /workspaces/{id}/invitations` : Envoyer un email d'invitation spécifique à ce workspace.
- `PATCH /workspaces/{id}/members/{user_id}` : Modifier un rôle (promotion/rétrogradation).
- `DELETE /workspaces/{id}/members/{user_id}` : Révocation d'accès.

### 3. Refonte de l'infrastructure frontend

Le frontend doit devenir "conscient" du workspace actif à tout moment.

#### 3.1. Gestion de l'état global (`store`)

- Modifier `frontend/src/store/useSessionStore.ts` (ou créer `useWorkspaceStore.ts`) pour stocker :
- `workspaces`: La liste des espaces disponibles pour l'utilisateur.
- `currentWorkspace`: L'objet workspace actif.

- Persister le `currentWorkspaceId` dans le `localStorage` pour maintenir le contexte après un rafraîchissement (F5).

#### 3.2. Routage et navigation (`AppRouter.tsx`)

- **Option recommandée :** Préfixer les routes d'administration par l'ID du workspace pour permettre le partage de liens profonds (Deep Linking).
- Exemple : `/admin/w/:workspaceId/dashboard`, `/admin/w/:workspaceId/studies`.

- Mettre à jour le composant `WorkspaceSwitcher` (`frontend/src/components/admin/WorkspaceSwitcher.tsx`) pour qu'il redirige vers l'URL correspondante lors du changement d'espace, plutôt que de simplement changer un état en mémoire.

### 4. Interface utilisateur (UI/UX)

Implémentation des écrans de gestion dans le dossier `frontend/src/pages/admin/`.

#### 4.1. Page de paramètres du workspace

- Créer/Mettre à jour `WorkspaceSettingsPage.tsx`.
- Intégrer les formulaires pour renommer l'espace.
- Ajouter une section "Danger Zone" pour la suppression ou l'archivage du workspace (visible uniquement pour les rôles `OWNER`).

#### 4.2. Page de gestion d'équipe ("Team Management")

- Refondre `TeamManagementPage.tsx` pour qu'elle affiche les membres du workspace _courant_ et non tous les utilisateurs de la plateforme.
- Intégrer la modale d'invitation en passant le `workspace_id` dans la payload de l'API.
- Afficher des badges de rôles (Admin, Membre) clairs à côté de chaque utilisateur.

### 5. Intégration transversale

#### 5.1. Dashboard et listes d'études

- Le `AdminDashboard` et la `StudyOverviewPage` doivent réagir immédiatement au changement de workspace.
- Si l'utilisateur change de workspace via le `WorkspaceSwitcher` dans la sidebar, une invalidation des requêtes `React Query` (`queryClient.invalidateQueries(['studies'])`) doit être déclenchée pour rafraîchir la liste des études.

#### 5.2. Localisation (i18n)

- S'assurer que tous les termes (Espace de travail, Membres, Rôles, Invitations) sont ajoutés dans `fr.json` et `en.json`.
- Traduire les messages de feedback (ex: "Invitation envoyée", "Workspace créé avec succès").

### Résumé des priorités techniques

1. **Priorité 1 (Backend/Sécurité) :** Mettre en place le filtrage par `workspace_id` dans toutes les requêtes SQL des études. Tant que ceci n'est pas fait, il y a un risque de fuite de données entre clients.
2. **Priorité 2 (Migration) :** Assurer que les données existantes ne sont pas perdues lors du déploiement.
3. **Priorité 3 (Frontend) :** Mettre en place le sélecteur de workspace dans la sidebar et la gestion de l'état global.
