import type { Page } from '@playwright/test';

export interface InjectSessionOptions {
    statementCount: number;
    step?: number;
    token?: string;
    statementIds?: number[];
}

export async function injectParticipantSession(page: Page, options: InjectSessionOptions) {
    const { statementCount, step = 5, token = '550e8400-e29b-41d4-a716-446655440000' } = options;

    // Mock Q-sort data with distributed IDs and column INDICES (0-6).
    // The frontend expects 'col' to be the index in grid_config, not the score itself.
    let colIndices: number[] = [];
    if (statementCount === 10) {
        // Capacities: 1-1-2-2-2-1-1 for indices 0 to 6 (scores -3 to 3)
        colIndices = [0, 1, 2, 2, 3, 3, 4, 4, 5, 6];
    } else if (statementCount === 23) {
        // Capacities: 2-3-4-5-4-3-2 for indices 0 to 6 (scores -3 to 3)
        colIndices = [
            ...Array(2).fill(0),
            ...Array(3).fill(1),
            ...Array(4).fill(2),
            ...Array(5).fill(3),
            ...Array(4).fill(4),
            ...Array(3).fill(5),
            ...Array(2).fill(6),
        ];
    } else {
        // Fallback: rotate indices 0-6
        colIndices = Array.from({ length: statementCount }, (_, i) => i % 7);
    }

    const qsort = Array.from({ length: statementCount }, (_, i) => {
        return {
            statementId: options.statementIds ? options.statementIds[i] : i + 1,
            col: colIndices[i],
            row: 0,
        };
    });

    // Mock card comments for validation
    const card_comments: Record<number, string> = {};
    const ids = options.statementIds || Array.from({ length: statementCount }, (_, i) => i + 1);
    for (const id of ids) {
        card_comments[id] = 'This is a mock comment for validation purposes.';
    }

    const responses = {
        state: {
            presort: {},
            rough: { agree: [], disagree: [], neutral: [], history: [] },
            qsort: qsort,
            postsort: {
                card_comments,
                missing_statement: '',
                general_comment: '',
                questions_answers: {},
            },
        },
        version: 1,
    };

    const session = {
        state: {
            token: token,
            hasConsented: true,
            currentStep: step,
            maxReachedStep: step,
            language: 'en',
            isCompleted: false,
            confirmationCode: null,
            isSaving: false,
            isPilotMode: false,
        },
        version: 1,
    };

    await page.addInitScript(
        ({ responses, session }) => {
            window.localStorage.setItem('open-q-responses', JSON.stringify(responses));
            window.localStorage.setItem('open-q-session', JSON.stringify(session));
        },
        { responses, session }
    );
}
