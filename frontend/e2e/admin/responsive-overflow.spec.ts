import { expect, test, type Page, type Route } from '@playwright/test';

const project = {
    id: 1,
    title: 'Responsive Project',
    slug: 'responsive-project',
    created_at: '2026-05-11T00:00:00Z',
    member_quota: { count: 1, limit: 10 },
    user_role: 'owner',
};

const user = {
    id: 1,
    email: 'admin@example.com',
    full_name: 'Admin User',
    is_active: true,
    is_superuser: false,
    is_totp_enabled: false,
    owned_project_quota: { count: 1, limit: 10 },
};

const study = {
    id: 1,
    project_id: 1,
    slug: 'responsive-study',
    state: 'active',
    grid_config: [
        { score: -1, capacity: 1 },
        { score: 0, capacity: 1 },
        { score: 1, capacity: 1 },
    ],
    presort_config: {},
    postsort_config: {},
    branding: {},
    default_language: 'en',
    show_statement_codes: false,
    randomize_statement_order: false,
    symmetry_lock: false,
    rough_sort_enabled: true,
    distribution_mode: 'forced',
    data_retention_months: 24,
    created_at: '2026-05-11T00:00:00Z',
    updated_at: '2026-05-11T00:00:00Z',
    translations: [
        {
            language_code: 'en',
            title: 'Responsive Study',
            description: 'Responsive smoke test study',
            instructions: 'Sort the statements.',
            condition_of_instruction: 'Sort by agreement.',
            consent_title: 'Consent',
            consent_description: 'Consent text',
        },
    ],
    statements: [
        {
            id: 1,
            code: 'S1',
            translations: [{ language_code: 'en', text: 'Responsive statement' }],
        },
    ],
    recruitment_links: [],
    requires_password: false,
    participant_count: 1,
};

const stats = {
    started_count: 2,
    completed_count: 1,
    completion_rate: 0.5,
    median_duration_seconds: 240,
    device_breakdown: { desktop: 1, mobile: 1 },
};

const participants = {
    items: [
        {
            id: 1,
            study_id: 1,
            session_token: 'responsive-session-token',
            language_used: 'en',
            status: 'completed',
            created_at: '2026-05-11T00:00:00Z',
            submitted_at: '2026-05-11T00:05:00Z',
            is_discarded: false,
            discard_reason: null,
            user_agent: 'Playwright',
            last_step_reached: 5,
            last_step_reached_at: '2026-05-11T00:05:00Z',
            recruitment_token: null,
        },
    ],
    total: 1,
    limit: 50,
    offset: 0,
};

const studies = {
    items: [study],
    total: 1,
    limit: 50,
    offset: 0,
};

const projects = {
    items: [project],
    total: 1,
    limit: 50,
    offset: 0,
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
    await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
}

async function installApiMocks(page: Page) {
    await page.addInitScript(
        ({ token, user, project }) => {
            window.sessionStorage.setItem(
                'admin-auth-storage',
                JSON.stringify({
                    state: {
                        token,
                        user,
                        projects: [project],
                        currentProject: project,
                    },
                    version: 2,
                })
            );
        },
        { token: 'responsive-token', user, project }
    );

    await page.route('**/*', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;

        if (!pathname.startsWith('/api/')) {
            await route.continue();
            return;
        }

        if (request.method() === 'POST' && pathname === '/api/logs') {
            await fulfillJson(route, {});
            return;
        }

        if (request.method() !== 'GET') {
            await fulfillJson(route, { detail: `Unexpected ${request.method()} ${pathname}` }, 404);
            return;
        }

        switch (pathname) {
            case '/api/me':
                await fulfillJson(route, user);
                return;
            case '/api/admin/projects':
                await fulfillJson(route, projects);
                return;
            case '/api/admin/projects/responsive-project':
                await fulfillJson(route, project);
                return;
            case '/api/admin/studies':
                await fulfillJson(route, studies);
                return;
            case '/api/admin/studies/responsive-study':
                await fulfillJson(route, study);
                return;
            case '/api/admin/studies/responsive-study/stats':
                await fulfillJson(route, stats);
                return;
            case '/api/admin/studies/responsive-study/participants':
                await fulfillJson(route, participants);
                return;
            default:
                await fulfillJson(route, { detail: `Unhandled API route: ${pathname}` }, 404);
        }
    });
}

async function expectNoResponsiveOverflow(page: Page) {
    const result = await page.evaluate(() => {
        const overviewRegion = document.querySelector('main') ?? document;
        const visibleButtons = Array.from(overviewRegion.querySelectorAll('button')).filter(
            (button) => {
                const style = window.getComputedStyle(button);
                const rect = button.getBoundingClientRect();
                return (
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    rect.width > 0 &&
                    rect.height > 0
                );
            }
        );

        const clippedButtons = visibleButtons
            .filter(
                (button) =>
                    button.scrollWidth > button.clientWidth + 2 ||
                    button.scrollHeight > button.clientHeight + 2
            )
            .map((button) => ({
                text: button.textContent?.replace(/\s+/g, ' ').trim() || button.ariaLabel || '',
                scrollWidth: button.scrollWidth,
                clientWidth: button.clientWidth,
                scrollHeight: button.scrollHeight,
                clientHeight: button.clientHeight,
            }));

        return {
            viewportWidth: window.innerWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            clippedButtons,
        };
    });

    expect(result.documentScrollWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
    expect(result.clippedButtons).toEqual([]);
}

test.describe('admin overview responsive overflow', () => {
    for (const width of [320, 375, 768]) {
        test(`recruitment QR actions do not overflow at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await installApiMocks(page);

            await page.goto('/app/responsive-project/studies/responsive-study');

            const recruitmentModule = page.getByTestId('recruitment-module');
            await expect(recruitmentModule).toBeVisible();

            const recruitmentActions = page.getByTestId('recruitment-actions');
            await expect(recruitmentActions).toBeVisible();

            const showQrButton = recruitmentActions.getByRole('button', {
                name: /show qr/i,
            });
            const liveStudyButton = recruitmentActions.getByRole('button', {
                name: /live study/i,
            });

            await expect(showQrButton).toBeVisible();
            await expect(liveStudyButton).toBeVisible();
            await showQrButton.click();

            await expect(recruitmentModule.locator('#study-qr-code')).toBeVisible();
            await expect(
                recruitmentModule.getByRole('button', { name: /download image/i })
            ).toBeVisible();

            await expectNoResponsiveOverflow(page);

            const actionBoxes = await recruitmentActions.locator('button').evaluateAll((buttons) =>
                buttons.map((button) => {
                    const rect = button.getBoundingClientRect();
                    return {
                        text: button.textContent?.replace(/\s+/g, ' ').trim(),
                        x: rect.x,
                        right: rect.right,
                        width: rect.width,
                        height: rect.height,
                    };
                })
            );

            expect(actionBoxes).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ text: expect.stringMatching(/hide qr/i) }),
                    expect.objectContaining({
                        text: expect.stringMatching(/live study/i),
                    }),
                ])
            );

            for (const box of actionBoxes) {
                expect(box.width).toBeGreaterThan(0);
                expect(box.height).toBeGreaterThan(0);
                expect(box.x).toBeGreaterThanOrEqual(0);
                expect(box.right).toBeLessThanOrEqual(width + 1);
            }
        });
    }
});
