/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi } from 'vitest';
import ReadingZone from './ReadingZone';
import { render, screen, setupStoreMocks } from '../test/test-utils';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key
    })
}));

vi.mock('../store/useUIStore', () => ({
    useUIStore: vi.fn()
}));

// Mock MethodologyTips to avoid timer logic in ReadingZone tests
vi.mock('./MethodologyTips', () => ({
    default: () => <div data-testid="methodology-tips">Methodology Tips</div>
}));

describe('ReadingZone', () => {
    it('renders methodology tips when no card is active', () => {
        setupStoreMocks({
            useUIStore: { hoveredCard: null, activeCard: null, selectedCard: null }
        });

        render(<ReadingZone variant="desktop" />);
        expect(screen.getByTestId('methodology-tips')).toBeInTheDocument();
    });

    it('renders hovered card text', () => {
        setupStoreMocks({
            useUIStore: { 
                hoveredCard: { id: 1, text: 'Hovered Card Text' }, 
                activeCard: null, 
                selectedCard: null 
            }
        });

        render(<ReadingZone variant="desktop" />);
        expect(screen.getByText('Hovered Card Text')).toBeInTheDocument();
        expect(screen.getByText('fine.toolbar.preview')).toBeInTheDocument();
    });

    it('prioritizes active card over hovered card', () => {
        setupStoreMocks({
            useUIStore: { 
                hoveredCard: { id: 1, text: 'Hovered Card' }, 
                activeCard: { id: 2, text: 'Active Card' }, 
                selectedCard: null 
            }
        });

        render(<ReadingZone variant="desktop" />);
        expect(screen.getByText('Active Card')).toBeInTheDocument();
        expect(screen.getByText('fine.workbench.active_card')).toBeInTheDocument();
    });

    it('renders selected card text', () => {
        setupStoreMocks({
            useUIStore: { 
                hoveredCard: null, 
                activeCard: null, 
                selectedCard: { id: 3, text: 'Selected Card' } 
            }
        });

        render(<ReadingZone variant="desktop" />);
        expect(screen.getByText('Selected Card')).toBeInTheDocument();
    });
});
