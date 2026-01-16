/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { DndContext } from '@dnd-kit/core';
import { fireEvent, renderWithProviders as render, screen } from '../test-utils/test-utils';
import { describe, expect, it, vi } from 'vitest';
import GridSort from './GridSort';

// Mock dependencies
vi.mock('@dnd-kit/sortable', () => ({
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    horizontalListSortingStrategy: {},
    rectSortingStrategy: {},
}));

vi.mock('./SortableCard', () => ({
    default: ({ text }: { text: string }) => <div>{text}</div>,
}));

vi.mock('./DroppableSlot', () => ({
    default: ({
        children,
        id,
        className,
    }: {
        children: React.ReactNode;
        id: string;
        className: string;
    }) => (
        <div data-testid="droppable-slot" data-id={id} className={className}>
            {children}
        </div>
    ),
}));

// Mock ReadingZone to avoid complexity
vi.mock('./ReadingZone', () => ({
    default: ({ variant }: { variant: string }) => (
        <div data-testid={`reading-zone-${variant}`}>Reading Zone ({variant})</div>
    ),
}));

vi.mock('react-i18next', async () => {
    const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
    return {
        ...actual,
        useTranslation: () => ({ t: (key: string) => key }),
    };
});

describe('GridSort Detailed UI Verification', () => {
    const defaultProps = {
        agreeCards: [],
        disagreeCards: [],
        neutralCards: [],
        gridColumns: [
            { score: -2, capacity: 2 },
            { score: 0, capacity: 4 },
            { score: 2, capacity: 2 },
        ],
        responses: { qsort: [] },
        renderSlotContent: () => null,
    };

    // 1. Footer Instructions Verification
    it('shows "Drag or Tap" in footer when deck has cards and no card is selected', () => {
        render(
            <DndContext>
                <GridSort
                    {...defaultProps}
                    disagreeCards={[{ id: 1, text: 'Card 1' }]} // Deck has cards
                    selectedCardId={null} // No selection
                    isAllPlaced={false} // Not finished
                />
            </DndContext>
        );

        // Expect Instruction 1: Sequence Number
        // There might be other "1"s (e.g. badge counts), so we look for the one in the instruction circle
        const instructionNumber = screen
            .getAllByText('1')
            .find(
                (el) =>
                    el.className.includes('bg-slate-200') || el.className.includes('rounded-full')
            );
        expect(instructionNumber).toBeInTheDocument();
        // Expect Instruction Text
        expect(screen.getByText('fine.workbench.initial_instruction')).toBeInTheDocument();
    });

    it('shows "Place on Grid" in footer when a card IS selected', () => {
        render(
            <DndContext>
                <GridSort
                    {...defaultProps}
                    disagreeCards={[{ id: 1, text: 'Card 1' }]}
                    selectedCardId={1} // Card selected
                    isAllPlaced={false}
                />
            </DndContext>
        );

        // Expect Instruction 2: Sequence Number9
        expect(screen.getByText('2')).toBeInTheDocument();
        // Expect Instruction Text
        expect(screen.getByText('fine.workbench.place_on_grid')).toBeInTheDocument();
    });

    // 2. Button Verification
    it('shows "Validate" button when all cards are placed', () => {
        const onValidate = vi.fn();
        render(
            <DndContext>
                <GridSort
                    {...defaultProps}
                    disagreeCards={[{ id: 1, text: 'Card 1' }]}
                    isAllPlaced={true} // Completed
                    onValidate={onValidate}
                />
            </DndContext>
        );

        const validateBtn = screen.getByText('fine.actions.validate');
        expect(validateBtn).toBeInTheDocument();

        fireEvent.click(validateBtn);
        expect(onValidate).toHaveBeenCalled();
    });

    // 3. Deck Empty State
    it('shows Green Checkmark message when deck is empty', () => {
        render(
            <DndContext>
                <GridSort
                    {...defaultProps}
                    disagreeCards={[]} // Empty Deck
                    activePile="disagree" // Ensure we are looking at the empty pile
                />
            </DndContext>
        );

        expect(screen.getByText('fine.deck.all_placed')).toBeInTheDocument();
        // We can checks for the green checkmark class presence on the container
        const emptyStateText = screen.getByText('fine.deck.all_placed');
        const container = emptyStateText.closest('div');
        // The container has `flex flex-col items-center gap-2`
        expect(container?.className).toContain('gap-2');
    });

    // 4. Layout & Sidebar
    it('renders Reading Zone in Sidebar on Desktop', () => {
        // Force Desktop width
        window.innerWidth = 1200;
        window.dispatchEvent(new Event('resize'));

        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        expect(screen.getByTestId('reading-zone-desktop')).toBeInTheDocument();
        expect(screen.queryByTestId('reading-zone-mobile')).not.toBeInTheDocument();
    });

    it('renders Reading Zone in Main Area on Mobile', () => {
        // Force Mobile width
        window.innerWidth = 500;
        window.dispatchEvent(new Event('resize'));

        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        expect(screen.queryByTestId('reading-zone-desktop')).not.toBeInTheDocument();
        expect(screen.getByTestId('reading-zone-mobile')).toBeInTheDocument();
    });
});
