/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderWithProviders as render, screen } from '../../test-utils/test-utils';
import { useConfigStore } from '@/store/useConfigStore';
import { useResponseStore } from '@/store/useResponseStore';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
import { Step1_Feedback } from './Step1_Feedback';

/**
 * These render against the real `public/locales/en/participant.json` — the test
 * i18n instance imports it directly — so an assertion here is an assertion about
 * the string that actually ships.
 */

const GRID = [
    { score: -4, capacity: 1 },
    { score: 0, capacity: 1 },
    { score: 4, capacity: 1 },
];

const seed = () => {
    useConfigStore.setState({
        // biome-ignore lint/suspicious/noExplicitAny: partial study config, only the fields this component reads
        config: {
            grid_config: GRID,
            show_statement_codes: false,
            statements: [
                { id: 1, text: 'Burning wood for energy should not count as climate-neutral.' },
                { id: 2, text: 'Europe has enough sustainably-produced biomass.' },
            ],
            postsort_config: {
                extreme_columns: [-4, 4],
                allow_random_comments: false,
                missing_statements_enabled: false,
                audio: { enabled: false },
            },
            // biome-ignore lint/suspicious/noExplicitAny: see above
        } as any,
    });
    useResponseStore.setState({
        qsort: [
            { statementId: 1, col: 0, row: 0 },
            { statementId: 2, col: 2, row: 0 },
        ],
        postsort: { card_comments: {} },
        // biome-ignore lint/suspicious/noExplicitAny: partial response state
    } as any);
    usePlatformConfigStore.setState({ audioStorage: 'unavailable' });
};

describe('Step1_Feedback validation message', () => {
    beforeEach(seed);
    afterEach(cleanup);

    /**
     * The defect this guards: the message under a field that failed validation was
     * `post.extreme.min_chars` — "A few words are enough to help us understand the
     * context." That is encouragement, not an error. It named nothing that was
     * wrong, and a participant who left the box empty was told a short answer would
     * be fine. Identical in all nine locales, so no translation gate could see it:
     * the string was valid, it was simply the wrong string in that position.
     *
     * The real constraint is `comment.length >= 2` — effectively "write something" —
     * so the replacement says that and does not invent a character count.
     */
    it('tells the participant what is required instead of reassuring them about length', async () => {
        const user = userEvent.setup();
        render(<Step1_Feedback onNext={vi.fn()} />);

        await user.click(screen.getByTestId('postsort-step1-next-btn'));

        const alerts = await screen.findAllByRole('alert');
        const texts = alerts.map((a) => a.textContent ?? '');

        expect(texts.some((text) => /please explain your choice/i.test(text))).toBe(true);
        expect(texts.some((text) => /a few words are enough/i.test(text))).toBe(false);
    });

    /**
     * The message was a bare `<div>`, so a screen-reader user got no announcement at
     * all when submission was refused — the page simply did not advance.
     */
    it('announces the failure rather than only colouring it red', async () => {
        const user = userEvent.setup();
        render(<Step1_Feedback onNext={vi.fn()} />);

        expect(screen.queryAllByRole('alert')).toHaveLength(0);

        await user.click(screen.getByTestId('postsort-step1-next-btn'));

        expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    });

    /**
     * The encouraging copy is good — it just belongs under the label, before the
     * participant writes anything, not in red after they fail.
     */
    it('offers the reassurance up front, as a hint', () => {
        render(<Step1_Feedback onNext={vi.fn()} />);
        expect(screen.getAllByText(/a few words are enough/i).length).toBeGreaterThan(0);
    });

    /**
     * The four screens before this one paint their primary action with
     * `--brand-accent`, the colour a study owner sets. This one painted itself
     * indigo, so a rebranded study went green, green, green, green — then indigo
     * at the last step. `bg-indigo-600` was also written twice: once here in
     * `className`, once inherited from `Button`'s `default` variant.
     */
    it('carries the study brand colour, not a hard-coded indigo', () => {
        render(<Step1_Feedback onNext={vi.fn()} />);
        const next = screen.getByTestId('postsort-step1-next-btn');
        expect(next.className).not.toMatch(/bg-indigo-600/);
        expect(next.className).toMatch(/bg-\[var\(--brand-accent\)\]/);
    });

    it('does not block a participant who answered', async () => {
        const user = userEvent.setup();
        const onNext = vi.fn();
        render(<Step1_Feedback onNext={onNext} />);

        const boxes = screen.getAllByRole('textbox');
        for (const box of boxes) {
            await user.type(box, 'Because it matters to me.');
        }
        await user.click(screen.getByTestId('postsort-step1-next-btn'));

        expect(onNext).toHaveBeenCalled();
    });
});
