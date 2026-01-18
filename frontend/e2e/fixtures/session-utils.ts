import type { Page } from '@playwright/test';

export interface InjectSessionOptions {
    statementCount: number;
    step?: number;
    token?: string;
}

export async function injectParticipantSession(page: Page, options: InjectSessionOptions) {
    const { statementCount, step = 5, token = 'mock-session-token' } = options;

    // Mock Q-sort data with sequential IDs (1 to statementCount)
    // This satisfies the length check in PostSortPage.
    // Note: These IDs might not match real backend IDs, so card text might play "Unknown Card".
    const qsort = Array.from({ length: statementCount }, (_, i) => ({
        statementId: i + 1,
        col: 0,
        row: 0,
    }));

    const responses = {
        state: {
            presort: {},
            rough: { agree: [], disagree: [], neutral: [], history: [] },
            qsort: qsort,
            postsort: {
                card_comments: {},
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
