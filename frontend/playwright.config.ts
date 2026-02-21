import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing with real backend
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './e2e',

    /* Maximum time one test can run for */
    timeout: 60 * 1000,

    expect: {
        timeout: 10000,
    },

    /* Run tests in files in parallel */
    fullyParallel: true,

    /* Fail the build on CI if you accidentally left test.only in the source code */
    forbidOnly: !!process.env.CI,

    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,

    /* Fully parallel tests - Add-only strategy prevents conflicts */
    workers: undefined,

    /* Reporter to use */
    reporter: [['html', { open: 'never' }], ['list']],

    /* Global setup and teardown for real backend testing */
    globalSetup: './e2e/fixtures/global-setup.ts',
    globalTeardown: './e2e/fixtures/global-teardown.ts',

    /* Shared settings for all projects */
    use: {
        /* Explicit headless mode */
        headless: true,

        /* Base URL for navigation */
        baseURL: 'http://localhost:5173',

        /* Collect trace when retrying the failed test */
        trace: 'on-first-retry',

        /* Record video on first retry */
        video: 'on-first-retry',

        /* Take screenshot only on failure */
        screenshot: 'only-on-failure',

        /* Viewport for consistent testing */
        viewport: { width: 1280, height: 720 },

        /* Default timeout for each action (click, fill, etc.) */
        actionTimeout: 30000,
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'Admin E2E',
            testMatch: /admin\/.*\.spec\.ts/,
            testIgnore: /admin\/configuration\/.*\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'Admin Config Tests',
            testMatch: /admin\/configuration\/.*\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'Integration Tests',
            testMatch: /integration\/.*\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'Study E2E',
            testMatch: /study\/.*\.spec\.ts/,
            testIgnore: /study\/mobile-ux\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'Study Mobile',
            testMatch: /study\/mobile-ux\.spec\.ts/,
            use: { ...devices['Pixel 5'] },
        },
    ],

    /* Run both frontend and backend servers before starting tests */
    webServer: [
        {
            command: 'cd ../backend && TESTING=true uv run uvicorn app.main:app --port 8000',
            url: 'http://127.0.0.1:8000/health',
            reuseExistingServer: true,
            timeout: 120 * 1000,
            stdout: 'pipe',
            stderr: 'pipe',
            env: {
                TESTING: 'true',
            },
        },
        {
            command: 'npm run dev -- --host localhost',
            url: 'http://localhost:5173',
            reuseExistingServer: true,
            timeout: 120 * 1000,
            env: {
                VITE_API_URL: 'http://127.0.0.1:8000',
            },
        },
    ],
});
