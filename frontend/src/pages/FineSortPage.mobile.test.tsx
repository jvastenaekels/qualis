/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FineSortPage from './FineSortPage';
import StudyLayout from '../layouts/StudyLayout';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';
import { useConfigStore } from '../store/useConfigStore';

describe('FineSortPage Mobile Interaction (Integration)', () => {
    beforeEach(() => {
        // Setup initial session state for the test
        useSessionStore.getState().setConsent(true);
        useSessionStore.getState().setStep(4); // Fine Sort step
        
        // Pre-load config to ensure placeCardInGrid and other store actions work immediately
        useConfigStore.getState().setConfig({
            slug: 'demo',
            title: 'Demo Study',
            description: 'Mocked for testing',
            instructions: 'Sort them',
            statements: [
                { id: 1, text: 'Statement 1' },
                { id: 2, text: 'Statement 2' },
                { id: 3, text: 'Statement 3' },
            ],
            grid_config: [
                { score: -1, capacity: 1 },
                { score: 0, capacity: 1 },
                { score: 1, capacity: 1 },
            ],
            presort_config: {},
        } as any);

        // Mock viewport size for mobile
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
        window.dispatchEvent(new Event('resize'));
    });

    it('allows "Tap-to-Place" interaction: Select Card -> Tap Slot -> Move', async () => {
        // 1. Prepare rough sort results and consent
        useResponseStore.getState().categorizeCard(1, 'disagree');
        useSessionStore.getState().setConsent(true);

        render(
            <MemoryRouter initialEntries={['/study/demo/sort/fine']}>
                <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                        <Route path="sort/fine" element={<FineSortPage />} />
                    </Route>
                </Routes>
            </MemoryRouter>
        );

        // 2. Ensure we are on the 'disagree' pile
        const disagreeTab = await screen.findByRole('tab', { name: /common.disagree/i });
        fireEvent.click(disagreeTab);

        // 3. Wait for Card 1 to appear in the deck
        const card = await screen.findByText(/Statement 1/i);
        expect(card).toBeTruthy();

        // 4. User Taps Card (Select)
        fireEvent.click(card);

        // 5. Verify Workbench appears
        expect(await screen.findByText(/fine.workbench.drag_or_tap/i)).toBeTruthy();

        // 6. User Taps Empty Slot (Place)
        const slot = screen.getByTestId('slot_0_0');
        fireEvent.click(slot);

        // 7. Verify Card moved to Grid (Careful with ambiguity vs Workbench)
        await waitFor(() => {
            const cardInSlot = within(slot).getByTestId('card-1');
            expect(cardInSlot).toBeTruthy();
        }, { timeout: 4000 });

        // 8. Verify Deck shows completion message
        expect(screen.getByText(/fine.deck.all_placed/i)).toBeTruthy();
    });

    it('allows "Tap-to-Swap" interaction: Select Card -> Tap Occupied Slot -> Swap', async () => {
        // 1. Prepare state: Card 2 in Disagree Pile. Card 1 already in Grid at 0,0.
        useResponseStore.getState().categorizeCard(1, 'disagree');
        useResponseStore.getState().categorizeCard(2, 'disagree');
        useResponseStore.getState().placeCardInGrid(1, 0, 0);
        useSessionStore.getState().setConsent(true);

        render(
            <MemoryRouter initialEntries={['/study/demo/sort/fine']}>
                <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                        <Route path="sort/fine" element={<FineSortPage />} />
                    </Route>
                </Routes>
            </MemoryRouter>
        );

        // 2. Ensure we are on the 'disagree' pile
        const disagreeTab = await screen.findByRole('tab', { name: /common.disagree/i });
        fireEvent.click(disagreeTab);

        // 3. Select Card 2 (in Deck)
        const cardInDeck = await screen.findByText(/Statement 2/i);
        fireEvent.click(cardInDeck);

        // 4. Tap Occupied Slot (Slot 0,0 has Card 1/Statement 1)
        const slot = screen.getByTestId('slot_0_0');
        fireEvent.click(slot);

        // 5. Verify Swap: Card 2 should now be in the grid slot
        await waitFor(() => {
            const card2InSlot = within(slot).getByTestId('card-2');
            expect(card2InSlot).toBeTruthy();
        }, { timeout: 4000 });

        // 6. Card 1 should be back in the deck
        expect(await screen.findByText(/Statement 1/i)).toBeTruthy();
    });
});
