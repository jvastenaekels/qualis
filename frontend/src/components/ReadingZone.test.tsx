/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, setupStoreMocks } from '../test/test-utils';
import ReadingZone from './ReadingZone';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('../store/useConfigStore', () => ({
    useConfigStore: vi.fn(),
}));

vi.mock('../store/useUIStore', () => ({
    useUIStore: vi.fn(),
}));

// Mock MethodologyTips to avoid timer logic in ReadingZone tests
vi.mock('./MethodologyTips', () => ({
    default: () => <div data-testid="methodology-tips">Methodology Tips</div>,
}));

describe('ReadingZone', () => {
    it('renders methodology tips when no card is active', () => {
        setupStoreMocks({
            useUIStore: { hoveredCard: null, activeCard: null, selectedCard: null },
        });

        render(<ReadingZone variant="desktop" />);
        expect(screen.getByTestId('methodology-tips')).toBeInTheDocument();
    });

    it('renders hovered card text', () => {
        setupStoreMocks({
            useUIStore: {
                hoveredCard: { id: 1, text: 'Hovered Card Text' },
                activeCard: null,
                selectedCard: null,
            },
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
                selectedCard: null,
            },
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
                selectedCard: { id: 3, text: 'Selected Card' },
            },
            useConfigStore: { config: { show_statement_codes: true } },
        });

        render(<ReadingZone variant="desktop" />);
        expect(screen.getByText('Selected Card')).toBeInTheDocument();
    });

    it('shows statement code when show_statement_codes is true', () => {
        setupStoreMocks({
            useUIStore: {
                hoveredCard: null,
                activeCard: { id: 1, text: 'Card with Code', code: 'CABS1' },
                selectedCard: null,
            },
            useConfigStore: { config: { show_statement_codes: true } },
        });

        render(<ReadingZone variant="desktop" />);
        expect(screen.getByText(/CABS1/)).toBeInTheDocument();
    });

    it('hides statement code when show_statement_codes is false', () => {
        setupStoreMocks({
            useUIStore: {
                hoveredCard: null,
                activeCard: { id: 1, text: 'Card with Code', code: 'CABS1' },
                selectedCard: null,
            },
            useConfigStore: { config: { show_statement_codes: false } },
        });

        render(<ReadingZone variant="desktop" />);
        expect(screen.queryByText('CABS1')).not.toBeInTheDocument();
    });

    it('shows scroll indicator when content overflows', () => {
        setupStoreMocks({
            useUIStore: {
                hoveredCard: { id: 1, text: 'Very long text that should overflow' },
                activeCard: null,
                selectedCard: null,
            },
            useConfigStore: { config: { show_statement_codes: true } },
        });

        // Mock scrollHeight and clientHeight
        // Note: JSDOM doesn't do real layout, so we must mock these
        const orgScrollHeight = Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            'scrollHeight'
        );
        const orgClientHeight = Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            'clientHeight'
        );

        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
            configurable: true,
            value: 200,
        });
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
            configurable: true,
            value: 100,
        });

        render(<ReadingZone variant="desktop" />);

        // The ScrollIndicator contains an svg with a specific path
        // We can look for the SVG or a container if we added a testid,
        // but for now let's hope the bounce arrow is unique enough or add a testid.
        // ReadingZone.tsx has: {hasOverflow && displayCard && <ScrollIndicator />}
        // ScrollIndicator has: <div className="animate-bounce opacity-50">

        const _svg = document.querySelector('svg animate-bounce'); // This won't work easily
        // Let's check for the presence of the indicator by its gradient class or SVG
        expect(document.querySelector('.bg-gradient-to-t')).toBeInTheDocument();

        // Cleanup
        if (orgScrollHeight)
            Object.defineProperty(HTMLElement.prototype, 'scrollHeight', orgScrollHeight);
        if (orgClientHeight)
            Object.defineProperty(HTMLElement.prototype, 'clientHeight', orgClientHeight);
    });
});
