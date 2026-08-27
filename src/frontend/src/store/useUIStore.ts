import { create } from 'zustand';

export type CardInfo = { id: number; text: string; code?: string };

interface UIState {
    hoveredCard: CardInfo | null;
    activeCard: CardInfo | null;
    selectedCard: CardInfo | null;
    setHoveredCard: (card: CardInfo | null) => void;
    setActiveCard: (card: CardInfo | null) => void;
    setSelectedCard: (card: CardInfo | null) => void;
    resetUI: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    hoveredCard: null,
    activeCard: null,
    selectedCard: null,
    setHoveredCard: (hoveredCard) => set({ hoveredCard }),
    setActiveCard: (activeCard) => set({ activeCard }),
    setSelectedCard: (selectedCard) => set({ selectedCard }),
    resetUI: () => set({ hoveredCard: null, activeCard: null, selectedCard: null }),
}));
