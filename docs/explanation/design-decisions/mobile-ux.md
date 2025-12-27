# Design Decision: Mobile UX Strategy

**Status:** Implementation
**Context:** Fine Sort Interface on Touch Devices

## The Challenge: Vertical Space Scarcity

Q-Methodology requires two distinct views that compete for screen space:

1.  **Macro View**: The Pyramid Grid (Structural Context).
2.  **Micro View**: The Statement Text (Reading & Decision).

On mobile devices, showing both simultaneously (Split Screen) results in neither being usable: the grid is too small to navigate, and the text is truncated.

## Evolution of Concepts

### 1. Split Screen (Initial)

- **Design**: 60% Grid / 40% Deck.
- **Failures**: "Keyhole effect" (panning the grid behind a static overlay), inability to read full statements without opening a modal.

### 2. Focus Flow (The "Modal" Approach)

- **Design**: Deck collapses to a "Heads Up Display" (HUD) upon selection.
- **Pros**: Maximizes grid space during placement.
- **Cons**: High cognitive load due to mode switching ("Am I placing? Am I picking?"). Layout thrashing when elements resize.

### 3. The Workbench (Current / Target)

- **Concept**: A stable split-screen that strictly separates concerns.
- **Structure**:
  - **Canvas (Top 65%)**: Pannable/Zoomable Grid for context.
  - **Stage (Bottom 35%)**: Fixed reading area for the active card.
- **Key Features**:
  - **Zonal Focus**: Auto-panning the grid to relevant columns (e.g., "Agree") when a card is picked.
  - **Elimination of Modals**: Reading happens in the "Stage", positioning happens in the "Canvas".

## Principles

1.  **Fitts's Law**: Tap targets (Slots) are large and static.
2.  **Hick's Law**: Decouple the decision "Which card?" from "Where to place?".
3.  **Details-on-Demand**: The "Stage" provides full text readability without obscuring the structural context of the Grid.
