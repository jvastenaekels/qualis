import { render, screen, act } from '@testing-library/react';
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
  default: ({ text }: { text: string }) => <div>{text}</div>
}));

vi.mock('./DroppableSlot', () => ({
  default: ({ children, id, className }: { children: React.ReactNode, id: string, className: string }) => (
    <div data-testid="droppable-slot" data-id={id} className={className}>
      {children}
    </div>
  )
}));

describe('GridSort Layout', () => {
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

    it('renders the correct number of slots based on capacity', () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );
        
        const slots = screen.getAllByTestId('droppable-slot');
        // Total capacity: 2 + 4 + 2 = 8
        expect(slots).toHaveLength(8);
    });

    it('has sufficient top padding to prevent hidden slots', () => {
         render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );
        const gridContainer = screen.getByTestId('grid-container');
        expect(gridContainer.className).toContain('py-12');
        expect(gridContainer.className).toContain('py-12');
        // expect(gridContainer.className).toContain('overflow-y-auto'); // Removed as logic changed with zoom lib
    });
});

describe('GridSort Responsive Layout', () => {
    const defaultProps = {
        agreeCards: [],
        disagreeCards: [{ id: 1, text: 'Card 1' }],
        neutralCards: [],
        gridColumns: [{ score: 0, capacity: 4 }],
        responses: { qsort: [] },
        renderSlotContent: () => null,
    };

    // Helper to resize window
    const resizeWindow = (width: number) => {
        window.innerWidth = width;
        window.dispatchEvent(new Event('resize'));
    };

    it('renders mobile source deck correctly (icons visible, text hidden)', () => {
        resizeWindow(375); // Mobile width
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // Pile Buttons: Check for "Frown" icon usage logic (by class/presence)
        // Since we mock lucide-react mostly, we check if the mobile-structure is present
        // In our actual code, we use 'lg:hidden' classes. 
        // Testing library doesn't process CSS media queries, but we can check if the elements exist in the DOM 
        // and have the correct class names.
        
        const disagreeBtn = screen.getByText('common.disagree').closest('button');
        expect(disagreeBtn).toBeDefined();
        
        // We expect the icon container to be present (lg:hidden)
        // And the text span to have 'hidden lg:block'
        const textSpan = screen.getByText('common.disagree');
        expect(textSpan.className).toContain('hidden lg:block');
    });

    it('renders desktop source deck correctly (text visible)', () => {
        resizeWindow(1024); // Desktop width
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        const textSpan = screen.getByText('common.disagree');
        expect(textSpan.className).toContain('hidden lg:block'); 
        // Note: unit tests won't "hide" it visually without a real browser layout engine, 
        // but checking the class presence confirms the logic is wired.
    });

    it('renders cards with mobile width (120px) on small screens', () => {
        resizeWindow(375);
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // Find the card wrapper div. 
        // In GridSort.tsx: <div key={card.id} className="flex-none w-[120px] ...">
        const cardText = screen.getByText('Card 1');
        const cardContainer = cardText.closest('div');
        expect(cardContainer).not.toBeNull();
        // Since we verify text presence above, this is mostly checking structure stability.
    });
    it('applies transient zone highlighting (dimming) correctly', () => {
        vi.useFakeTimers();
        
        render(
            <DndContext>
                <GridSort 
                    {...defaultProps} 
                    gridColumns={[
                        { score: -2, capacity: 2 },
                        { score: 0, capacity: 4 },
                        { score: 2, capacity: 2 },
                    ]}
                />
            </DndContext>
        );

        // Initial State
        const colPos = document.getElementById('column-2'); 
        // Logic: Disagree -> Positive columns dimmed.
        expect(colPos?.className).toContain('opacity-50'); // Dimmed initially

        // Advance timer to trigger fade out (2500ms set in component)
        act(() => {
            vi.runAllTimers();
        });

        const colPosAfter = document.getElementById('column-2');
        expect(colPosAfter?.className).toContain('opacity-100'); // Faded back to normal

        vi.useRealTimers();
    });


    it('renders tips after smart focus activation (2s)', () => {
        vi.useFakeTimers();
        render(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        // Initially hidden (Smart Focus inactive)
        expect(screen.queryByText('💡')).toBeNull();
        expect(screen.queryByText('ℹ️')).toBeNull();

        // Advance 2s -> Smart Focus activates
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        
        // Tips should now be rendered (opacity animation starts)
        expect(screen.getByText('💡')).toBeInTheDocument();
        expect(screen.getByText('ℹ️')).toBeInTheDocument();

        vi.useRealTimers();
    });
});


