/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { DndContext } from '@dnd-kit/core';
import { renderWithProviders as render, screen } from '../test-utils/test-utils';
import { describe, expect, it, vi } from 'vitest';
import GridSort from './GridSort';

// Mock dependencies (mirrors GridSort.layout.test.tsx).
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

const countSlotsInColumn = (colIndex: number) =>
    screen.getAllByTestId('droppable-slot').filter((el) => {
        const id = el.getAttribute('data-id') || '';
        return id.startsWith(`slot_${colIndex}_`);
    }).length;

describe('GridSort free-mode overflow rows', () => {
    const baseColumns = [
        { score: -1, capacity: 3 },
        { score: 0, capacity: 3 },
        { score: 1, capacity: 3 },
    ];

    const baseProps = {
        agreeCards: [],
        disagreeCards: [],
        neutralCards: [],
        gridColumns: baseColumns,
        renderSlotContent: () => null,
    };

    it('renders col.capacity slots in forced mode regardless of cardsInColumn', () => {
        // Forced mode is the regression guard: even if the qsort somehow
        // reports more cards than capacity (shouldn't happen, but if), the
        // slot count must equal capacity exactly.
        const qsort = [
            { statementId: 1, col: 1, row: 0 },
            { statementId: 2, col: 1, row: 1 },
            { statementId: 3, col: 1, row: 2 },
        ];
        render(
            <DndContext>
                <GridSort {...baseProps} distributionMode="forced" qsort={qsort} />
            </DndContext>
        );

        // Each column should render exactly 3 slots (capacity).
        expect(countSlotsInColumn(0)).toBe(3);
        expect(countSlotsInColumn(1)).toBe(3);
        expect(countSlotsInColumn(2)).toBe(3);
    });

    it('renders col.capacity + 1 slots in free mode when column is at capacity', () => {
        // Column 1 is filled to its declared capacity (3). Free mode must
        // surface one extra empty slot below so the participant can keep
        // adding cards.
        const qsort = [
            { statementId: 1, col: 1, row: 0 },
            { statementId: 2, col: 1, row: 1 },
            { statementId: 3, col: 1, row: 2 },
        ];
        render(
            <DndContext>
                <GridSort {...baseProps} distributionMode="free" qsort={qsort} />
            </DndContext>
        );

        expect(countSlotsInColumn(0)).toBe(3); // empty column — capacity unchanged
        expect(countSlotsInColumn(1)).toBe(4); // 3 cards + 1 trailing empty slot
        expect(countSlotsInColumn(2)).toBe(3);
    });

    it('renders cardsInColumn + 1 slots in free mode when overstacked', () => {
        // 6 cards in a column with declared capacity 3 → 7 rendered slots
        // (6 cards + 1 trailing empty slot for further drops).
        const qsort = Array.from({ length: 6 }).map((_, i) => ({
            statementId: i + 1,
            col: 1,
            row: i,
        }));
        render(
            <DndContext>
                <GridSort {...baseProps} distributionMode="free" qsort={qsort} />
            </DndContext>
        );

        expect(countSlotsInColumn(1)).toBe(7);
    });

    it('collapses overflow rows when a card is removed in free mode', () => {
        // 5 cards in capacity-3 column → 6 slots (5 + 1 empty).
        const qsort = Array.from({ length: 5 }).map((_, i) => ({
            statementId: i + 1,
            col: 1,
            row: i,
        }));
        render(
            <DndContext>
                <GridSort {...baseProps} distributionMode="free" qsort={qsort} />
            </DndContext>
        );

        // 5 cards + 1 trailing empty = 6 slots (NOT 7 — overflow rows
        // collapse when cardsInColumn shrinks).
        expect(countSlotsInColumn(1)).toBe(6);
    });

    it('keeps overflow rows visible when cards live at high rows but cardsInColumn < capacity', () => {
        // Realistic scenario: column 1 (cap 3) once held 6 cards (rows 0-5),
        // then 4 were moved out leaving 2 cards at rows 4 and 5. The slot
        // count must accommodate the surviving max row, not just the head
        // count — otherwise the cards become invisible / unreachable.
        const qsort = [
            { statementId: 1, col: 1, row: 4 },
            { statementId: 2, col: 1, row: 5 },
        ];
        render(
            <DndContext>
                <GridSort {...baseProps} distributionMode="free" qsort={qsort} />
            </DndContext>
        );

        // maxRow is 5 → slots must reach at least row 6 (an empty trailing
        // slot below the highest card) → 7 slots total (rows 0..6).
        expect(countSlotsInColumn(1)).toBe(7);
    });

    it('renders col.capacity slots in flexible mode (unchanged from forced)', () => {
        // Flexible is a soft warning at submission, not a UI overflow.
        const qsort = [
            { statementId: 1, col: 1, row: 0 },
            { statementId: 2, col: 1, row: 1 },
            { statementId: 3, col: 1, row: 2 },
        ];
        render(
            <DndContext>
                <GridSort {...baseProps} distributionMode="flexible" qsort={qsort} />
            </DndContext>
        );

        expect(countSlotsInColumn(1)).toBe(3);
    });
});
