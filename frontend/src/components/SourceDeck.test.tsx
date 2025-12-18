import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SourceDeck from './SourceDeck';

// Mock dnd-kit core
vi.mock('@dnd-kit/core', () => ({
    useDroppable: vi.fn().mockReturnValue({ setNodeRef: vi.fn() }),
}));

// Mock dnd-kit sortable components
vi.mock('@dnd-kit/sortable', () => ({
    SortableContext: ({ children }: React.PropsWithChildren) => <div data-testid="sortable-context">{children}</div>,
    rectSortingStrategy: {},
    useSortable: vi.fn().mockReturnValue({
         attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: null
    }) 
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, className }: React.ComponentProps<'div'>) => <div className={className}>{children}</div>
    }
}));

// Mock child component to avoid deep rendering
vi.mock('./SortableCard', () => ({
    default: ({ text }: { text: string }) => <div data-testid="sortable-card">{text}</div>,
}));

describe('SourceDeck', () => {
    const mockAgree = [{ id: 1, text: 'Agree 1' }];
    const mockDisagree = [{ id: 2, text: 'Disagree 1' }, { id: 3, text: 'Disagree 2' }];
    const mockNeutral = [{ id: 4, text: 'Neutral 1' }];

    it('renders tabs with correct counts', () => {
        render(<SourceDeck agree={mockAgree} disagree={mockDisagree} neutral={mockNeutral} />);
        
        expect(screen.getByText('Agree (1)')).toBeTruthy();
        expect(screen.getByText('Disagree (2)')).toBeTruthy();
        expect(screen.getByText('Neutral (1)')).toBeTruthy();
    });

    it('defaults to Neutral tab', () => {
        render(<SourceDeck agree={mockAgree} disagree={mockDisagree} neutral={mockNeutral} />);
        
        // Should show neutral cards
        expect(screen.getByText('Neutral 1')).toBeTruthy();
        // Should NOT show others
        expect(screen.queryByText('Agree 1')).toBeNull();
    });

    it('switches tabs correctly', () => {
        render(<SourceDeck agree={mockAgree} disagree={mockDisagree} neutral={mockNeutral} />);
        
        // Click Disagree
        fireEvent.click(screen.getByText('Disagree (2)'));
        
        expect(screen.getByText('Disagree 1')).toBeTruthy();
        expect(screen.getByText('Disagree 2')).toBeTruthy();
        expect(screen.queryByText('Neutral 1')).toBeNull();

        // Click Agree
        fireEvent.click(screen.getByText('Agree (1)'));
        expect(screen.getByText('Agree 1')).toBeTruthy();
    });

    it('shows empty state message', () => {
        render(<SourceDeck agree={[]} disagree={[]} neutral={[]} />);
        
        // Default is neutral, which is empty here
        expect(screen.getByText('Empty Pile')).toBeTruthy();
    });
});
