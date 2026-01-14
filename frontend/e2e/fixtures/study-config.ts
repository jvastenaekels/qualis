/**
 * Shared E2E test fixtures for consistent mock data across tests.
 */

export const mockStudyConfig = {
  slug: "e2e-test",
  title: "E2E Test Study",
  subtitle: "Exploring perspectives on Testing through Q-Methodology",
  description: "A study for end-to-end testing",
  objective:
    "The goal of this study is to identify distinct viewpoints regarding testing automation.",
  instructions:
    "Please complete this study by following the on-screen instructions.",
  require_consent: true,
  consent_text: "I consent to participate in this study.",
  require_code: false,
  available_languages: ["en"],
  statements: [
    { id: 1, text: "Statement 1 - This is a test statement for E2E testing." },
    { id: 2, text: "Statement 2 - Another test statement with more content." },
    { id: 3, text: "Statement 3 - The final test statement for sorting." },
  ],
  grid_config: [
    { score: -1, capacity: 1 },
    { score: 0, capacity: 1 },
    { score: 1, capacity: 1 },
  ],
  presort_config: {
    age: {
      type: "number",
      label: { en: "Age", fr: "Âge", fi: "Ikä" },
      required: true,
      min: 18,
      max: 99,
    },
    gender: {
      type: "select",
      options: [
        { value: "Male", label: { en: "Male", fr: "Homme", fi: "Mies" } },
        { value: "Female", label: { en: "Female", fr: "Femme", fi: "Nainen" } },
        {
          value: "Non-binary",
          label: {
            en: "Non-binary",
            fr: "Non-binaire",
            fi: "Muunsukupuolinen",
          },
        },
        {
          value: "Prefer not to say",
          label: {
            en: "Prefer not to answer",
            fr: "Je préfère ne pas répondre",
            fi: "En halua vastata",
          },
        },
      ],
      label: { en: "Gender", fr: "Genre", fi: "Sukupuoli" },
      required: true,
    },
    education: {
      type: "select",
      options: [
        {
          value: "High School",
          label: {
            en: "High School / Secondary",
            fr: "Études secondaires",
            fi: "Toisen asteen koulutus",
          },
        },
        {
          value: "Bachelor",
          label: {
            en: "Bachelor's Degree",
            fr: "Licence / Bachelor",
            fi: "Kandidaatti (Bachelor)",
          },
        },
        {
          value: "Master",
          label: {
            en: "Master's Degree",
            fr: "Master / Maîtrise",
            fi: "Maisteri (Master)",
          },
        },
        {
          value: "PhD",
          label: { en: "PhD / Doctorate", fr: "Doctorat", fi: "Tohtori" },
        },
        { value: "Other", label: { en: "Other", fr: "Autre", fi: "Muu" } },
      ],
      label: {
        en: "Education Level",
        fr: "Niveau d'études",
        fi: "Koulutustaso",
      },
      required: true,
    },
  },
  postsort_config: {},
};

/**
 * Minimal study config for quick tests
 */
export const minimalStudyConfig = {
  slug: "minimal-test",
  title: "Minimal Test",
  description: "Minimal test study",
  instructions: "Test instructions",
  require_consent: true,
  consent_text: "I consent.",
  require_code: false,
  available_languages: ["en"],
  statements: [{ id: 1, text: "Only statement" }],
  grid_config: [{ score: 0, capacity: 1 }],
  presort_config: {},
  postsort_config: {},
};

/**
 * Setup API mocking for a study
 */
export async function mockStudyAPI(
  page: import("@playwright/test").Page,
  config = mockStudyConfig,
) {
  await page.route(`**/api/study/${config.slug}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config),
    });
  });

  // Mock generic logs to prevent proxy errors
  await page.route("**/api/logs", async (route) => {
    await route.fulfill({ status: 200, body: "{}" });
  });

  // Mock Consent Recording
  await page.route(`**/api/study/${config.slug}/consent`, async (route) => {
    await route.fulfill({ status: 200, body: "{}" });
  });
}

/**
 * Setup submission API mocking
 */
export async function mockSubmitAPI(page: import("@playwright/test").Page) {
  await page.route("**/api/submit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        confirmation_code: "TEST-123-ABC",
      }),
    });
  });

  // Valid for all tests using this fixture
  await page.route("**/api/study/*/consent", async (route) => {
    await route.fulfill({ status: 200, body: "{}" });
  });
}
