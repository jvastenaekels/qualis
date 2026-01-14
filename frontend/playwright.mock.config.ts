import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for headless E2E testing.
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",

  /* Maximum time one test can run for */
  timeout: 120 * 1000,

  expect: {
    timeout: 15000,
  },

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [["html", { open: "never" }], ["list"]],

  /* Shared settings for all projects */
  use: {
    /* Explicit headless mode */
    headless: true,

    /* Base URL for navigation */
    baseURL: "http://127.0.0.1:5173",

    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",

    /* Record video on first retry */
    video: "on-first-retry",

    /* Take screenshot only on failure */
    screenshot: "only-on-failure",

    /* Viewport for consistent testing */
    viewport: { width: 1280, height: 720 },

    /* Default timeout for each action (click, fill, etc.) */
    actionTimeout: 30000,
  },

  /* Configure projects for major browsers */
  /* On CI, only run Chromium and mobile-chrome to stay within timeout */
  /* Configure projects for major browsers */
  projects: [
    {
      name: "Admin E2E",
      testMatch: /.*admin\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Study E2E",
      testMatch: /.*study\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Mobile variants for Study only (typically Admin is desktop focused)
    {
      name: "Study Mobile Chrome",
      testMatch: /.*study\/.*\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
  ],

  /* Run local dev server before starting tests */
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
