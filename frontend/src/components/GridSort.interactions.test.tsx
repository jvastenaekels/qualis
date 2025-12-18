import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GridSort from './GridSort';
import { DndContext } from '@dnd-kit/core';

// Mock dependencies
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  horizontalListSortingStrategy: {},
  rectSortingStrategy: {},
}));

vi.mock('./SortableCard', () => ({
  default: ({ text, onClick, id }: { text: string, onClick?: () => void, id: number }) => (
    <div data-testid={`card-${id}`} onClick={onClick}>{text}</div>
  )
}));

vi.mock('./DroppableSlot', () => ({
  default: ({ children, id, className, onClick }: { children: React.ReactNode, id: string, className: string, onClick?: () => void }) => (
    <div data-testid="droppable-slot" data-id={id} className={className} onClick={onClick}>
      {children}
    </div>
  )
}));

// Mock ResizeObserver
const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('GridSort Interactions', () => {
    const defaultProps = {
        agreeCards: [{ id: 10, text: 'Agree 1' }],
        disagreeCards: [{ id: 1, text: 'Disagree 1' }],
        neutralCards: [{ id: 5, text: 'Neutral 1' }],
        gridColumns: [
            { score: -1, capacity: 1 },
            { score: 0, capacity: 1 },
            { score: 1, capacity: 1 },
        ],
        responses: { qsort: [] },
        renderSlotContent: () => null,
    };

    it('defaults to disagree pile and switches piles correctly', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // check default state (Disagree)
        expect(screen.getByText('Disagree 1')).toBeInTheDocument();
        expect(screen.queryByText('Agree 1')).toBeNull(); 
        
        // Find pile tabs
        // Find pile tabs by exact aria-label construction from the mock
        // Mock t returns key. Format is `${key}: ${count} ${key}`
        const neutralTab = screen.getByRole('tab', { name: `common.neutral: 1 common.cards` });
        const agreeTab = screen.getByRole('tab', { name: `common.agree: 1 common.cards` });

        // Switch to Neutral
        fireEvent.click(neutralTab);
        expect(screen.getByText('Neutral 1')).toBeInTheDocument();
        expect(screen.queryByText('Disagree 1')).toBeNull();
        expect(neutralTab).toHaveAttribute('aria-selected', 'true');

        // Switch to Agree
        fireEvent.click(agreeTab);
        expect(screen.getByText('Agree 1')).toBeInTheDocument();
        expect(screen.queryByText('Neutral 1')).toBeNull();
        expect(agreeTab).toHaveAttribute('aria-selected', 'true');
    });

    it('triggers onCardClick when a card is clicked', () => {
        const handleCardClick = vi.fn();
        render(
            <DndContext>
                <GridSort {...defaultProps} onCardClick={handleCardClick} />
            </DndContext>
        );

        const card = screen.getByTestId('card-1'); // Disagree card is visible by default
        fireEvent.click(card);

        expect(handleCardClick).toHaveBeenCalledTimes(1);
        expect(handleCardClick).toHaveBeenCalledWith(1);
    });

    it('triggers onSlotClick when a slot is clicked', () => {
        const handleSlotClick = vi.fn();
        render(
            <DndContext>
                <GridSort {...defaultProps} onSlotClick={handleSlotClick} />
            </DndContext>
        );

        // Get the first slot (col 0, row 0)
        const slots = screen.getAllByTestId('droppable-slot');
        const firstSlot = slots[0];
        
        fireEvent.click(firstSlot);

        expect(handleSlotClick).toHaveBeenCalledTimes(1);
        // We know from props that there are 3 columns. 
        // The slot rendering order depends on the loop in GridSort.
        // It iterates columns, then rows. So first slot is col 0, row 0.
        expect(handleSlotClick).toHaveBeenCalledWith(0, 0);
    });

    it('renders zoom control buttons', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // Check for aria-labels of toolbar buttons using translation keys
        expect(screen.getByLabelText('fine.toolbar.zoom_in')).toBeInTheDocument();
        expect(screen.getByLabelText('fine.toolbar.zoom_out')).toBeInTheDocument();
        expect(screen.getByLabelText('fine.toolbar.fit_screen')).toBeInTheDocument();
    });
});
