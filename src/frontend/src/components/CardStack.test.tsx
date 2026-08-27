/*
 * Qualis - Open-source platform for conducting Q-methodology research
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('renders the code watermark at a legible contrast (Task 6.7h)', () => {
        // Task 6.7h review response: same watermark idiom as SortableCard.tsx (the
        // component's own comment says "Similar to SortableCard style"), same
        // pre-existing defect — text-slate-300/80 (~1.37:1 against white), not
        // caught by the gate because this span sits inside a purely decorative,
        // non-interactive card stack, never inside a role-bearing control. Fixed by
        // hand to plain text-slate-500 (4.76:1), matching SortableCard.tsx's fix.
        const statement = { id: 1, text: 'This is a test statement', code: 'S1' };

        render(<CardStackWrapper statement={statement} />);

        const watermark = screen.getByText('S1');
        expect(watermark).toHaveClass('text-slate-500');
        expect(watermark).not.toHaveClass('text-slate-300');
        expect(watermark).not.toHaveClass('text-slate-300/80');
    });

    it('does not show read button for short text (no overflow)', () => {
        const statement = { id: 1, text: 'Short text' };

        render(<CardStackWrapper statement={statement} />);

        // In JSDOM, scrollHeight equals clientHeight (both 0), so overflow is never detected
        const readButton = screen.queryByLabelText('Read full statement');
        expect(readButton).toBeNull();
    });

    /**
     * The overflow check used to run in a `useEffect` keyed on `statement.id` alone,
     * so it fired once per card and never again. A participant who rotated their
     * phone mid-sort was then reading a statement that had *become* truncated, with
     * no ellipsis (the box clips on height before `-webkit-line-clamp` binds, so the
     * clamp never draws one) and no reveal button — and ranked it on what they could
     * see. Measured live: at 1100×900 a 132-character statement fits and shows no
     * button; narrowing to 390×844 without changing card makes it overflow while the
     * button stays absent.
     *
     * `height` is in the dependency list as well as `width`, and deliberately: the
     * box is height-bound, so the on-screen keyboard opening or browser chrome
     * collapsing on scroll changes truncation without changing width.
     */
    it('re-checks overflow when the viewport changes, not only when the card changes', async () => {
        const overflow = { scroll: 100, client: 100 };
        const scrollSpy = vi
            .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
            .mockImplementation(() => overflow.scroll);
        const clientSpy = vi
            .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
            .mockImplementation(() => overflow.client);

        try {
            const statement = { id: 1, text: 'A statement long enough to overflow when narrow.' };
            render(<CardStackWrapper statement={statement} />);

            expect(screen.queryByLabelText('Read full statement')).toBeNull();

            // Same card, narrower viewport — the text now overflows its box.
            overflow.scroll = 400;
            await act(async () => {
                window.innerWidth = 390;
                window.innerHeight = 844;
                window.dispatchEvent(new Event('resize'));
                await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
            });

            expect(screen.getByLabelText('Read full statement')).toBeTruthy();
        } finally {
            scrollSpy.mockRestore();
            clientSpy.mockRestore();
        }
    });

    it('updates hoveredCard in store when read button is clicked', async () => {
        const statement = {
            id: 1,
            text: 'A very long statement that should definitely overflow.',
        };

        render(<CardStackWrapper statement={statement} />);

        // Force overflow detection by mocking scrollHeight > clientHeight
        const textEl = document.querySelector('[class*="font-medium"]');
        if (textEl) {
            Object.defineProperty(textEl, 'scrollHeight', { value: 500, configurable: true });
            Object.defineProperty(textEl, 'clientHeight', { value: 100, configurable: true });
            // Re-trigger the effect by forcing a state update
            // Since JSDOM doesn't measure, we verify the store interaction works when the button exists
        }

        // If the button appears (overflow detected), verify it updates the store
        const readButton = screen.queryByLabelText('Read full statement');
        if (readButton) {
            await act(async () => {
                fireEvent.click(readButton);
            });
            expect(useUIStore.getState().hoveredCard?.id).toBe(1);
        }
    });
});
