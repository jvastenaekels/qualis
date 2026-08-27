/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useDroppable } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DroppableSlot from './DroppableSlot';

// Mock dnd-kit core
vi.mock('@dnd-kit/core', () => ({
    useDroppable: vi.fn(),
}));

describe('DroppableSlot', () => {
    it('renders empty slot styling', () => {
        vi.mocked(useDroppable).mockReturnValue({
            setNodeRef: vi.fn(),
            isOver: false,
            active: null,
            rect: { current: null },
            node: { current: null },
            over: null,
        });

        render(<DroppableSlot id="test-slot" />);

        const slot = screen.getByTestId('test-slot');
        // Empty slot default: border-dashed
        expect(slot.className).toContain('border-dashed');
        expect(slot).toBeEmptyDOMElement();
    });

    it('renders occupied slot styling', () => {
        vi.mocked(useDroppable).mockReturnValue({
            setNodeRef: vi.fn(),
            isOver: false,
            active: null,
            rect: { current: null },
            node: { current: null },
            over: null,
        });

        render(
            <DroppableSlot id="test-slot">
                <span>Occupied</span>
            </DroppableSlot>
        );

        const slot = screen.getByTestId('test-slot');
        // Occupied: border-transparent
        expect(slot.className).toContain('border-transparent');
        expect(screen.getByText('Occupied')).toBeTruthy();
    });

    it('renders hover state when isOver is true', () => {
        vi.mocked(useDroppable).mockReturnValue({
            setNodeRef: vi.fn(),
            isOver: true,
            active: null,
            rect: { current: null },
            node: { current: null },
            over: null,
        });

        render(<DroppableSlot id="test-slot" />);

        const slot = screen.getByTestId('test-slot');
        // Drag over: bg-indigo-50 border-indigo-300
        expect(slot.className).toContain('bg-indigo-50');
    });
});
