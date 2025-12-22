/**
 * Shared E2E test fixtures for consistent mock data across tests.
 */

export const mockStudyConfig = {
  slug: 'e2e-test',
  title: 'E2E Test Study',
  description: 'A study for end-to-end testing',
  instructions: 'Please complete this study by following the on-screen instructions.',
  require_consent: true,
  consent_text: 'I consent to participate in this study.',
  require_code: false,
  available_languages: ['en'],
  statements: [
    { id: 1, text: 'Statement 1 - This is a test statement for E2E testing.' },
    { id: 2, text: 'Statement 2 - Another test statement with more content.' },
    { id: 3, text: 'Statement 3 - The final test statement for sorting.' },
  ],
  grid_config: [
    { score: -1, capacity: 1 },
    { score: 0, capacity: 1 },
    { score: 1, capacity: 1 },
  ],
  presort_config: {},
  postsort_config: {}
};

/**
 * Minimal study config for quick tests
 */
export const minimalStudyConfig = {
  slug: 'minimal-test',
  title: 'Minimal Test',
  description: 'Minimal test study',
  instructions: 'Test instructions',
  require_consent: true,
  consent_text: 'I consent.',
  require_code: false,
  available_languages: ['en'],
  statements: [
    { id: 1, text: 'Only statement' },
  ],
  grid_config: [
    { score: 0, capacity: 1 },
  ],
  presort_config: {},
  postsort_config: {}
};

/**
 * Setup API mocking for a study
 */
export async function mockStudyAPI(page: import('@playwright/test').Page, config = mockStudyConfig) {
  await page.route(`**/api/study/${config.slug}**`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(config)
    });
  });
}

/**
 * Setup submission API mocking
 */
export async function mockSubmitAPI(page: import('@playwright/test').Page) {
  await page.route('**/api/submit', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        confirmation_code: 'TEST-123-ABC'
      })
    });
  });
}
