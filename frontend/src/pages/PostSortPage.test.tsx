/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PostSortPage from './PostSortPage';
import { MemoryRouter } from 'react-router-dom';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';
import { LayoutProvider } from '../contexts/LayoutContext';

// Mock translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key })
}));

const mockConfig = {
    statements: [
        { id: 1, text: 'Card 1 (Extreme -4)' },
        { id: 2, text: 'Card 2 (Extreme +4)' },
        { id: 3, text: 'Card 3 (Neutral 0)' }
    ],
    postsort_config: { extreme_columns: [-4, 4] },
    grid_config: [
         { score: -4, capacity: 1 }, 
         { score: -3, capacity: 1 }, 
         { score: -2, capacity: 1 }, 
         { score: -1, capacity: 1 }, 
         { score: 0, capacity: 1 }, 
         { score: 1, capacity: 1 }, 
         { score: 2, capacity: 1 }, 
         { score: 3, capacity: 1 }, 
         { score: 4, capacity: 1 }
    ],
    title: 'Test',
    description: 'Test',
    instructions: 'Test'
};

describe('PostSortPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup stores with real data
        useConfigStore.getState().setConfig(mockConfig as any);
        useSessionStore.getState().resetSession();
        useSessionStore.getState().setConsent(true);
        
        useResponseStore.getState().resetResponses();
        // Place cards in grid
        useResponseStore.getState().placeCardInGrid(1, 0, 0); // Score -4
        useResponseStore.getState().placeCardInGrid(2, 8, 0); // Score +4
        useResponseStore.getState().placeCardInGrid(3, 4, 0); // Score 0
    });

    it('renders null if config is missing', () => {
        useConfigStore.getState().resetConfig();
        
        const { container } = render(
             <MemoryRouter>
                <LayoutProvider>
                    <PostSortPage />
                </LayoutProvider>
            </MemoryRouter>
        );
        expect(container.firstChild).toBeNull();
    });

    it('identifies and displays extreme cards only', () => {
        render(
            <MemoryRouter>
                <LayoutProvider>
                    <PostSortPage />
                </LayoutProvider>
            </MemoryRouter>
        );

        // Extreme Cards
        expect(screen.getByText(/Card 1 \(Extreme -4\)/)).toBeTruthy();
        expect(screen.getByText(/Card 2 \(Extreme \+4\)/)).toBeTruthy();
        
        // Neutral Card should NOT be visible in the prompt list
        const card3 = screen.queryByText('Card 3 (Neutral 0)');
        expect(card3).toBeNull();
    });

    it('shows validation error for short comments on submit', async () => {
         render(
             <MemoryRouter>
                 <LayoutProvider>
                     <PostSortPage />
                 </LayoutProvider>
             </MemoryRouter>
         );

         const submitBtn = screen.getByText('post.submit');
         fireEvent.click(submitBtn);

         // Validation message should appear for both cards
         const warnings = await screen.findAllByText('post.extreme.min_chars');
         expect(warnings.length).toBe(2);
    });

    it('updates store when typing comments', () => {
        render(
            <MemoryRouter>
                <LayoutProvider>
                    <PostSortPage />
                </LayoutProvider>
            </MemoryRouter>
        );

        const textAreas = screen.getAllByPlaceholderText('post.extreme.placeholder');
        fireEvent.change(textAreas[0], { target: { value: 'This is a valid comment because it is long enough.' } });

        expect(useResponseStore.getState().postsort.card_comments[1]).toBe('This is a valid comment because it is long enough.');
    });

    it('tracks missing statement and general comments', () => {
         render(
             <MemoryRouter>
                 <LayoutProvider>
                     <PostSortPage />
                 </LayoutProvider>
             </MemoryRouter>
         );
         
         // Missing statement
         const missingInput = screen.getByLabelText('post.missing.label');
         fireEvent.change(missingInput, { target: { value: 'I feel like X is missing' } });
         expect(useResponseStore.getState().postsort.missing_statement).toBe('I feel like X is missing');

         // General
         const generalInput = screen.getByLabelText('post.general.label');
         fireEvent.change(generalInput, { target: { value: 'Great study!' } });
         expect(useResponseStore.getState().postsort.general_comment).toBe('Great study!');
    });

    it('persists comments when re-navigating', async () => {
        const { unmount } = render(
            <MemoryRouter>
                <LayoutProvider>
                    <PostSortPage />
                </LayoutProvider>
            </MemoryRouter>
        );

        const textAreas = screen.getAllByPlaceholderText('post.extreme.placeholder');
        fireEvent.change(textAreas[0], { target: { value: 'Persisted comment for card 1' } });

        unmount();

        render(
            <MemoryRouter>
                <LayoutProvider>
                    <PostSortPage />
                </LayoutProvider>
            </MemoryRouter>
        );

        expect(screen.getByDisplayValue('Persisted comment for card 1')).toBeTruthy();
    });
});
