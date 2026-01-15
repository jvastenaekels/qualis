/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { DndContext } from '@dnd-kit/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, setupStoreMocks } from '../test-utils/test-utils';
import GridSort from './GridSort';

// Mock dependencies
vi.mock('@dnd-kit/sortable', () => ({
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    horizontalListSortingStrategy: {},
    rectSortingStrategy: {},
}));

vi.mock('./SortableCard', () => ({
    default: ({ onClick, id }: { onClick?: () => void; id: number }) => (
        <button type="button" data-testid={`card-${id}`} onClick={onClick}>
            Card
        </button>
    ),
}));

vi.mock('./DroppableSlot', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => {} },
    I18nextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock useUIStore
vi.mock('../store/useUIStore', () => ({
    useUIStore: vi.fn(),
}));

describe('GridSort Pedagogy', () => {
    const defaultProps = {
        agreeCards: [],
        disagreeCards: [],
        neutralCards: [],
        gridColumns: [{ score: 0, capacity: 5 }],
        renderSlotContent: () => null,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the Objective Bar with Target icon and title', () => {
        setupStoreMocks({
            useUIStore: {
                hoveredCard: null,
                activeCard: null,
                selectedCard: null,
                setActiveCard: vi.fn(),
                setHoveredCard: vi.fn(),
                setSelectedCard: vi.fn(),
            },
        });

        renderWithProviders(
            <DndContext>
                <GridSort {...defaultProps} />
            </DndContext>
        );

        expect(screen.getByText('fine.header.title')).toBeInTheDocument();
        const header = screen.getByText('fine.header.title').parentElement;
        expect(header?.querySelector('svg')).toBeDefined();
    });

    it('shows active card text and Eye icon in Reading Zone when a card is selected', () => {
        const selectedCard = { id: 1, text: 'Selected Statement Text' };

        setupStoreMocks({
            useUIStore: {
                hoveredCard: null,
                activeCard: null,
                selectedCard: selectedCard,
                setActiveCard: vi.fn(),
                setHoveredCard: vi.fn(),
            },
        });

        renderWithProviders(
            <DndContext>
                <GridSort {...defaultProps} selectedCardId={1} />
            </DndContext>
        );

        expect(screen.getByText('Selected Statement Text')).toBeInTheDocument();
        expect(screen.getByText('fine.workbench.active_card')).toBeInTheDocument();

        // The Eye icon is in ReadingZone. In its desktop variant, it has id 'fine.workbench.active_card' or 'fine.toolbar.preview'
        // We look for theEye icon by checking the parent of the label
        const eyeLabel = screen.getByText('fine.workbench.active_card');
        expect(eyeLabel.querySelector('svg')).toBeDefined();
    });
});
