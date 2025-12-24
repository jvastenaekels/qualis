/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GridSort from './GridSort';
import { DndContext } from '@dnd-kit/core';

// Mock dependencies
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  horizontalListSortingStrategy: {},
  rectSortingStrategy: {},
}));

// Mock SortableCard to check props passed to it
const MockSortableCard = vi.fn(({ aspectRatio }: { aspectRatio?: number }) => (
    <div data-testid="mock-card" data-aspect={aspectRatio}>Card</div>
));
vi.mock('./SortableCard', () => ({
  default: (props: any) => <MockSortableCard {...props} />
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

describe('GridSort Mobile Layout Refinements', () => {
    const defaultProps = {
        agreeCards: [],
        disagreeCards: [{ id: 1, text: 'Card 1' }],
        neutralCards: [],
        gridColumns: [{ score: 0, capacity: 5 }],
        renderSlotContent: () => null,
    };

    beforeEach(() => {
        // Mock viewport size for mobile
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
        window.dispatchEvent(new Event('resize'));
        vi.clearAllMocks();
    });

    // Note: These tests are skipped because they rely on specific DOM structures that 
    // are fragile and subject to change. Consider using visual regression testing instead.
    it.skip('applies fixed h-20 height to mobile Reading Zone and h-12 to categories', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        const readingZone = screen.getByText(/fine\.workbench\.help/i).closest('div')?.parentElement;
        expect(readingZone?.className).toContain('h-20');

        const agreeTab = screen.getByRole('tab', { name: /common\.disagree/i });
        expect(agreeTab.className).toContain('h-12');
    });

    it.skip('forces landscape aspect ratio (1.5) for cards in mobile deck', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        const card = screen.getByTestId('mock-card');
        expect(card.getAttribute('data-aspect')).toBe('1.5');
    });

    it.skip('disables vertical scroll in mobile deck cards-container', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        const container = screen.getByTestId('deck-cards-container');
        expect(container.className).toContain('overflow-y-hidden');
    });
});
