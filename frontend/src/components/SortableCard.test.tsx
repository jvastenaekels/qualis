/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SortableCard from './SortableCard';
import { useUIStore } from '../store/useUIStore';

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
        div: ({ children, className, onClick, onMouseEnter, onMouseLeave, style, ...props }: any) => (
            <div 
                className={className} 
                onClick={onClick}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                style={style}
                data-testid={props['data-testid']}
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
        useUIStore.setState({ hoveredCard: null });
    });

    afterEach(() => {
        cleanup();
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
        expect(screen.getByTestId('card-123')).toBeTruthy();
        expect(screen.getByText('Test Card Content')).toBeTruthy();
    });

    it('handles click events', () => {
        const handleClick = vi.fn();
        render(<SortableCard {...defaultProps} onClick={handleClick} />);
        
        fireEvent.click(screen.getByTestId('card-123'));
        
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('updates ui store on hover', async () => {
        render(
            <MemoryRouter>
                <SortableCard {...defaultProps} />
            </MemoryRouter>
        );
        
        const card = screen.getByTestId('card-123');

        // Trigger hover
        await act(async () => {
             fireEvent.mouseEnter(card);
        });

        // Store should be updated immediately
        expect(useUIStore.getState().hoveredCard?.text).toBe('Test Card Content');

        // Trigger leave
        await act(async () => {
            fireEvent.mouseLeave(card);
        });
        
        expect(useUIStore.getState().hoveredCard).toBe(null);
    });

    it('styling changes when selected', () => {
        render(<SortableCard {...defaultProps} isSelected={true} />);
        
        const card = screen.getByTestId('card-123');
        const inner = card.querySelector('.border-blue-500');
        expect(inner).toBeTruthy();
    });

    it('applies dimensions correctly', () => {
        const dimensions = { width: 100, height: 150 };
        render(<SortableCard {...defaultProps} dimensions={dimensions} />);
        
        const card = screen.getByTestId('card-123');
        expect(card.style.width).toBe('100px');
        expect(card.style.height).toBe('150px');
    });
    it('renders statement code when provided', () => {
        render(<SortableCard {...defaultProps} code="S1" />);
        expect(screen.getByText('S1')).toBeTruthy();
    });

    it('renders statement code in hover store', async () => {
         render(<SortableCard {...defaultProps} code="S1" />);
         const card = screen.getByTestId('card-123');
         await act(async () => {
             fireEvent.mouseEnter(card);
         });
         expect(useUIStore.getState().hoveredCard?.code).toBe('S1');
    });

    it('does not render code when undefined', async () => {
        render(<SortableCard {...defaultProps} code={undefined} />);
        const card = screen.getByTestId('card-123');
        // Assuming "S1" or any code pattern isn't present by default
        // We can't query by text easily if text isn't there.
        // But we can check store update.
        await act(async () => {
            fireEvent.mouseEnter(card);
        });
        expect(useUIStore.getState().hoveredCard?.code).toBeUndefined();
   });
});
