/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Accessible-name regression test for QuestionBuilder's "Visibility logic"
 * conditional switch (Task 3.6). `QuestionBuilder.tsx:346` (`req-${id}`) is a
 * known false positive — it already has a matching `id`/`htmlFor` pair — and
 * is deliberately left untouched by this task.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import QuestionBuilder from './QuestionBuilder';
import { renderWithStore } from '@/test-utils/renderWithStore';

describe('QuestionBuilder - conditional logic switch accessible name (Task 3.6)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: weak typing for test utility
    const renderBuilder = (initialStateOverrides: any = {}) => {
        const mergedDraft = {
            slug: 'test',
            state: 'draft',
            postsort_config: {
                questions: {
                    q1: { type: 'text', label: 'First question', required: false },
                    q2: { type: 'text', label: 'Second question', required: false },
                },
            },
            ...(initialStateOverrides.draft || {}),
        };

        return renderWithStore(<QuestionBuilder type="post" />, {
            initialState: {
                ...initialStateOverrides,
                draft: mergedDraft,
                activeLocale: 'en',
            },
        });
    };

    it('names the conditional-logic switch on a question that has a prior question to depend on', async () => {
        const user = userEvent.setup();
        renderBuilder();

        // q2 is the second question — it has q1 as an available "depends on"
        // target, so its accordion content renders the visibility-logic switch.
        const secondItemText = await screen.findByText('Second question');
        const secondItem = secondItemText.closest('[data-testid="question-item"]');
        if (!secondItem) throw new Error('question item not found');

        const trigger = within(secondItem as HTMLElement).getByTestId('question-accordion-trigger');
        await user.click(trigger);

        const scope = within(secondItem as HTMLElement);
        // getByRole computes the real accessible name — an unnamed switch
        // will not match, even though the "Required" switch in the same
        // item (req-${id}, a known-good pairing) is right next to it.
        expect(scope.getByRole('switch', { name: /visibility logic/i })).toBeInTheDocument();
    });
});

/**
 * Accessible-name regression test for the "Enable pre-sort survey" switch
 * (coordinator-requested closing sweep). Same defect class as the rest of
 * Task 3.6, on the `type === 'pre'` branch (Pre-sort tab) rather than the
 * Post-sort page: a sibling `Label` with no `htmlFor`, a `Switch` with no
 * `id`/`aria-label`.
 */
describe('QuestionBuilder - presort-toggle accessible name (Task 3.6 closing sweep)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: weak typing for test utility
    const renderPresortBuilder = (initialStateOverrides: any = {}) => {
        const mergedDraft = {
            slug: 'test',
            state: 'draft',
            presort_config: {},
            ...(initialStateOverrides.draft || {}),
        };

        return renderWithStore(<QuestionBuilder type="pre" />, {
            initialState: {
                ...initialStateOverrides,
                draft: mergedDraft,
                activeLocale: 'en',
            },
        });
    };

    it('names the "Enable pre-sort survey" switch', () => {
        renderPresortBuilder();

        // getByRole computes the real accessible name — an unnamed switch
        // will not match even though it's on screen (the positive baseline
        // below proves that).
        expect(screen.getByRole('switch', { name: /enable pre-sort survey/i })).toBeInTheDocument();
    });

    it('renders exactly one switch on this tab (positive baseline)', () => {
        renderPresortBuilder();

        expect(screen.getAllByRole('switch')).toHaveLength(1);
    });
});
