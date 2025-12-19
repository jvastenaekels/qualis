/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CardPile from './CardPile';

// Mock translations
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

// Mock SortableCard dependency
vi.mock('./SortableCard', () => ({
    default: ({ text }: { text: string }) => <div data-testid="sortable-card">{text}</div>,
}));

describe('CardPile', () => {
    
    it('renders empty state correctly', () => {
        render(<CardPile type="neutral" count={0} />);
        
        // Should show "all placed" placeholder
        expect(screen.getByLabelText('fine.deck.all_placed')).toBeTruthy();
        // Should have 0 badge
        expect(screen.getByLabelText('0 common.cards')).toBeTruthy();
    });

    it('renders populated stack with top card', () => {
        render(<CardPile type="agree" count={5} topCard={{ id: 1, text: 'Top Card' }} />);
        
        expect(screen.getByTestId('sortable-card')).toHaveTextContent('Top Card');
        expect(screen.getByLabelText('5 common.cards')).toBeTruthy();
        expect(screen.getByText('fine.legend.agree')).toBeTruthy();
    });

    it('renders different visual styles for pile types', () => {
        const { rerender } = render(<CardPile type="disagree" count={1} topCard={{ id: 2, text: 'Bad' }} />);
        expect(screen.getByText('fine.legend.disagree')).toBeTruthy();
        
        rerender(<CardPile type="agree" count={1} topCard={{ id: 3, text: 'Good' }} />);
        expect(screen.getByText('fine.legend.agree')).toBeTruthy();
    });
});
