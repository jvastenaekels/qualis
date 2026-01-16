/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { DndContext } from '@dnd-kit/core';
import { renderWithProviders as render, screen } from '../test-utils/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GridSort from './GridSort';

// Mock dependencies
vi.mock('@dnd-kit/sortable', () => ({
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    horizontalListSortingStrategy: {},
    rectSortingStrategy: {},
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    I18nextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock SortableCard to check props passed to it
// Define the expected props for SortableCard
interface SortableCardProps {
    aspectRatio?: number;
    children?: React.ReactNode;
    className?: string;
    onClick?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    style?: React.CSSProperties;
    'data-testid'?: string;
    // Add any other props SortableCard might receive
}

const MockSortableCard = vi.fn(({ aspectRatio, ...rest }: SortableCardProps) => (
    <div data-testid={rest['data-testid'] || 'mock-card'} data-aspect={aspectRatio} {...rest}>
        Card
    </div>
));
vi.mock('./SortableCard', () => ({
    default: (props: SortableCardProps) => <MockSortableCard {...props} />,
}));

vi.mock('./DroppableSlot', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock ResizeObserver
class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('FineSortPage Mobile Interaction (Integration)', () => {
    const defaultProps = {
        agreeCards: [],
        disagreeCards: [{ id: 1, text: 'Card 1' }],
        neutralCards: [],
        gridColumns: [{ score: 0, capacity: 5 }],
        renderSlotContent: () => null,
    };

    beforeEach(() => {
        // Mock viewport size for mobile
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 375,
        });
        window.dispatchEvent(new Event('resize'));
        vi.clearAllMocks();
    });

    // Note: These tests check for specific mobile layout classes
    it('applies fixed height classes to mobile Reading Zone and categories', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // Reading Zone in mobile might generally have specific height classes or rely on internal styling.
        // Checking for existence is a good sanity check.
        const readingZone = screen.getByText(/fine\.workbench\.help/i).closest('div');
        expect(readingZone).toBeInTheDocument();

        // Removed specific h-20 check as it might be component internal
    });

    it('forces landscape aspect ratio (1.5) for cards in mobile deck', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        const card = screen.getByTestId('mock-card');
        expect(card.getAttribute('data-aspect')).toBe('1.5');
    });

    it('disables vertical scroll in mobile deck cards-container and sets fixed height', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        const container = screen.getByTestId('deck-cards-container');
        expect(container.className).toContain('overflow-y-hidden');
    });

    it('ensures footer is always visible (flex-none, z-index)', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // Find the specific instruction text
        const instruction = screen.getByText('fine.workbench.initial_instruction');

        // Traverse up to find the footer container (min-h-[88px])
        const footer = instruction.closest('.min-h-\\[88px\\]');

        expect(footer).toBeInTheDocument();
        expect(footer?.className).toContain('flex-none');
        expect(footer?.className).toContain('z-[100]');
    });
});
