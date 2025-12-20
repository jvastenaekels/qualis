/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, act } from '@testing-library/react';
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

describe('GridSort Tips Auto-hide', () => {
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

    it('shows tips after 2 seconds and hides them when forcedTipsClosed is true', async () => {
        const { rerender } = render(
            <DndContext>
                <GridSort {...defaultProps} forcedTipsClosed={false} />
            </DndContext>
        );

        // Initially tips are not visible (delay is 2s)
        expect(screen.queryByText('fine.tips.extremes')).toBeNull();

        // Advance time by 2s
        await act(async () => {
            vi.advanceTimersByTime(2000);
        });

        // Now tips should be visible
        expect(screen.getByText('fine.tips.extremes')).toBeInTheDocument();
        expect(screen.getByText('fine.tips.vertical')).toBeInTheDocument();

        // Rerender with forcedTipsClosed=true
        await act(async () => {
            rerender(
                <DndContext>
                    <GridSort {...defaultProps} forcedTipsClosed={true} />
                </DndContext>
            );
        });

        // Advance timers for exit animation
        await act(async () => {
             vi.advanceTimersByTime(1000);
        });

        // Now tips should be hidden
        expect(screen.queryByTestId('tip-extremes')).toBeNull();
        expect(screen.queryByTestId('tip-vertical')).toBeNull();
    });
});
