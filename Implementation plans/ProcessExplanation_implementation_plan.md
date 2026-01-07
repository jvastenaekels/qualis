Cette intervention détaille l'architecture technique nécessaire pour rendre l'explication du processus de l'étude (actuellement statique) entièrement configurable, dynamique et réordonnable, tout en assurant une rétrocompatibilité par l'injection d'un contenu par défaut lors de la création d'une nouvelle étude.

Voici le plan d'action structuré pour ce refactor.

### 1. Modélisation des données et persistance (backend)

L'objectif est d'intégrer une liste structurée d'objets dans la configuration JSON existante de l'étude (`study_config`).

#### 1.1. Définition du schéma Pydantic (`backend/app/schemas.py`)

Il convient de définir un modèle strict pour valider la structure de chaque étape.

```python
from pydantic import BaseModel, Field
from typing import List
import uuid

class ProcessStep(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Identifiant unique pour le drag-and-drop")
    title: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., max_length=300)
    icon: str = Field(..., description="Nom de l'icône Lucide (ex: 'BookOpen', 'MousePointer')")

# Mise à jour du modèle StudyCreate et StudyConfig
class StudyConfig(BaseModel):
    # ... champs existants
    process_steps: List[ProcessStep] = Field(default_factory=list)

```

#### 1.2. Injection des données par défaut (`backend/app/services/study_service.py`)

Lors de la création d'une étude, si le champ `process_steps` n'est pas fourni, le système doit injecter la structure standard actuelle pour éviter une configuration vide.

- **Action :** Créer une constante `DEFAULT_PROCESS_STEPS` contenant les objets JSON correspondant au processus actuel (Accueil, Consentement, Tri, Questions, etc.).
- **Implémentation :** Dans la méthode `create_study`, assigner cette constante si `config.process_steps` est vide.

### 2. Architecture frontend et gestion d'état

Le frontend doit être capable de manipuler l'ordre des étapes sans latence (optimistic UI) avant la sauvegarde.

#### 2.1. Interfaces TypeScript (`frontend/src/types/study.ts`)

```typescript
export interface ProcessStep {
  id: string;
  title: string;
  description: string;
  icon: string; // Nom de la clé dans lucide-react
}

export interface StudyConfig {
  // ...
  process_steps: ProcessStep[];
}
```

#### 2.2. Actions du store (`frontend/src/store/useStudyDesigner.ts`)

Ajouter les actions atomiques pour la manipulation du tableau :

- `updateProcessStep(id: string, field: keyof ProcessStep, value: string)`
- `addProcessStep()`: Ajoute une étape vide avec un ID généré.
- `removeProcessStep(id: string)`
- `reorderProcessSteps(activeId: string, overId: string)`: Utilise l'algorithme `arrayMove` de la librairie `@dnd-kit/sortable`.

### 3. Interface administrateur : l'éditeur de processus

Cette interface remplacera la zone de texte statique actuelle.

#### 3.1. Composant `ProcessStepEditor`

Créer un composant utilisant `@dnd-kit/core` et `@dnd-kit/sortable`.

- **Structure visuelle :** Une liste verticale de "cartes" compactes.
- **Interaction :** Chaque carte possède une "poignée" (handle) à gauche pour le glisser-déposer.
- **Contenu de la carte :**
- Un déclencheur de _Popover_ pour choisir l'icône.
- Un champ `Input` pour le titre.
- Un champ `Textarea` pour la description (auto-extensible).
- Un bouton de suppression (icône poubelle).

#### 3.2. Sélecteur d'icônes (`IconPicker`)

Pour éviter de charger toute la librairie d'icônes, implémenter un sélecteur curé.

- **Approche :** Définir une liste statique de ~40 icônes pertinentes pour la recherche (ex : `Clipboard`, `Brain`, `CheckCircle`, `Clock`, `Users`, `MessageSquare`).
- **UI :** Une grille affichant les icônes. Au clic, le nom de l'icône (string) est sauvegardé dans le store.

### 4. Interface participant : rendu dynamique

La page d'accueil ou d'instructions doit lire la configuration au lieu d'afficher du HTML dur.

#### 4.1. Utilitaire de rendu d'icônes

Créer un composant `DynamicIcon` :

```tsx
import * as LucideIcons from "lucide-react";

const DynamicIcon = ({ name, ...props }) => {
  const IconComponent = LucideIcons[name];
  if (!IconComponent) return <LucideIcons.HelpCircle {...props} />; // Fallback
  return <IconComponent {...props} />;
};
```

Coder le composant d'icône pour qu'il soit léger (mapping restreint).

#### 4.2. Boucle de rendu

Dans `WelcomePage.tsx` (ou le composant dédié à l'explication) :

- Mapper sur `study.config.process_steps`.
- Générer la mise en page (grille responsive) en injectant le titre, la description et l'icône dynamique pour chaque itération.

### 5. Plan de migration pour l'existant

Pour les études déjà créées qui n'ont pas ce champ en base de données :

- **Backend :** Lors de la lecture (`get_study`), si `config.process_steps` est `null` ou `undefined`, l'API doit renvoyer la liste par défaut (celle définie au point 1.2) au lieu de rien. Cela assure que les anciennes études héritent automatiquement de l'affichage standard sans intervention manuelle.
- **Sauvegarde :** À la prochaine sauvegarde de la configuration par l'administrateur, cette liste par défaut sera persistée en base.

### 6. Nettoyage de l'interface d'administration

Retirer l'ancienne section d'édition de l'explication du processus (probablement un simple champ texte ou un bloc statique), afin de préparer l'intégration du nouvel éditeur dynamique "Drag & Drop".

### Résumé des tâches techniques

1. **Backend :** Mettre à jour `schemas.py` et intégrer la logique "default factory" dans `study_service.py`.
2. **Types :** Mettre à jour les interfaces TypeScript.
3. **Composant UI :** Créer `IconPicker` et `ProcessStepItem` (avec DnD).
4. **Intégration Admin :** Ajouter la section "Explication du processus" dans l'onglet "Design".
5. **Intégration Participant :** Rendre la liste dynamique dans la vue publique.
