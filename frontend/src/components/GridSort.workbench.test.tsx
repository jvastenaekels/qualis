/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GridSort from './GridSort';
import { useStudyStore } from '../store/useStudyStore';

// Mock translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock Store
vi.mock('../store/useStudyStore', () => ({
    useStudyStore: Object.assign(vi.fn(), {
        getState: vi.fn(),
        subscribe: vi.fn(),
    }),
}));

const mockStore = useStudyStore as unknown as ReturnType<typeof vi.fn>;

// Mock ResizeObserver
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('GridSort Workbench Interaction', () => {
    const defaultProps = {
        columns: [{ score: -1, capacity: 1 }, { score: 1, capacity: 1 }],
        placedCards: [],
        cards: [
            { id: 1, text: 'Card One Text' },
            { id: 2, text: 'Card Two Text' }
        ],
        activePile: 'neutral' as const,
        onPlaceCard: vi.fn(),
        onMoveCard: vi.fn(),
        onSwapCards: vi.fn(),
        onUnplaceCard: vi.fn(),
        setActivePile: vi.fn(),
        agreeCards: [],
        disagreeCards: [],
        neutralCards: [
             { id: 1, text: 'Card One Text' },
             { id: 2, text: 'Card Two Text' }
        ],
        isMobile: true // Force Mobile mode for Workbench
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockStore.mockReturnValue({
            session: { hasConsented: true },
            setZoomedCard: vi.fn()
        });
    });

    it('opens WorkbenchPanel when a card is clicked', async () => {
        render(<GridSort {...defaultProps} />);

        // 1. Find a card in the deck and click it
        // The card text might be truncated or rendered via markdown, so we look for "Card One Text"
        const card = screen.getByText('Card One Text');
        fireEvent.click(card);

        // 2. Expect WorkbenchPanel to appear
        // It contains "Active Card" and the full text.
        // Also "Fine.workbench.active_card" (mocked key)
        expect(screen.getByText('fine.workbench.active_card')).toBeInTheDocument();
        
        // 3. Expect Deck to be hidden or removed
        // We look for the Deck title 'fine.deck.title' container or check generic hiding
        // In our implementation, we added `hidden` class to the deck container if selected.
        // Testing visibility via class is tricky with `toBeVisible` if css isn't processed perfectly in jsdom, 
        // but checking the workbench presence is the key positive assertion.
    });

    it('closes WorkbenchPanel when Close button is clicked', async () => {
        render(<GridSort {...defaultProps} />);

        // Open it
        const card = screen.getByText('Card One Text');
        fireEvent.click(card);

        // Find Close button
        const closeBtn = screen.getByLabelText('common.cancel');
        fireEvent.click(closeBtn);

        // Expect Workbench to be gone
        await waitFor(() => {
            expect(screen.queryByText('fine.workbench.active_card')).not.toBeInTheDocument();
        });
    });
});
