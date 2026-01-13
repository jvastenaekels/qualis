import { test as base } from '@playwright/test';


/**
 * Test Database Manager
 * Handles database setup, cleanup, and seeding for E2E tests
 */
export class TestDatabase {
    private baseUrl: string;

    constructor() {
        this.baseUrl = process.env.API_BASE_URL || 'http://localhost:8000';
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

        await page.addInitScript(({ token, user, workspace }) => {
            window.localStorage.setItem('admin-auth-storage', JSON.stringify({
                state: {
                    token: token,
                    user: user,
                    workspaces: [workspace],
                    currentWorkspace: workspace,
                },
                version: 1,
            }));
        }, {
            token,
            user: { id: this.userId, email: this.uniqueUserEmail, is_superuser: true },
            workspace: {
                id: this.workspaceId,
                slug: this.currentWorkspaceSlug,
                title: `Test Workspace ${this.userId}`, // Match seed logic roughly
                user_role: 'owner'
            }
        });

        await page.goto('/admin');
        await page.waitForURL(/\/admin/);
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
            const response = await fetch(`${this.baseUrl}/api/test/seed`, {
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
        const response = await fetch(`${this.baseUrl}/api/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ username: this.uniqueUserEmail, password: this.uniqueUserPass }),
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
        const response = await fetch(`${cleanBaseUrl}/api/admin/studies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
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
        const response = await fetch(`${this.baseUrl}/api/admin/studies/${slug}/state?new_state=active`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to activate study: ${error}`);
        }

        return response.json();
    }

    /**
     * Get study by slug
     */
    async getStudy(token: string, slug: string) {
        const response = await fetch(`${this.baseUrl}/api/admin/studies/${slug}`, {
            headers: { 'Authorization': `Bearer ${token}` },
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
        const response = await fetch(`${this.baseUrl}/api/admin/studies/${slug}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
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
    async createParticipant(token: string, studySlug: string, overrides: any = {}) {
        // Generate a session token for this participant
        const sessionToken = crypto.randomUUID();

        // Fetch the public study config to get valid statement IDs
        const publicConfigRes = await fetch(`${this.baseUrl}/api/study/${studySlug}`);
        if (!publicConfigRes.ok) {
             throw new Error(`Failed to fetch public study config: ${await publicConfigRes.text()}`);
        }
        const publicConfig = await publicConfigRes.json();
        const statements = publicConfig.statements || [];

        if (statements.length < 7) {
            // We need at least 7 statements for our mock qsort
            console.warn(`Warning: Study has only ${statements.length} statements, mock qsort might fail.`);
        }

        // Build qsort as list of QSortEntryInput objects using REAL statement IDs
        const qsortEntries = overrides.qsort || statements.map((s: any, index: number) => {
            // Map first 7 statements to our distribution, others to 0 or ignored
            const scores = [-3, -2, -1, 0, 1, 2, 3];
            const score = index < scores.length ? scores[index] : 0;
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

        const response = await fetch(`${this.baseUrl}/api/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submission),
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Failed to submit participant data: ${txt}`);
        }
        return response.json();
    }
}

/**
 * Extended Playwright test with database fixtures
 */
export const test = base.extend<{
    testDb: TestDatabase;
    authToken: string;
}>({
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
});

export { expect } from '@playwright/test';

// Type definitions
interface StudyConfig {
    slug?: string;
    title?: string;
    translations?: Array<{
        language_code: string;
        title: string;
        description?: string;
        instructions?: string;
        objective?: string;
        condition_of_instruction?: string;
    }>;
    grid_config?: Array<{ score: number; capacity: number }>;
    statements?: Array<{ code: string; translations: Array<{ language_code: string; text: string }> }>;
    presort_config?: any;
    postsort_config?: any;
}
