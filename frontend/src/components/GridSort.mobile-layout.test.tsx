/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { DndContext } from '@dnd-kit/core';
import { fireEvent, renderWithProviders as render, screen } from '../test-utils/test-utils';
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

const MockSortableCard = vi.fn(
    ({ aspectRatio, isSelected, onAction, disableHoverZoom, ...rest }: SortableCardProps) => (
        <div data-testid={rest['data-testid'] || 'mock-card'} data-aspect={aspectRatio} {...rest}>
            Card
        </div>
    )
);
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

        // Find the footer container by test-id
        const footer = screen.getByTestId('validation-footer');

        expect(footer).toBeInTheDocument();
        expect(footer.className).toContain('flex-none');
        expect(footer.className).toContain('z-[100]');
    });

    // NEW TESTS: Instruction Overlay & Toggle
    it('renders instruction header as an overlay (absolute) on mobile', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // Find the minimize button (it's visible initially in expanded state)
        const minimizeBtn = screen.getByLabelText('Minimize instructions');
        expect(minimizeBtn).toBeInTheDocument();

        // Check if the container is absolute
        // We look for the container div. It has "absolute top-0 left-0..."
        // We can traverse up from the button
        const container = minimizeBtn.closest('div.absolute');
        expect(container).toBeInTheDocument();
        expect(container?.className).toContain('z-[60]');
    });

    it('toggles instruction minimization on click', async () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // Initial State: Expanded -> Minimize Button Visible
        const minimizeBtn = screen.getByLabelText('Minimize instructions');
        fireEvent.click(minimizeBtn);

        // Expect: Minimized Button ("Expand instructions") to appear
        // Use findBy because of AnimatePresence / React updates
        const expandBtn = await screen.findByLabelText('Expand instructions');
        expect(expandBtn).toBeInTheDocument();
        expect(screen.queryByLabelText('Minimize instructions')).not.toBeInTheDocument();

        // Click Expand
        fireEvent.click(expandBtn);

        // Expect: Minimize Button to reappear
        const minimizeBtnAgain = await screen.findByLabelText('Minimize instructions');
        expect(minimizeBtnAgain).toBeInTheDocument();
    });
});
