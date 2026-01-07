L'analyse du fichier `frontend/package.json` confirme la présence simultanée de dépendances lourdes orientées "administration" (ex: `recharts`, `react-table`) et de cœurs réactifs critiques pour le participant (`framer-motion`, `dnd-kit`). Cette architecture monolithique valide l'urgence d'une stratégie de découplage pour garantir la performance côté participant.

Voici le plan d'optimisation révisé et ciblé en fonction des dépendances identifiées :

### 1. Ségrégation chirurgicale des routes (Priorité Absolue)

Le `package.json` révèle des bibliothèques qui n'ont aucune utilité pour un participant effectuant un Q-sort. Il faut empêcher leur chargement sur les routes `/study/:slug`.

- **Cibles d'exclusion (Chunk Admin) :**
- `recharts` (^3.6.0) : Bibliothèque de visualisation de données très lourde.
- `@tanstack/react-table` (^8.21.3) : Gestionnaire de tableaux complexes.
- `qrcode.react` (^4.2.0) : Génération de QR codes (usage probable en recrutement/admin).
- `jscpd`, `knip` (DevDependencies) : Ne seront pas dans le build de prod, donc hors sujet ici.

- **Action Technique (`AppRouter.tsx`) :**
  Maintenir le cap sur le `React.lazy` pour toutes les pages sous `/admin/*`. Cela garantira que `recharts` et consorts restent dans un fichier JS séparé (ex: `assets/AdminLayout-xxxx.js`) qui n'est jamais demandé par le navigateur d'un participant.

### 2. Stratégie de "Chunking" Vite v7 (`vite.config.ts`)

Avec Vite 7, l'algorithme de découpage par défaut est performant, mais nous pouvons le guider pour isoler les "poids lourds" identifiés.

**Configuration proposée :**

```typescript
// frontend/vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: (id) => {
        // 1. Isolation du framework (Cache longue durée)
        if (id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router')) {
          return 'vendor-react';
        }

        // 2. Isolation des graphiques (Admin uniquement)
        if (id.includes('node_modules/recharts')) {
          return 'vendor-charts';
        }

        // 3. Isolation de l'animation/DnD (Lourd mais nécessaire au participant)
        // On les regroupe pour éviter trop de petites requêtes HTTP
        if (id.includes('node_modules/framer-motion') ||
            id.includes('node_modules/@dnd-kit')) {
          return 'vendor-interactive';
        }

        // 4. Isolation de l'UI Kit
        if (id.includes('node_modules/@radix-ui') ||
            id.includes('node_modules/lucide-react')) {
          return 'vendor-ui';
        }
      },
    },
  },
}

```

### 3. Optimisation spécifique : `framer-motion` et `lucide-react`

Ces deux librairies sont utilisées dans l'interface participant.

- **Framer Motion (`^12.23.26`) :**
- _Problème :_ C'est une bibliothèque volumineuse.
- _Optimisation :_ Utiliser la fonctionnalité `LazyMotion` de Framer Motion. Cela permet de ne charger les capacités d'animation que lors du premier rendu, réduisant le temps de "parsing" initial du JS.
- _Implémentation :_ Envelopper l'application (ou `StudyLayout`) avec `<LazyMotion features={domAnimation}>`.

- **Lucide React (`^0.562.0`) :**
- _Problème :_ Pour votre nouvelle fonctionnalité "Process Steps" où l'utilisateur choisit une icône, il ne faut surtout pas charger les ~1000 icônes de la librairie.
- _Optimisation :_ Utiliser l'import dynamique de React (`React.lazy`) pour charger l'icône spécifique demandée par la configuration, ou créer un "mapper" manuel qui n'importe que les 40-50 icônes que vous aurez whitelistées dans l'éditeur.

### 4. Internationalisation (`i18next`)

Le fichier `fr.json` et `en.json` sont présents.

- **Action :** Vérifier la configuration `i18n.ts`. Assurez-vous que les fichiers de traduction sont chargés via `i18next-http-backend` (chargement asynchrone des fichiers JSON) plutôt que d'être importés statiquement (`import fr from './locales/fr.json'`). L'import statique inclut _toutes_ les langues dans le bundle principal, ce qui est inutile.

### Résumé du plan d'action mis à jour

1. **Immédiat :** Appliquer le `React.lazy` sur les routes Admin dans `AppRouter.tsx`.
2. **Configuration :** Mettre à jour `vite.config.ts` avec les `manualChunks` ci-dessus.
3. **Refactor :** Modifier `i18n.ts` pour charger les JSON via réseau (si ce n'est pas déjà le cas).
4. **Feature :** Pour les "Process Steps", coder le composant d'icône pour qu'il soit léger (mapping restreint).
