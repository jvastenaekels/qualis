import { create } from 'zustand';

interface UIState {
    hoveredCard: { id: number; text: string } | null;
    setHoveredCard: (card: { id: number; text: string } | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
    hoveredCard: null,
    setHoveredCard: (hoveredCard) => set({ hoveredCard }),
}));
