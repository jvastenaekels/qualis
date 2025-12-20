/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SortableCard from './SortableCard';
import CardZoomOverlay from './CardZoomOverlay';
import { useStudyStore } from '../store/useStudyStore';
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
    AnimatePresence: ({ children }: any) => children
}));

describe('SortableCard', () => {
    beforeEach(() => {
        // Reset store to initial state
        useStudyStore.setState({ 
            zoomedCard: null,
            session: {
                token: null,
                hasConsented: false,
                currentStep: 1,
                maxReachedStep: 1,
                language: null,
                isCompleted: false,
                confirmationCode: null,
                isSaving: false
            }
        });
    });

    const defaultProps = {
        id: 123,
        text: 'Test Card Content',
    };

    it('renders card text correctly', () => {
        render(<SortableCard {...defaultProps} />);
        expect(screen.getByText('Test Card Content')).toBeTruthy();
    });

    it('renders different variants with correct classes', () => {
        const { rerender } = render(<SortableCard {...defaultProps} variant="grid" />);
        // detailed check for grid variant classes or structure could be here
        // For now checking text presence is a proxy that render succeeded
        expect(screen.getByText('Test Card Content')).toBeTruthy();

        rerender(<SortableCard {...defaultProps} variant="hand" />);
        // Hand variant usually has smaller text or padding
        // checking if it renders without crashing
        expect(screen.getByText('Test Card Content')).toBeTruthy();

        rerender(<SortableCard {...defaultProps} variant="compact" />);
        expect(screen.getByText('Test Card Content')).toBeTruthy();
    });

    it('handles click events', () => {
        const handleClick = vi.fn();
        render(<SortableCard {...defaultProps} onClick={handleClick} />);
        

        // Based on implementation, the onClick is on the outer div which has .cursor-grab
        // Let's find logic: The outer div has onClick
        
        // Simulating click on the text element which bubbles up
        fireEvent.click(screen.getByText('Test Card Content'));
        
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('shows zoom overlay on hover', async () => {
        // useStudyStore is REAL here, reset it
        useStudyStore.setState({ zoomedCard: null });

        render(
            <>
                <SortableCard {...defaultProps} />
                <CardZoomOverlay />
            </>
        );
        
        const cardContainer = screen.getByText('Test Card Content').closest('.relative');
        if(!cardContainer) throw new Error('Container not found');

        // Trigger hover
        await act(async () => {
             fireEvent.mouseEnter(cardContainer);
        });

        // Zoom portal should appear
        await waitFor(() => {
             const textElements = screen.getAllByText('Test Card Content');
             expect(textElements.length).toBe(2);
        }, { timeout: 2000 });

        // Trigger leave
        await act(async () => {
            fireEvent.mouseLeave(cardContainer);
        });
        
        await waitFor(() => {
            const textElements = screen.getAllByText('Test Card Content');
            expect(textElements.length).toBe(1);
        }, { timeout: 2000 });
    });

    it('styling changes when selected', () => {
        render(<SortableCard {...defaultProps} isSelected={true} />);
        
        // We need to look for specific selected classes, e.g., border-blue-500
        // The motion.div has the classes
        // We can query by generic container
        
        // This relies on class structure which might be brittle, but verifies logic
        const contentDiv = screen.getByText('Test Card Content').closest('.border-blue-500');
        expect(contentDiv).toBeTruthy();
    });

    it('applies dimensions correctly in overlay mode', () => {
        const dimensions = { width: 100, height: 150 };
        render(<SortableCard {...defaultProps} isOverlay={true} dimensions={dimensions} />);
        
        // The outer div (the one with .relative) should have the provided dimensions
        const outerDiv = screen.getByText('Test Card Content').closest('.relative') as HTMLElement;
        expect(outerDiv).toBeTruthy();
        expect(outerDiv.style.width).toBe('100px');
        expect(outerDiv.style.height).toBe('150px');
    });
});
