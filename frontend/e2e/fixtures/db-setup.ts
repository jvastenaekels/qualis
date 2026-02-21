import { test as base } from '@playwright/test';
import { testDataBuilders, type StudyData } from './test-data';
import { WelcomePage } from '../pages/WelcomePage';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';
import { RoughSortPage } from '../pages/RoughSortPage';
import { FineSortPage } from '../pages/FineSortPage';

type StudyStep = 'welcome' | 'consent' | 'presort' | 'rough-sort' | 'fine-sort' | 'post-sort';

// biome-ignore lint/suspicious/noExplicitAny: study response from API has dynamic shape
type StudyResponse = Record<string, any>;

interface StudyNavigation {
    /** Create a study and navigate a participant to the given step */
    navigateToStep(
        step: StudyStep,
        studyOverrides?: Partial<StudyData>
    ): Promise<{ slug: string; study: StudyResponse }>;
}

/**
 * Test Database Manager
 * Handles database setup, cleanup, and seeding for E2E tests
 */
export class TestDatabase {
    private baseUrl: string;

    constructor() {
        this.baseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:8000';
    }

    /**
     * Helper: Fetch with retry logic for transient errors (ECONNREFUSED, etc.)
     */
    private async fetchWithRetry(
        url: string,
        options: RequestInit = {},
        retries = 5,
        backoff = 1000
    ): Promise<Response> {
        for (let i = 0; i < retries; i++) {
            try {
                // @ts-expect-error
                const response = await fetch(url, options);
                return response;
            } catch (error: any) {
                // Retry on connection refused or generic fetch failing (which might be network)
                const isConnectionError =
                    error.code === 'ECONNREFUSED' ||
                    error.cause?.code === 'ECONNREFUSED' ||
                    error.message.includes('fetch failed');

                if (i === retries - 1 || !isConnectionError) {
                    throw error;
                }

                console.log(
                    `[TestDatabase] Fetch failed to ${url} (attempt ${i + 1}/${retries}), retrying in ${backoff}ms... Error: ${error.message}`
                );
                await new Promise((resolve) => setTimeout(resolve, backoff));
                backoff *= 1.5; // Exponential backoff
            }
        }
        throw new Error(`Failed to fetch ${url} after ${retries} retries`);
    }

    getUserEmail() {
        if (!this.uniqueUserEmail) {
            throw new Error('Test user not initialized');
        }
        return this.uniqueUserEmail;
    }

    /**
     * Helper to log in via UI
     */
    async loginToAdminUI(page: any) {
        if (!this.uniqueUserEmail || !this.userId || !this.workspaceId) {
            throw new Error('Test user not initialized');
        }

        const token = await this.login();

        await page.addInitScript(
            ({ token, user, workspace }) => {
                window.sessionStorage.setItem(
                    'admin-auth-storage',
                    JSON.stringify({
                        state: {
                            token: token,
                            user: user,
                            workspaces: [workspace],
                            currentWorkspace: workspace,
                        },
                        version: 1,
                    })
                );
            },
            {
                token,
                user: {
                    id: this.userId,
                    email: this.uniqueUserEmail,
                    is_superuser: true,
                },
                workspace: {
                    id: this.workspaceId,
                    slug: this.currentWorkspaceSlug,
                    title: `Test Workspace ${this.userId}`, // Match seed logic roughly
                    user_role: 'owner',
                },
            }
        );

        await page.goto(`/app/${this.currentWorkspaceSlug}/dashboard`);
        await page.waitForURL(/\/app\//);
    }

    /**
     * Setup: Run migrations and seed base data
     */
    private uniqueUserEmail: string | undefined;
    private uniqueUserPass: string = 'testpassword';
    private workspaceId: number | undefined;
    private userId: number | undefined;
    private currentWorkspaceSlug: string | undefined;

    getWorkspaceSlug() {
        if (!this.currentWorkspaceSlug) {
            throw new Error('Workspace slug not initialized');
        }
        return this.currentWorkspaceSlug;
    }

    /**
     * Setup: Seed unique test data (user and workspace)
     */
    async setup() {
        // Generate unique test identity
        const testId = Date.now().toString() + Math.random().toString().slice(2, 6);
        this.uniqueUserEmail = `test-${testId}@example.com`;

        await this.seedUniqueData(testId);
    }

    /**
     * Cleanup: Removed to prevent interfering with other parallel tests.
     * We rely on the "Add-Only" strategy where each test uses unique isolated data.
     * A global cleanup can be run at the end of the suite if needed.
     */
    async cleanup() {
        // No-op for per-test cleanup to ensure isolation
    }

    /**
     * Seed unique data: user and workspace for this specific test instance
     */
    private async seedUniqueData(testId: string) {
        try {
            const workspaceSlug = `workspace-${testId}`;
            const response = await this.fetchWithRetry(`${this.baseUrl}/api/test/seed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user: {
                        email: this.uniqueUserEmail,
                        password: this.uniqueUserPass,
                        is_superuser: true,
                    },
                    workspace: {
                        name: `Test Workspace ${testId}`,
                        slug: workspaceSlug,
                    },
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Seed failed: ${response.status} ${text}`);
            }

            const data = await response.json();
            this.workspaceId = data.workspace_id;
            this.userId = data.user_id;
            this.currentWorkspaceSlug = workspaceSlug;
        } catch (error) {
            console.error('Failed to seed unique test data:', error);
            throw error;
        }
    }

    /**
     * Seed base data: admin user and workspace
     */
    /**
     * Login and get auth token
     */
    async login() {
        if (!this.uniqueUserEmail) {
            throw new Error('Test user not initialized. Did setup() run?');
        }
        const response = await this.fetchWithRetry(`${this.baseUrl}/api/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                username: this.uniqueUserEmail,
                password: this.uniqueUserPass,
            }),
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }

        const data = await response.json();
        return data.access_token;
    }

    /**
     * Create a study via API
     */
    async createStudy(token: string, config: Partial<StudyConfig>) {
        if (!this.workspaceId) {
            throw new Error('Workspace ID not initialized. Did setup() run?');
        }
        const cleanBaseUrl = this.baseUrl.replace(/\/$/, '');
        const response = await this.fetchWithRetry(`${cleanBaseUrl}/api/admin/studies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Workspace-ID': this.workspaceId.toString(),
            },
            body: JSON.stringify({
                workspace_id: this.workspaceId,
                slug: config.slug || `test-${Date.now()}`,
                translations: config.translations || [
                    {
                        language_code: 'en',
                        title: config.title || 'Test Study',
                        description: 'Test study description',
                        instructions: 'Test instructions',
                        objective: 'Test study objective',
                        condition_of_instruction: 'Condition of instruction',
                        consent_title: 'Informed Consent',
                        consent_description: 'Please read and accept the terms to proceed.',
                    },
                ],
                grid_config: config.grid_config || [],
                statements: config.statements || [],
                ...config,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Study Creation Failed:', error);
            throw new Error(`Failed to create study: ${error}`);
        }

        const study = await response.json();

        // Auto-activate if requested
        if (config.state === 'active') {
            await this.activateStudy(token, study.slug);
            study.state = 'active';
        }

        return study;
    }

    /**
     * Activate a study
     */
    async activateStudy(token: string, slug: string) {
        return this.updateStudyState(token, slug, 'active');
    }

    /**
     * Change study state
     */
    async updateStudyState(token: string, slug: string, newState: string) {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/admin/studies/${slug}/state?new_state=${newState}`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to change study state to ${newState}: ${error}`);
        }

        return response.json();
    }

    /**
     * Get study by slug
     */
    async getStudy(token: string, slug: string) {
        const response = await this.fetchWithRetry(`${this.baseUrl}/api/admin/studies/${slug}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            throw new Error(`Failed to get study: ${slug}`);
        }

        return response.json();
    }

    /**
     * Update study configuration
     */
    async updateStudy(token: string, slug: string, updates: Partial<any>) {
        const response = await this.fetchWithRetry(`${this.baseUrl}/api/admin/studies/${slug}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to update study: ${error}`);
        }

        return response.json();
    }

    /**
     * Create participant session and submit data
     */
    async createParticipant(_token: string, studySlug: string, overrides: any = {}) {
        // Generate a session token for this participant
        const sessionToken = crypto.randomUUID();

        // Fetch the public study config to get valid statement IDs
        const publicConfigRes = await this.fetchWithRetry(`${this.baseUrl}/api/study/${studySlug}`);
        if (!publicConfigRes.ok) {
            throw new Error(`Failed to fetch public study config: ${await publicConfigRes.text()}`);
        }
        const publicConfig = await publicConfigRes.json();
        const statements = publicConfig.statements || [];

        if (statements.length < 7) {
            // We need at least 7 statements for our mock qsort
            console.warn(
                `Warning: Study has only ${statements.length} statements, mock qsort might fail.`
            );
        }

        // Build qsort as list of QSortEntryInput objects using REAL statement IDs
        // Build qsort as list of QSortEntryInput objects using REAL statement IDs and grid limits
        const targetDist = publicConfig.grid_config || [];
        const scorePool: number[] = [];
        for (const col of targetDist) {
            for (let i = 0; i < col.capacity; i++) {
                scorePool.push(col.score);
            }
        }

        const qsortEntries =
            overrides.qsort ||
            statements.map((s: any, index: number) => {
                // Take score from pool, fallback to 0 if pool is exhausted (should not happen if counts match)
                const score = index < scorePool.length ? scorePool[index] : 0;
                return { statement_id: s.id, grid_score: score };
            });

        // Build a complete submission with the study's expected format
        const submission = {
            study_slug: studySlug,
            session_token: sessionToken,
            language_used: 'en',
            qsort: qsortEntries,
            presort_answers: overrides.presort_answers || {},
            postsort_answers: overrides.postsort_answers || {},
            status: 'completed',
            ...overrides,
        };

        const response = await this.fetchWithRetry(`${this.baseUrl}/api/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submission),
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Failed to submit participant data: ${txt}`);
        }
        const data = await response.json();
        return { ...data, session_token: sessionToken };
    }
}

/**
 * Extended Playwright test with database fixtures
 */
export const test = base.extend<{
    testDb: TestDatabase;
    authToken: string;
    studyNav: StudyNavigation;
}>({
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires object destructuring for fixtures
    testDb: async ({}, use) => {
        const db = new TestDatabase();
        await db.setup();
        await use(db);
        // await db.cleanup(); // DISABLED: Add-only strategy
    },

    authToken: async ({ testDb }, use) => {
        const token = await testDb.login();
        await use(token);
    },

    studyNav: async ({ page, testDb, authToken }, use) => {
        const nav: StudyNavigation = {
            async navigateToStep(step, studyOverrides = {}) {
                const defaults: Partial<StudyData> = {
                    statements: testDataBuilders.statements(6),
                    grid_config: [
                        { score: -1, capacity: 2 },
                        { score: 0, capacity: 2 },
                        { score: 1, capacity: 2 },
                    ],
                    presort_config: testDataBuilders.presortConfig({
                        age: testDataBuilders.presortField('number', 'Age', {
                            required: true,
                        }),
                        gender: testDataBuilders.presortField('select', 'Gender', {
                            required: true,
                            options: ['Male', 'Female'],
                        }),
                        education: testDataBuilders.presortField('select', 'Education', {
                            required: true,
                            options: ['High School', 'Bachelor'],
                        }),
                    }),
                    state: 'active',
                };

                const studyConfig = testDataBuilders.study({
                    ...defaults,
                    ...studyOverrides,
                });

                const study = (await testDb.createStudy(authToken, studyConfig)) as StudyResponse;

                const steps: StudyStep[] = [
                    'welcome',
                    'consent',
                    'presort',
                    'rough-sort',
                    'fine-sort',
                    'post-sort',
                ];
                const targetIndex = steps.indexOf(step);

                const welcomePage = new WelcomePage(page);
                await welcomePage.visit(study.slug);
                if (targetIndex === 0) return { slug: study.slug, study };

                await welcomePage.startStudy();
                const consentPage = new ConsentPage(page);
                await consentPage.waitForLoad();
                if (targetIndex === 1) return { slug: study.slug, study };

                await consentPage.acceptConsent();

                const hasPresort = studyConfig.presort_config?.enabled !== false;
                if (hasPresort) {
                    const preSortPage = new PreSortPage(page);
                    await preSortPage.waitForLoad();
                    if (targetIndex === 2) return { slug: study.slug, study };
                    await preSortPage.completePreSort();
                } else if (targetIndex === 2) {
                    return { slug: study.slug, study };
                }

                const totalCards = studyConfig.statements?.length ?? 6;
                const roughSortPage = new RoughSortPage(page);
                await roughSortPage.waitForLoad();
                if (targetIndex === 3) return { slug: study.slug, study };
                await roughSortPage.completeRoughSort(totalCards);

                const fineSortPage = new FineSortPage(page);
                await fineSortPage.waitForLoad();
                if (targetIndex === 4) return { slug: study.slug, study };

                await fineSortPage.completeFineSort();
                // post-sort
                return { slug: study.slug, study };
            },
        };
        await use(nav);
    },
});

export { expect } from '@playwright/test';

// Type definitions
interface StudyConfig {
    slug?: string;
    title?: string;
    state?: string;
    translations?: Array<{
        language_code: string;
        title: string;
        description?: string;
        instructions?: string;
        objective?: string;
        condition_of_instruction?: string;
        consent_title?: string;
        consent_description?: string;
    }>;
    grid_config?: Array<{ score: number; capacity: number }>;
    statements?: Array<{
        code: string;
        translations: Array<{ language_code: string; text: string }>;
    }>;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic config shape
    presort_config?: any;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic config shape
    postsort_config?: any;
}
