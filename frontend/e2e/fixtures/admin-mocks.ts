import { type Page } from '@playwright/test';

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
    studiesStore = [];
    participantsStore = [];
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
    page.on('pageerror', (err) => console.error(`[Browser Error]: ${err.message}`));


    // Catch-all requests FIRST so specific routes override them (since Playwright checks in reverse order)

    // Catch-all for any other API requests (Strict check to avoid matching source files like /src/api/...)
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
        console.log(`[Mock Catch-All] Intercepting unmocked request: ${route.request().url()}`);
        await route.fulfill({ status: 200, json: {} });
    });

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
    await page.route('**/api/admin/studies', async (route) => {
        if (route.request().method() === 'POST') {
            const body = route.request().postDataJSON();
            const newStudy = {
                id: studiesStore.length + 1,
                slug: body.slug,
                title: body.title,
                state: 'draft',
                created_at: new Date().toISOString(),
                collaborators: [
                    { user_id: 1, role: 'owner', user: { email: MOCK_USER.email } },
                ],
                statements: [],
                grid_config: [],
                translations: [{ language_code: 'en', title: body.title }],
            };
            studiesStore.push(newStudy);
            await route.fulfill({ status: 201, json: newStudy });
        } else {
            await route.fulfill({ json: studiesStore });
        }
    });

    await page.route('**/api/admin/studies/*', async (route) => {
        const url = route.request().url();
        // Handle sub-resources manually since glob is broad
            if (url.includes('/state')) {
            const slug = url.match(/studies\/([\w-]+)\/state/)?.[1];
            const study = studiesStore.find((s) => s.slug === slug);
            if (!study) return route.fulfill({ status: 404 });

            const action = new URL(url).searchParams.get('action');
            if (action === 'activate') study.status = 'active';
            if (action === 'close') study.status = 'completed';
            return route.fulfill({ json: { ...study, state: study.status } });
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

        // Fallback: Get Single Study
        const slug = url.split('/').pop()?.split('?')[0];
        const study = studiesStore.find((s) => s.slug === slug);
        if (study) {
                return route.fulfill({ json: study });
        }

        return route.fulfill({ status: 404, body: 'Not Found in Mock' });
    });

}
