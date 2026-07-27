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
        {
            name: 'Participant E2E',
            testMatch: /participant\/.*\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'Accessibility Smoke',
            testMatch: /accessibility\/.*\.spec\.ts/,
            use: {
                ...devices['Desktop Chrome'],
                /*
                 * Audit as a reduced-motion user sees the page (task 6.7e). Every admin
                 * route wraps its content in a `tailwindcss-animate` entry fade
                 * (`animate-in fade-in …`); axe's `color-contrast` reads the actual
                 * computed opacity at scan time, so a scan that lands mid-fade measures a
                 * foreground blended toward the background and reports a spuriously low
                 * ratio for a color that is fine once settled. Investigation
                 * (task-6.7e-animation-investigation.md) measured this directly: on the
                 * worst route (study design, desktop) the committed spec's own
                 * `waitForAnimationsToSettle()` still let axe run at ancestor opacity
                 * 0.00, reporting 24 `color-contrast` violations; `reducedMotion: 'reduce'`
                 * collapses that to 1 (the one real failure), matching the settled ground
                 * truth exactly — deterministic (no polling race) and faster than waiting.
                 * `src/index.css:209` already honours `prefers-reduced-motion`, so this
                 * does not hide anything a real user with that OS preference would not
                 * also see; it does not conceal a defect (no palette survives opacity 0 —
                 * `text-slate-900` measures 4.35:1 mid-fade — so no color change could fix
                 * this, confirming the artifact is in the scan timing, not the tokens).
                 */
                reducedMotion: 'reduce',
            },
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
            stdout: 'pipe',
            stderr: 'pipe',
            env: {
                VITE_API_URL: 'http://127.0.0.1:8000',
            },
        },
    ],
});
