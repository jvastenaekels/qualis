# Mobile UX Revamp: The "Workbench" Concept

## 1. Executive Summary

The current mobile implementation suffers from **Layer Redundancy** (Deck -> HUD -> Overlay) and **Context Switching** costs. The user is constantly managing UI states rather than sorting statements.

We propose a **"Workbench" Metaphor**: A stable, split-screen interface that strictly separates "Content to be sorted" (Reading) from "Structure to be filled" (Sorting).

## 2. The Core Problem

- **Redundancy**: The user sees the same text in 3 forms: Tiny (Deck), Truncated (HUD), and Readable (Overlay). This is wasteful.
- **The Pyramid Challenge**: The grid is large, screen is small. Overlays obscuring the grid prevent "Smart Placement".
- **Clutter**: Instructional badges, bouncing elements, and mode-switching create visual noise.

## 3. The Solution: "The Workbench" Layout

### A. The Layout (Stable Split-Screen)

The screen is permanently divided into two functional zones during the sorting phase:

| Zone                   | Height  | Purpose                                    | Interaction                                     |
| :--------------------- | :------ | :----------------------------------------- | :---------------------------------------------- |
| **The Canvas (Top)**   | **65%** | **Context & Structure**. The Pyramid Grid. | Pan, Zoom, Pinch. Visualizing the distribution. |
| **The Stage (Bottom)** | **35%** | **Focus & Reading**. The Active Card.      | Read (Scrollable), Actions (Skip, Info).        |

### B. The Flow (Step-by-Step)

#### Step 1: Selection (The Drawer)

- **Initial State**: "The Stage" is empty. It shows a large button: **"Pick a Card"**.
- **Action**: Tapping it opens the **Deck Drawer** (Full height bottom sheet).
- **Interaction**: User scans the list (Agree/Disagree/Neutral). Taps a card.
- **Transition**: Drawer slides down. The selected card **lands on "The Stage"**.

#### Step 2: Consideration (The Stage)

- **State**: The card is now in the **Stage (Bottom 35%)**.
- **Typography**: Text is **Large (18px+)**, legible, fully visible (or scrollable).
- **No Overlay Needed**: The text is already maximized.
- **No Modal Blocking**: The grid (Top 65%) is fully visible.

#### Step 3: Placement (The Canvas)

- **Action**: User looks at the Grid (Top). Pans/Zooms to find the right spot.
- **Guidance**: The app highlights the _valid columns_ (e.g. Agree section).
- **Interaction**: User **Taps a Slot**.
- **Result**: The card flies from "The Stage" to the "Slot". The Stage clears (or auto-advances to next card).

## 4. Why This Works (UX Expert Analysis)

1.  **Eliminates Redundancy**: We removed the "HUD" and "Overlay". "The Stage" serves both purposes (it acts as the expanded view).
2.  **Solves the Pyramid Paradox**:
    - **Reading**: Done in the Stage (Fixed, Large).
    - **Context**: Done in the Canvas (Zoomable, clean).
    - They never overlap. You can read and pan the grid simultaneously.
3.  **Professional Polish**:
    - Stable UI (No layout thrashing/resizing).
    - Clear separation of concerns (Reading vs Positioning).
    - "App-like" feel rather than "Web-like" scrolling.

## 5. Visual Guide (Mental Model)

```
+-----------------------------+
|  [ Z O O M   C O N T R O L ]|
|                             |
|       [   GRID AREA   ]     |
|       [ PANNABLE/ZOOM ]     |
|       [               ]     |
|                             |
|                             |
+-----------------------------+  <-- Separator (Drag handle?)
|  Card #12                   |
|  "This is the full text..." |
|  [ Large, Readable Font ]   |
|                             |
|  [ < Prev ]   [ Drawer ]    |
+-----------------------------+
```

## 6. Implementation Strategy

1.  **Refactor**: Remove `CardZoomOverlay` and `FineSortHUD`.
2.  **Create**: `WorkbenchPanel` (The bottom stage).
3.  **Modify**: `GridSort` to accept a fixed height (e.g., `flex-basis: 65%`).
