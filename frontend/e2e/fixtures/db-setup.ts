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

    /**
     * Setup: Run migrations and seed base data
     */
    async setup() {
        // Backend should handle migrations on startup
        // Seed minimal required data (admin user, workspace)
        await this.seedBaseData();
    }

    /**
     * Cleanup: Truncate all tables except migrations
     */
    async cleanup() {
        try {
            // Call backend endpoint to cleanup test data
            await fetch(`${this.baseUrl}/api/test/cleanup`, {
                method: 'POST',
            });
        } catch (error) {
            console.warn('Database cleanup failed:', error);
        }
    }

    /**
     * Seed base data: admin user and workspace
     */
    private workspaceId: number | undefined;

    /**
     * Seed base data: admin user and workspace
     */
    private async seedBaseData() {
        try {
            const response = await fetch(`${this.baseUrl}/api/test/seed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user: {
                        email: 'test@example.com',
                        password: 'testpassword',
                        is_superuser: true,
                    },
                    workspace: {
                        name: 'Test Workspace',
                        slug: 'test-workspace',
                    },
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Seed failed: ${response.status} ${text}`);
            }

            const data = await response.json();
            this.workspaceId = data.workspace_id;
        } catch (error) {
            console.error('Failed to seed base data:', error);
            throw error;
        }
    }

    /**
     * Login and get auth token
     */
    async login(email: string = 'test@example.com', password: string = 'testpassword') {
        const response = await fetch(`${this.baseUrl}/api/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ username: email, password }),
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
            throw new Error('Workspace ID not initialized. Did seedBaseData run?');
        }
        const response = await fetch(`${this.baseUrl}/api/admin/studies/`, {
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
        await db.cleanup();
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
