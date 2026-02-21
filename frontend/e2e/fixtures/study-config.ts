/**
 * Mock study config used by error-handling tests that need to simulate
 * API error responses without a real backend.
 */
export const mockStudyConfig = {
    slug: 'e2e-test',
    title: 'E2E Test Study',
    subtitle: 'Exploring perspectives on Testing through Q-Methodology',
    description: 'A study for end-to-end testing',
    objective:
        'The goal of this study is to identify distinct viewpoints regarding testing automation.',
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
};
