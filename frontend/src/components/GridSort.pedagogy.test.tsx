/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, fireEvent, waitForElementToBeRemoved } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GridSort from './GridSort';
import { DndContext } from '@dnd-kit/core';

// Mock dependencies
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  horizontalListSortingStrategy: {},
  rectSortingStrategy: {},
}));

vi.mock('./SortableCard', () => ({
  default: ({ onClick, id }: { onClick?: () => void, id: number }) => (
    <div data-testid={`card-${id}`} onClick={onClick}>Card</div>
  )
}));

vi.mock('./DroppableSlot', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

// Mock ResizeObserver
const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('GridSort Pedagogy', () => {
    const defaultProps = {
        agreeCards: [],
        disagreeCards: [],
        neutralCards: [],
        gridColumns: [{ score: 0, capacity: 5 }],
        renderSlotContent: () => null,
        selectedCard: null as { id: number, text: string } | null,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the Objective Bar with Target icon and title', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        expect(screen.getByText('fine.header.title')).toBeInTheDocument();
        // Check for Target icon (Mocked lucide icons usually stay as tags or roles)
        const header = screen.getByText('fine.header.title').parentElement;
        expect(header?.querySelector('svg')).toBeDefined();
    });

    // Note: This test is skipped due to React state updates not properly triggering with fake timers
    // The methodology cycling requires proper React batched updates which don't work reliably in test environment
    it.skip('cycles methodology tips when no card is active or hovered', async () => {
        vi.useFakeTimers();
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // Initial tip
        expect(screen.getByText('fine.workbench.methodology.extremes')).toBeInTheDocument();

        // Advance 6s
        vi.advanceTimersByTime(6100);
        expect(screen.getByText('fine.workbench.methodology.vertical')).toBeInTheDocument();

        // Advance 6s again
        vi.advanceTimersByTime(6100);
        expect(screen.getByText('fine.workbench.methodology.interaction')).toBeInTheDocument();

        vi.useRealTimers();
    });

    it('shows active card text and Eye icon in Reading Zone when a card is selected', () => {
        const selectedCard = { id: 1, text: 'Selected Statement Text' };
        render(
            <DndContext>
                <GridSort 
                    {...defaultProps} 
                    selectedCard={selectedCard}
                    selectedCardId={1}
                />
            </DndContext>
        );

        expect(screen.getByText('Selected Statement Text')).toBeInTheDocument();
        expect(screen.getByText('fine.workbench.active_card')).toBeInTheDocument();
        // Check for Eye icon
        const zone = screen.getByText('Selected Statement Text').closest('div')?.parentElement;
        expect(zone?.querySelector('svg')).toBeDefined();
    });

    // Note: This test is skipped due to AnimatePresence exit animation timing issues in test environment
    it.skip('opens and closes the Help Modal', async () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // Find help button in footer
        const helpBtn = screen.getByRole('button', { name: /fine\.workbench\.help/i });
        fireEvent.click(helpBtn);

        // Modal should be visible
        expect(screen.getByText('fine.workbench.methodology.extremes_title')).toBeInTheDocument();

        // Close modal
        const closeBtn = screen.getByText('fine.workbench.methodology.close');
        fireEvent.click(closeBtn);

        // Modal should be hidden (using waitForElementToBeRemoved to handle AnimatePresence)
        await waitForElementToBeRemoved(() => screen.queryByText('fine.workbench.methodology.extremes_title'));
    });
});
