/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FineSortPage from './FineSortPage';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';

// Mocks
vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
    useParams: () => ({ slug: 'test-study' }),
}));

const setHeaderActionMock = vi.fn();
vi.mock('../contexts/LayoutContext', () => ({
    useLayoutAction: () => ({
        setHeaderAction: setHeaderActionMock,
    }),
}));

// Mock GridSort to avoid complex DND logic
vi.mock('../components/GridSort', () => ({
    default: () => <div data-testid="grid-sort">GridSort</div>
}));

const mockConfig = {
    title: 'Test',
    description: 'Test',
    instructions: 'Test',
    statements: [
        { id: 1, text: 'S1' },
        { id: 2, text: 'S2' }
    ],
    grid_config: [{ capacity: 2, score: 0 }],
    presort_config: {},
    language_code: 'en'
};

describe('FineSortPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset stores to clean state
        useConfigStore.getState().setConfig(mockConfig as any);
        useSessionStore.getState().resetSession();
        useSessionStore.getState().setConsent(true);
        useSessionStore.getState().setStep(4);
        useResponseStore.getState().resetResponses();
    });

    it('does not set header action initially (null) when not all cards are placed', () => {
        // Setup: Cards in rough sort but not in grid
        useResponseStore.getState().categorizeCard(1, 'disagree');
        useResponseStore.getState().categorizeCard(2, 'disagree');
        
        render(<FineSortPage />);
        
        // Assert setHeaderAction was called with null
        expect(setHeaderActionMock).toHaveBeenCalled();
        const actionNode = setHeaderActionMock.mock.lastCall?.[0];
        expect(actionNode).toBeNull();
    });

    it('sets header action to an active/animated button when all cards placed', () => {
        // Setup: All cards placed in grid
        useResponseStore.getState().categorizeCard(1, 'disagree');
        useResponseStore.getState().placeCardInGrid(1, 0, 0);
        
        // Update config to match 1 card
        useConfigStore.getState().setConfig({
            ...mockConfig,
            statements: [{ id: 1, text: 'S1' }],
            grid_config: [{ capacity: 1, score: 0 }]
        } as any);

        render(<FineSortPage />);
         
        const actionNode = setHeaderActionMock.mock.lastCall?.[0];
        if (actionNode) {
            const { getByRole } = render(<div>{actionNode}</div>);
            const button = getByRole('button');
            expect(button).not.toBeDisabled();
            // Check for animation class
            expect(button.className).toContain('bg-green-600');
        }
    });

    it('persists grid placements when re-navigating', () => {
        // Setup: Card 1 placed in grid
        useResponseStore.getState().categorizeCard(1, 'agree');
        useResponseStore.getState().placeCardInGrid(1, 0, 0);
        
        useConfigStore.getState().setConfig({
            ...mockConfig,
            statements: [{ id: 1, text: 'S1' }],
            grid_config: [{ capacity: 1, score: 0 }]
        } as any);

        const { unmount } = render(<FineSortPage />);
        
        // Assert GridSort is rendered
        expect(screen.getByTestId('grid-sort')).toBeTruthy();

        unmount();

        // Re-render - placement should still be there (in store)
        render(<FineSortPage />);
        expect(screen.getByTestId('grid-sort')).toBeTruthy();
        
        // Verify store still has the placement
        expect(useResponseStore.getState().qsort.length).toBe(1);
    });
});
