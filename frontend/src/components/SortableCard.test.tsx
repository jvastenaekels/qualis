/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SortableCard from './SortableCard';
import CardZoomOverlay from './CardZoomOverlay';
import { useUIStore } from '../store/useUIStore';
import { act } from 'react';

// Mock dnd-kit hook
vi.mock('@dnd-kit/sortable', () => ({
    useSortable: vi.fn().mockReturnValue({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: null,
        isDragging: false
    })
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, className, onClick, onMouseEnter, onMouseLeave, ...props }: React.ComponentProps<'div'>) => (
            <div 
                className={className} 
                onClick={onClick}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                {...props}
            >
                {children}
            </div>
        )
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children
}));

describe('SortableCard', () => {
    beforeEach(() => {
        // Reset UI store
        useUIStore.setState({ zoomedCard: null });
    });

    const defaultProps = {
        id: 123,
        text: 'Test Card Content',
    };

    it('renders card text correctly', () => {
        render(
      <MemoryRouter>
        <SortableCard {...defaultProps} />
      </MemoryRouter>
    );
        expect(screen.getByText('Test Card Content')).toBeTruthy();
    });

    it('renders different variants with correct classes', () => {
        const { rerender } = render(<SortableCard {...defaultProps} variant="grid" />);
        expect(screen.getByText('Test Card Content')).toBeTruthy();

        rerender(<SortableCard {...defaultProps} variant="hand" />);
        expect(screen.getByText('Test Card Content')).toBeTruthy();

        rerender(<SortableCard {...defaultProps} variant="compact" />);
        expect(screen.getByText('Test Card Content')).toBeTruthy();
    });

    it('handles click events', () => {
        const handleClick = vi.fn();
        render(<SortableCard {...defaultProps} onClick={handleClick} />);
        
        fireEvent.click(screen.getByText('Test Card Content'));
        
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('shows zoom overlay on hover', async () => {
        vi.useFakeTimers();
        useUIStore.setState({ zoomedCard: null });

        render(
            <MemoryRouter>
                <SortableCard {...defaultProps} />
                <CardZoomOverlay />
            </MemoryRouter>
        );
        
        const cardContainer = screen.getByText('Test Card Content').closest('.relative');
        if(!cardContainer) throw new Error('Container not found');

        // Trigger hover
        await act(async () => {
             fireEvent.mouseEnter(cardContainer);
        });

        // Should NOT appear immediately (due to 300ms delay)
        expect(screen.getAllByText('Test Card Content').length).toBe(1);

        // Fast-forward 300ms
        await act(async () => {
            vi.advanceTimersByTime(310);
        });

        // Zoom portal should appear
        const textElements = screen.getAllByText('Test Card Content');
        expect(textElements.length).toBe(2);

        // Trigger leave
        await act(async () => {
            fireEvent.mouseLeave(cardContainer);
        });
        
        const textElementsAfterLeave = screen.getAllByText('Test Card Content');
        expect(textElementsAfterLeave.length).toBe(1);

        vi.useRealTimers();
    });

    it('styling changes when selected', () => {
        render(<SortableCard {...defaultProps} isSelected={true} />);
        
        const contentDiv = screen.getByText('Test Card Content').closest('.border-blue-500');
        expect(contentDiv).toBeTruthy();
    });

    it('applies dimensions correctly in overlay mode', () => {
        const dimensions = { width: 100, height: 150 };
        render(<SortableCard {...defaultProps} isOverlay={true} dimensions={dimensions} />);
        
        const outerDiv = screen.getByText('Test Card Content').closest('.relative') as HTMLElement;
        expect(outerDiv).toBeTruthy();
        expect(outerDiv.style.width).toBe('100px');
        expect(outerDiv.style.height).toBe('150px');
    });
});
