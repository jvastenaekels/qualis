/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GridSort from './GridSort';
import { DndContext } from '@dnd-kit/core';

// Mock dependencies
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  horizontalListSortingStrategy: {},
  rectSortingStrategy: {},
}));

vi.mock('./SortableCard', () => ({
  default: () => <div data-testid="card">Card</div>
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

describe('GridSort Tips', () => {
    const defaultProps = {
        agreeCards: [],
        disagreeCards: [],
        neutralCards: [],
        gridColumns: [{ score: 0, capacity: 5 }],
        renderSlotContent: () => null,
    };

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows extremes tip immediately, vertical tip after 5s', async () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} forcedTipsClosed={false} />
            </DndContext>
        );

        // Extremes tip should be visible immediately
        expect(screen.getByText('fine.tips.extremes')).toBeInTheDocument();
        
        // Vertical tip should NOT be visible yet (staggered)
        expect(screen.queryByText('fine.tips.vertical')).toBeNull();

        // Advance time by 5s (fallback timer for vertical tip)
        await act(async () => {
            vi.advanceTimersByTime(5000);
        });

        // Now vertical tip should also be visible
        expect(screen.getByText('fine.tips.vertical')).toBeInTheDocument();
    });

    it('hides tips when forcedTipsClosed is true', async () => {
        const { rerender } = render(
            <DndContext>
                <GridSort {...defaultProps} forcedTipsClosed={false} />
            </DndContext>
        );

        // Extremes tip visible
        expect(screen.getByText('fine.tips.extremes')).toBeInTheDocument();

        // Rerender with forcedTipsClosed=true
        await act(async () => {
            rerender(
                <DndContext>
                    <GridSort {...defaultProps} forcedTipsClosed={true} />
                </DndContext>
            );
        });

        // Tips should be hidden
        expect(screen.queryByText('fine.tips.extremes')).toBeNull();
    });

    it('shows vertical tip 1s after extremes tip is closed', async () => {
        render(
            <DndContext>
                <GridSort {...defaultProps} forcedTipsClosed={false} />
            </DndContext>
        );

        // Extremes tip visible
        expect(screen.getByText('fine.tips.extremes')).toBeInTheDocument();
        expect(screen.queryByText('fine.tips.vertical')).toBeNull();

        // Close extremes tip by clicking X button
        const closeBtn = screen.getByText('fine.tips.extremes').closest('div')?.querySelector('button');
        if (closeBtn) fireEvent.click(closeBtn);

        // Wait 1s for vertical tip to appear
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        // Vertical tip should now be visible
        expect(screen.getByText('fine.tips.vertical')).toBeInTheDocument();
    });
});
