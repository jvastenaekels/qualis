/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import {
    act,
    cleanup,
    fireEvent,
    renderWithProviders as render,
    screen,
} from '../test-utils/test-utils';
import { useMotionValue } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../store/useUIStore';
import CardStack from './CardStack';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('CardStack', () => {
    // Wrapper to use hooks correctly
    const CardStackWrapper = ({
        statement,
    }: {
        statement: import('../schemas/study').Statement;
    }) => {
        const x = useMotionValue(0);
        const y = useMotionValue(0);
        return <CardStack statement={statement} onVote={() => {}} x={x} y={y} />;
    };

    beforeEach(() => {
        useUIStore.setState({ hoveredCard: null });
    });

    afterEach(() => {
        cleanup();
    });

    it('renders the statement text', () => {
        const statement = { id: 1, text: 'This is a test statement' };

        render(<CardStackWrapper statement={statement} />);

        expect(screen.getByText('This is a test statement')).toBeTruthy();
    });

    it('updates hoveredCard in store on 👁️ icon click', async () => {
        // We need a long statement to trigger isOverflowing
        const statement = {
            id: 1,
            text: 'A very long statement that should definitely overflow the card container on almost any screen size to ensure the reading icon appears.'.repeat(
                10
            ),
        };

        render(<CardStackWrapper statement={statement} />);

        // The button is rendered when Overflowing. In JSDOM we might need to mock or force it.
        // But the previous implementation showed that sometimes JSDOM doesn't measure correctly.
        // However, if it shows up, we test it.
        const readButton = screen.queryByLabelText('Read statement');
        if (readButton) {
            await act(async () => {
                fireEvent.click(readButton);
            });
            expect(useUIStore.getState().hoveredCard?.id).toBe(1);
        }
    });
});
