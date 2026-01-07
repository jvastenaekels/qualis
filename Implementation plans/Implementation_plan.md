Ce plan vise à consolider l'interface d'administration "Open-Q" en alignant la terminologie sur les standards de la méthodologie Q, en rectifiant des incohérences de navigation et de logique métier (verrouillage des structures), et en affinant l'expérience utilisateur (UX) pour réduire la charge cognitive et améliorer la gestion multilingue.

Voici le plan d'implémentation structuré pour l'intégration de ces modifications.

### 1. Rectification de la logique métier et du routage

Cette phase est prioritaire car elle touche à l'intégrité des données et à la stabilité de la navigation.

#### 1.1. Sécurisation de la structure de la grille

Actuellement, la modification structurelle semble permise lorsque l'étude est en pause, ce qui compromet l'intégrité des données si des participants ont déjà répondu.

- **Analyse :** Le frontend vérifie probablement uniquement l'état `active` pour le verrouillage, omettant l'état `paused`.
- **Action backend :** Vérifier dans `backend/app/services/study_service.py` que les endpoints de modification de la grille (ex: suppression de _statements_) rejettent les requêtes si l'étude a des soumissions associées, quel que soit l'état (actif ou pause).
- **Action frontend :** Dans les composants du concepteur (`frontend/src/components/admin/designer/`), étendre la condition `isReadOnly` pour inclure l'état `PAUSED`.

#### 1.2. Correction du routage "Design"

Le lien "Design" redirige de manière erratique vers l'interface de l'étude (participant) au lieu de l'interface d'administration.

- **Action :** Auditer `frontend/src/components/admin/AppSidebar.tsx` et le fichier de définition des routes (`frontend/src/AppRouter.tsx` ou `App.tsx`). Vérifier si un conflit d'URL existe entre `/study/:slug` (vue participant) et `/admin/study/:slug/design` (vue admin). Il est impératif de s'assurer que les routes administratives sont strictement préfixées ou priorisées dans l'ordre de déclaration du routeur.

### 2. Évolution fonctionnelle : gestion avancée des langues

Cette section traite de la demande complexe concernant le sélecteur de langue dans l'onglet "Design".

#### 2.1. Refonte du sélecteur de langue

- **Interface :** Remplacer le sélecteur actuel par le composant UI utilisé dans l'interface participant (probablement situé dans `frontend/src/components/ui/` ou `frontend/src/components/study/`).
- **Logique d'activation :** Ajouter un bouton d'édition adjacent au sélecteur. Ce bouton ouvrira une modale ou un _popover_ permettant de cocher/décocher les langues supportées par l'étude (parmi les langues disponibles qui sont celles de la localisation de l'UI).
- _Désactivation :_ Lorsqu'une langue est désactivée, les données de traduction (champs texte) doivent persister en base de données (ne pas effacer les chaînes), mais la langue ne doit plus être disponible ni visible dans le sélecteur dans l'interface participant, ainsi que dans le sélecteur dans l'interface administrateur (Design).
- _Activation :_ Lors de l'activation d'une nouvelle langue, une logique conditionnelle doit être implémentée :

1. Demander à l'utilisateur de choisir une "langue source" parmi celles déjà actives.
2. Copier les valeurs de la langue source vers la nouvelle langue comme valeurs par défaut (pour éviter les champs vides).
3. Afficher visuellement (via une icône ou un _tooltip_) que ces textes sont des copies nécessitant une traduction.

- **Fonctionnalité future :** Intégrer un bouton ou un lien désactivé (placeholder) pour la "Traduction automatique", signalant cette fonctionnalité comme étant à venir.

### 3. Refonte UX et ergonomie du "study designer"

L'objectif est d'optimiser l'espace écran et de réduire les frictions visuelles.

#### 3.1. Optimisation de l'espace de travail (layout)

Les défilements (scrolls) multiples nuisent à l'utilisabilité.

- **Action :** Réviser le CSS de `frontend/src/pages/admin/StudyDesignPage.tsx`. Il convient de réduire la largeur maximale du panneau principal (_main content area_) pour qu'il s'adapte mieux aux résolutions standard sans provoquer de défilement horizontal excessif. Utiliser des conteneurs _flexbox_ avec `overflow-y-auto` uniquement sur les zones de contenu interne nécessaires, et non sur la page entière.

#### 3.2. Révision du composant "Condition of Instruction"

- **Simplification :** Supprimer le cadre introductif redondant contenant le texte "The Condition of Instruction This is the most ...".
- **Style :** Modifier le fichier `frontend/src/components/admin/designer/ConditionOfInstructionEditor.tsx` (ou équivalent).
- Remplacer le fond gris par un bleu clair (ex: `bg-blue-50` en Tailwind).
- Assurer que la zone de saisie de texte contraste fortement (ex: `bg-white`, bordure subtile) pour guider l'attention de l'utilisateur.

#### 3.3. Désactivation du mode "Preview"

- **Action :** Masquer ou commenter le bouton et la logique associés au mode "Preview" dans la barre d'outils du concepteur, en attendant sa refactorisation ultérieure.
- **Action :** Ajouter une exception dans knip pour ce code mort.

### 4. Standardisation terminologique et localisation

Cette phase assure la cohérence sémantique avec la méthodologie Q et corrige les lacunes de traduction. Les modifications seront effectuées principalement dans `frontend/src/locales/fr.json` (et `en.json`, 'fi.json' pour la cohérence), ainsi que dans les composants codés en dur.

#### 4.1. Terminologie Méthodologique (Q-Methodology)

- "Test grandeur nature" (FR) ➔ "Tester l'étude" (FR).
- "Profil" (dans le contexte des étapes) (FR) ➔ "Pré-tri" (FR).
- "Classement Q" (FR) ➔ "Q-tri" (FR).
- "Statement set" (EN) ➔ "Q-set" (EN).
- "Jeu d'énoncés" (FR) ➔ "Jeu d'énoncés (Q-set)" (FR).

#### 4.2. Localisation des interfaces administratives

- **Page Analytics & Data :** Identifier tous les labels hardcodés (ex: "Participants", "Correlation matrix", "Factors") et les remplacer par des clés i18n (`t('analytics.xxx')`).
- **Section Export :** Renommer "File downloads" en "Export data" (ou "Export les données" en FR).
- **Page Research Team :** Localiser tous les éléments (rôles, boutons d'invitation).
- **Institutional Partners :** Localiser le titre et le bouton "Add Partner".
- **Zone Designer :** Localiser le texte "Statement & grid balance" et les indicateurs associés.

#### 4.3. Terminologie Interface

- "Recherche bêta" ➔ "Bêta".
- "Conseil de marque" ➔ "Conseil de personnalisation".

### 5. Nettoyage et optimisation visuelle globale

Cette phase finale vise à "polir" l'interface pour un rendu professionnel.

#### 5.1. Suppression des redondances

- **Sidebar/Navigation :** Supprimer le label "Gestion" situé au-dessus du menu s'il n'apporte pas de distinction structurelle nécessaire.
- **Tableau de bord :** Retirer l'indicateur situé à côté du titre "Tableau de bord" s'il fait double emploi avec le fil d'Ariane ou le titre lui-même.
- **Actions :** Supprimer le bouton/lien "Modifier la conception" s'il est redondant avec l'accès via la sidebar.

#### 5.2. Amélioration des contrastes

- **Action :** Auditer les fichiers CSS globaux (`frontend/src/index.css`) et la configuration Tailwind (`frontend/tailwind.config.js`).
- Assombrir les gris trop clairs (ex: passer de `text-gray-400` à `text-gray-600`) pour assurer la lisibilité et l'accessibilité (conformité WCAG).
- Vérifier spécifiquement l'onglet "Export data" (anciennement File downloads) signalé comme peu visible : lui appliquer un style d'onglet actif/inactif plus marqué.
- Donner un look plus moderne aux boutons de navigation en haut de page.
- Donner un look plus moderne, plus coloré (tout en restant professionnel), et plus apaisant à l'UI d'administration de manière générale.
