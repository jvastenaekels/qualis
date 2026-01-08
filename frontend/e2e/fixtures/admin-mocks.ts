import type { Page } from '@playwright/test';

// MOCK DATA & STATE
export const MOCK_USER = {
    id: 1,
    email: 'admin@example.com',
    is_active: true,
    is_superuser: true,
};

let studiesStore: any[] = [];
let participantsStore: any[] = [];

export function resetStores() {
    studiesStore = [
        {
            id: 1,
            slug: 'example-study',
            title: 'Example Study',
            state: 'active',
            created_at: new Date().toISOString(),
            collaborators: [{ user_id: 1, role: 'owner', user: { email: MOCK_USER.email } }],
            statements: [
                { id: 1, text: 'Statement 1' },
                { id: 2, text: 'Statement 2' },
            ],
            grid_config: [],
            postsort_config: { questions: [], email_collection_enabled: false },
            translations: [{ language_code: 'en', title: 'Example Study' }],
        },
    ];
    participantsStore = [
        {
            id: 'p1',
            session_token: 'test-session-token-123',
            status: 'completed',
            is_completed: true,
            is_discarded: false,
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
            duration: 120,
            language_used: 'en',
            recruitment_token: 'direct',
        },
    ];
}

export function getParticipantsStore() {
    return participantsStore;
}

export async function setupAdminMocks(page: Page) {
    page.on('console', (msg) => {
        const text = msg.text();
        if (
            !text.includes('React Router Future Flag') &&
            !text.includes('Download the React DevTools')
        ) {
            console.log(`[Browser]: ${text}`);
        }
    });
    page.on('response', (resp) => {
        if (resp.status() === 404) {
            console.log(`[404] ${resp.url()}`);
        }
    });

    // Catch-all requests FIRST so specific routes override them (since Playwright checks in reverse order)

    // Catch-all for any other API requests (Strict check to avoid matching source files like /src/api/...)
    await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
            console.log(`[Mock Catch-All] ${route.request().method()} ${route.request().url()}`);
            await route.fulfill({ status: 200, json: [] });
        }
    );

    // Valid for all tests using this fixture
    await page.route(/\/api\/logs\/?/, async (route) => {
        await route.fulfill({ status: 204 });
    });

    // AUTH
    await page.route('**/api/token', async (route) => {
        await route.fulfill({ json: { access_token: 'valid-jwt', token_type: 'bearer' } });
    });
    await page.route('**/api/me', async (route) => {
        await route.fulfill({ json: MOCK_USER });
    });

    // STUDIES
    await page.route(/\/api\/admin\/studies(\/|\?|$)/, async (route) => {
        console.log(`[Mock] ${route.request().method()} ${route.request().url()}`);
        if (route.request().method() === 'POST') {
            const body = route.request().postDataJSON();
            const newStudy = {
                id: studiesStore.length + 1,
                slug: body.slug,
                title: body.title,
                state: 'draft',
                created_at: new Date().toISOString(),
                collaborators: [{ user_id: 1, role: 'owner', user: { email: MOCK_USER.email } }],
                statements: [],
                grid_config: [],
                postsort_config: { questions: [], email_collection_enabled: false },
                translations: [{ language_code: 'en', title: body.title }],
            };
            studiesStore.push(newStudy);
            await route.fulfill({ status: 201, json: newStudy });
        } else {
            await route.fulfill({ json: studiesStore });
        }
    });

    // WORKSPACES
    await page.route(/\/api\/admin\/workspaces(\/|\?|$)/, async (route) => {
        console.log(`[Mock Workspaces] ${route.request().method()} ${route.request().url()}`);
        await route.fulfill({
            json: [
                {
                    id: 1,
                    name: 'Example Workspace',
                    slug: 'example-workspace',
                    created_at: new Date().toISOString(),
                    role: 'owner',
                },
            ],
        });
    });

    await page.route(/\/api\/admin\/workspaces\/[a-zA-Z0-9_-]+\/members/, async (route) => {
        console.log(`[Mock Workspace Members] ${route.request().method()} ${route.request().url()}`);
        await route.fulfill({
            json: [
                {
                    user_id: 1,
                    role: 'owner',
                    workspace_id: 1,
                    user: MOCK_USER,
                },
            ],
        });
    });
    await page.route(/\/api\/admin\/studies\/[a-zA-Z0-9_-]+/, async (route) => {
        const url = route.request().url();
        console.log(`[Mock Single] ${route.request().method()} ${url}`);
        // Handle sub-resources manually since glob is broad
        if (url.includes('/state')) {
            const slug = url.match(/studies\/([\w-]+)\/state/)?.[1];
            const study = studiesStore.find((s) => s.slug === slug);
            if (!study) return route.fulfill({ status: 404 });

            const newState = new URL(url).searchParams.get('new_state');
            if (newState === 'active') study.state = 'active';
            if (newState === 'closed') study.state = 'closed';
            return route.fulfill({ json: study });
        }

        if (url.includes('/stats')) {
            const slug = url.match(/studies\/([\w-]+)\/stats/)?.[1];
            const study = studiesStore.find((s) => s.slug === slug);
            return route.fulfill({
                json: {
                    total_participants: participantsStore.length,
                    completed_participants: participantsStore.filter((p) => p.is_completed).length,
                    status: study?.status || 'draft',
                },
            });
        }

        if (url.includes('/participants')) {
            return route.fulfill({ json: participantsStore });
        }

        if (url.includes('/export/csv')) {
            return route.fulfill({ status: 200, contentType: 'text/csv', body: 'p1,s1,2' });
        }

        if (url.includes('/dump')) {
            const slug = url.match(/studies\/([\w-]+)\/dump/)?.[1];
            const study = studiesStore.find((s) => s.slug === slug);
            if (!study) return route.fulfill({ status: 404 });

            const dumpResponse = {
                study: {
                    slug: study.slug,
                    statements: study.statements.map((s: any) => ({
                        id: s.id,
                        translations: study.translations.map((t: any) => ({ lang: t.language_code, text: s.text })),
                    })),
                    translations: study.translations.map((t: any) => ({ lang: t.language_code, title: t.title })),
                    grid_config: study.grid_config,
                    postsort_config: study.postsort_config || { questions: [], email_collection_enabled: false },
                },
                participants: participantsStore.map((p) => ({
                    ...p,
                    scores: [],
                    placements: {},
                    presort: {},
                    postsort: { email: 'test@example.com', newsletter_consent: true, interview_consent: false },
                    discard_reason: null,
                })),
                statement_id_to_index: {},
            };
            return route.fulfill({ status: 200, json: dumpResponse });
        }

        // Fallback: Get Single Study
        const slug = url.split('/').pop()?.split('?')[0];
        const study = studiesStore.find((s) => s.slug === slug);
        if (study) {
            return route.fulfill({ json: study });
        }

        return route.fulfill({ status: 404, body: 'Not Found in Mock' });
    });
}
