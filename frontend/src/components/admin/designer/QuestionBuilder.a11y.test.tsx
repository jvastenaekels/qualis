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

/**
 * Task 6.7b: the nine `noLabelWithoutControl` findings measured in this file
 * by task 6.7a. Seven are real Label/control pairings (each control given a
 * stable id derived from the question's own `id`); two ("Rating scale" and
 * "Options") headed a group of several fields rather than one control and
 * became plain text instead of a fake htmlFor pairing.
 */
describe('QuestionBuilder — question field accessible names (Task 6.7b)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: weak typing for test utility
    const renderBuilder = (initialStateOverrides: any = {}) => {
        const mergedDraft = {
            slug: 'test',
            state: 'draft',
            postsort_config: { questions: {} },
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

    const expandSecondQuestion = async (user: ReturnType<typeof userEvent.setup>) => {
        const secondItemText = await screen.findByText('Second question');
        const secondItem = secondItemText.closest('[data-testid="question-item"]');
        if (!secondItem) throw new Error('question item not found');
        const trigger = within(secondItem as HTMLElement).getByTestId('question-accordion-trigger');
        await user.click(trigger);
        return within(secondItem as HTMLElement);
    };

    it('names the "Question label" field and lets its label focus it', async () => {
        const user = userEvent.setup();
        renderBuilder({
            draft: {
                postsort_config: {
                    questions: {
                        q1: { type: 'text', label: 'First question', required: false },
                    },
                },
            },
        });

        const trigger = await screen.findByTestId('question-accordion-trigger');
        await user.click(trigger);

        const field = screen.getByRole('textbox', { name: /question label/i });
        await user.click(screen.getByText('Question label'));
        expect(field).toHaveFocus();
    });

    it('names the visibility-condition "depends on"/"operator"/"value" fields', async () => {
        const user = userEvent.setup();
        renderBuilder({
            draft: {
                postsort_config: {
                    questions: {
                        q1: { type: 'text', label: 'First question', required: false },
                        q2: {
                            type: 'text',
                            label: 'Second question',
                            required: false,
                            visibility_condition: {
                                depends_on: 'q1',
                                operator: 'equals',
                                value: 'x',
                            },
                        },
                    },
                },
            },
        });

        const scope = await expandSecondQuestion(user);

        // getByRole computes the real accessible name — a trigger named only
        // by its selected value ("First question"/"Equals") would still
        // satisfy a naive text query, so this is what actually distinguishes
        // "has a name" from "has the RIGHT name".
        expect(
            scope.getByRole('combobox', { name: /show this question only if/i })
        ).toBeInTheDocument();
        expect(scope.getByRole('combobox', { name: /^operator$/i })).toBeInTheDocument();
        expect(scope.getByRole('textbox', { name: /comparison value/i })).toBeInTheDocument();
    });

    it('names the rating-scale fields and renders "Rating scale" as a real heading', async () => {
        const user = userEvent.setup();
        renderBuilder({
            draft: {
                postsort_config: {
                    questions: {
                        q1: {
                            type: 'rating',
                            label: 'Satisfaction',
                            required: false,
                            scale_points: 5,
                        },
                    },
                },
            },
        });

        const trigger = await screen.findByTestId('question-accordion-trigger');
        await user.click(trigger);

        // "Rating scale" used to be a <Label> with no htmlFor at all, heading
        // the scale-points select and the Left/Right fields below it. Scoped
        // to <p>: the "add a rating field" button in the palette above is
        // also named "Rating scale" and is not part of this fix.
        const heading = screen.getByText('Rating scale', { selector: 'p' });
        expect(heading.tagName).not.toBe('LABEL');

        // The wrapper div now carries role="group" aria-labelledby={heading.id}
        // — getByRole resolves the group's real accessible name from that
        // association, not from the heading merely sitting nearby.
        expect(screen.getByRole('group', { name: 'Rating scale' })).toBeInTheDocument();

        expect(screen.getByRole('combobox', { name: /number of points/i })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /left endpoint label/i })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /right endpoint label/i })).toBeInTheDocument();
    });

    it('renders "Options" as a real, named heading over individually-named option fields (fix round 1)', async () => {
        const user = userEvent.setup();
        renderBuilder({
            draft: {
                postsort_config: {
                    questions: {
                        q1: {
                            type: 'select',
                            label: 'Pick one',
                            required: false,
                            options: ['Alpha', 'Beta'],
                        },
                    },
                },
            },
        });

        const trigger = await screen.findByTestId('question-accordion-trigger');
        await user.click(trigger);

        const heading = screen.getByText('Options');
        expect(heading.tagName).not.toBe('LABEL');
        expect(screen.getByRole('group', { name: 'Options' })).toBeInTheDocument();

        // The group name alone doesn't say WHICH option a given input is — a
        // screen-reader user editing the second option used to hear only
        // "edit text, Beta", indistinguishable from any other textbox on the
        // page. Each Input now carries its own ordinal aria-label, so
        // getByRole resolves it directly rather than falling back to
        // getByDisplayValue (which only proves the value rendered, not that
        // the field announces anything).
        expect(screen.getByRole('textbox', { name: 'Option 1' })).toHaveValue('Alpha');
        expect(screen.getByRole('textbox', { name: 'Option 2' })).toHaveValue('Beta');
    });
});

describe('QuestionBuilder — action-button accessible names (Task 6.7c)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: weak typing for test utility
    const renderBuilder = (initialStateOverrides: any = {}) => {
        const mergedDraft = {
            slug: 'test',
            state: 'draft',
            postsort_config: { questions: {} },
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

    it('discriminates the delete button by the question label', () => {
        renderBuilder({
            draft: {
                postsort_config: {
                    questions: {
                        q1: { type: 'text', label: 'First question', required: false },
                    },
                },
            },
        });

        expect(screen.getByRole('button', { name: 'Delete First question' })).toBeInTheDocument();
    });

    it('discriminates the "import from another language" trigger by the question label', () => {
        renderBuilder({
            draft: {
                translations: [{ language_code: 'en' }, { language_code: 'fr' }],
                postsort_config: {
                    questions: {
                        q1: { type: 'text', label: 'First question', required: false },
                    },
                },
            },
        });

        expect(
            screen.getByRole('button', {
                name: 'Import First question from another language',
            })
        ).toBeInTheDocument();
    });

    it('falls back to the item id when the question has no label yet', () => {
        renderBuilder({
            draft: {
                postsort_config: {
                    questions: {
                        q1: { type: 'text', label: '', required: false },
                    },
                },
            },
        });

        expect(screen.getByRole('button', { name: 'Delete q1' })).toBeInTheDocument();
    });

    it('discriminates the remove-option button by the option’s own ordinal', async () => {
        const user = userEvent.setup();
        renderBuilder({
            draft: {
                postsort_config: {
                    questions: {
                        q1: {
                            type: 'select',
                            label: 'Pick one',
                            required: false,
                            options: ['Alpha', 'Beta'],
                        },
                    },
                },
            },
        });

        const trigger = await screen.findByTestId('question-accordion-trigger');
        await user.click(trigger);

        expect(screen.getByRole('button', { name: 'Remove Option 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove Option 2' })).toBeInTheDocument();
    });
});
