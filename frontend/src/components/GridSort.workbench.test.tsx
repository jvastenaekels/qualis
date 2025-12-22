/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GridSort from './GridSort';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';

// Mock translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock ResizeObserver
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const mockConfig = {
    statements: [
        { id: 1, text: 'Card One Text' },
        { id: 2, text: 'Card Two Text' }
    ],
    title: 'Test',
    description: 'Test',
    instructions: 'Test'
};

describe('GridSort Workbench Interaction', () => {
    const defaultProps = {
        gridColumns: [{ score: -1, capacity: 1 }, { score: 1, capacity: 1 }],
        renderSlotContent: () => <div>Slot</div>,
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
        isMobile: true, // Force Mobile mode for Workbench
        forcedTipsClosed: true // Hide tips to avoid DOM interference
    };


    beforeEach(() => {
        vi.clearAllMocks();
        // Resize window to mobile - GridSort uses window.innerWidth
        global.innerWidth = 500;
        global.dispatchEvent(new Event('resize'));
        
        useConfigStore.getState().setConfig(mockConfig as any);
        useSessionStore.getState().resetSession();
        useSessionStore.getState().setConsent(true);
        useResponseStore.getState().resetResponses();
    });

    it('opens WorkbenchPanel when a card is clicked', async () => {
        render(<GridSort {...defaultProps} />);

        // 1. Find a card in the deck and click it
        const card = screen.getByText('Card One Text');
        fireEvent.click(card);

        // 2. Expect WorkbenchPanel to appear
        expect(screen.getByText('fine.workbench.active_card')).toBeInTheDocument();
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
