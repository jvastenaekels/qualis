/**
 * E2E: Admin Q-method factor-analysis workflow
 *
 * Resolves audit finding F-04-006 (major, SoftwareX-tagged).
 * Covers the scientifically central feature path:
 *   navigate → run analysis → verify all 4 result regions render
 *   → verify AnalysisRun history captures the run → history navigation.
 */

import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders, gridConfig23 } from '../fixtures/test-data';

// Analysis can be CPU-bound on a fresh DB — give it room
test.setTimeout(120_000);

// -------------------------------------------------------------------------
// Test 1 — Full happy-path: seed study + 8 participants, run analysis,
//           verify all four result regions, check history sidebar captures
//           the run, test history navigation.
// -------------------------------------------------------------------------
test('full analysis workflow: run → results → history', async ({ page, testDb, authToken }) => {
    const workspaceSlug = testDb.getWorkspaceSlug();

    // --- Setup: active study with 8 completed Q-sort participants ---
    const study = (await testDb.createStudy(
        authToken,
        testDataBuilders.study({
            slug: `analysis-wf-${Date.now()}`,
            statements: testDataBuilders.statements(23),
            grid_config: gridConfig23,
            state: 'active',
        })
    )) as { slug: string };
    const studySlug = study.slug;

    // Create 8 participants — enough for a stable 2-factor solution
    await Promise.all(
        Array.from({ length: 8 }, () =>
            testDb.createParticipant(authToken, studySlug, testDataBuilders.participantResult({}))
        )
    );

    await testDb.loginToAdminUI(page);

    // Navigate directly to the Analysis page
    await page.goto(`/app/${workspaceSlug}/studies/${studySlug}/analysis`);
    await expect(page).toHaveURL(/analysis/);

    // -----------------------------------------------------------------------
    // 1. Wait for the eigenvalue scree plot to load (confirms backend has data)
    // -----------------------------------------------------------------------
    // The scree plot renders a Recharts BarChart with an aria-label once eigenvalues load
    const screePlotRegion = page.locator('[aria-label*="Scree plot"]');
    await expect(screePlotRegion).toBeVisible({ timeout: 30_000 });

    // The Kaiser-criterion suggestion line appears when eigenvalues are ready
    await expect(page.getByText(/factor.*eigenvalue.*above 1|kaiser/i).first()).toBeVisible({
        timeout: 15_000,
    });

    // -----------------------------------------------------------------------
    // 2. Open the "Advanced configuration" accordion (the form controls live
    //    inside it since Phase 3) then set n_factors = 2 via the Select.
    //    Use role=combobox to avoid ambiguity with the scree plot aria-labels.
    // -----------------------------------------------------------------------
    const advancedTrigger = page.getByRole('button', { name: /advanced configuration/i });
    await expect(advancedTrigger).toBeVisible({ timeout: 10_000 });
    await advancedTrigger.click();

    const factorsSelect = page.getByRole('combobox', { name: /factors/i });
    await expect(factorsSelect).toBeEnabled({ timeout: 10_000 });
    await factorsSelect.click();
    // Pick "2" from the dropdown options
    const option2 = page.getByRole('option', { name: '2' });
    if (await option2.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await option2.click();
    }

    // -----------------------------------------------------------------------
    // 3. Click "Commit and interpret" and wait for results
    // -----------------------------------------------------------------------
    const runButton = page.getByRole('button', { name: /commit and interpret/i });
    await expect(runButton).toBeEnabled({ timeout: 10_000 });
    await runButton.click();

    // The button stays disabled while the analysis runs (spinner replaces icon).
    await expect(runButton).toBeDisabled({ timeout: 5_000 });

    // Wait for the Interpret phase to render. After Phase 4, the page lands
    // on Focus mode by default (FactorCanvas with F1/F2/F3 chips). Switch to
    // Overview mode so the legacy four tabs (loadings/arrays/statements/
    // summary) become visible — that's the surface this E2E exercises.
    const overviewToggle = page.getByRole('button', { name: /^overview$/i });
    await expect(overviewToggle).toBeVisible({ timeout: 60_000 });
    await overviewToggle.click();

    const loadingsTab = page.getByRole('tab', { name: /loadings/i });
    await expect(loadingsTab).toBeVisible({ timeout: 10_000 });

    // -----------------------------------------------------------------------
    // 4. Assert Region 1 — Factor Loadings table (default "Loadings" tab)
    // -----------------------------------------------------------------------
    // The table has a visually-hidden caption "Factor loadings per participant"
    const loadingsTable = page.getByRole('table', {
        name: /factor loadings per participant/i,
    });
    await expect(loadingsTable).toBeVisible({ timeout: 10_000 });

    // Should have at least one tbody row per participant
    const loadingsRows = loadingsTable.locator('tbody tr');
    await expect(loadingsRows.first()).toBeVisible();
    // Each row has numeric loading values (e.g. "+0.7123" format)
    const firstCell = loadingsRows.first().locator('td').nth(1); // first loading column
    await expect(firstCell).toBeVisible();
    const firstCellText = (await firstCell.textContent()) ?? '';
    // Loading values always start with + or - followed by digits
    expect(firstCellText).toMatch(/[+-]?\d+\.\d+/);

    // -----------------------------------------------------------------------
    // 5. Assert Region 2 — Factor Arrays tab
    // -----------------------------------------------------------------------
    const arraysTab = page.getByRole('tab', { name: /factor arrays/i });
    await expect(arraysTab).toBeVisible();
    await arraysTab.click();

    // Each factor renders a table with aria-label "Factor N composite sort"
    const factorArrayTable = page.getByRole('table', { name: /factor.*composite sort/i }).first();
    await expect(factorArrayTable).toBeVisible({ timeout: 10_000 });

    // There should be at least one statement code cell (format: S1, S2 …)
    const firstCodeCell = factorArrayTable.locator('span.font-mono').first();
    await expect(firstCodeCell).toBeVisible();

    // -----------------------------------------------------------------------
    // 6. Assert Region 3 — Summary / Factor Characteristics tab
    // -----------------------------------------------------------------------
    const summaryTab = page.getByRole('tab', { name: /summary/i });
    await expect(summaryTab).toBeVisible();
    await summaryTab.click();

    // FactorCharacteristicsTable renders "Factor Statistics" heading
    await expect(page.getByText('Factor Statistics')).toBeVisible({ timeout: 10_000 });

    // The table has a visually-hidden caption
    const charTable = page.getByRole('table', {
        name: /factor characteristics and reliability statistics/i,
    });
    await expect(charTable).toBeVisible();

    // With n_factors >= 2 the correlation matrix also appears
    await expect(page.getByText('Factor Correlations')).toBeVisible({ timeout: 5_000 });

    // -----------------------------------------------------------------------
    // 7. Assert Region 4 — Statements (distinguishing / consensus)
    // -----------------------------------------------------------------------
    const statementsTab = page.getByRole('tab', { name: /statements/i });
    await expect(statementsTab).toBeVisible();
    await statementsTab.click();

    // StatementsTable renders a table. Verify at least one row exists.
    // We look for any statement code (S1…) in a table
    const stmtTable = page.locator('table').filter({ hasText: /S\d+/ }).first();
    await expect(stmtTable).toBeVisible({ timeout: 10_000 });
    const stmtRows = stmtTable.locator('tbody tr');
    await expect(stmtRows.first()).toBeVisible();

    // -----------------------------------------------------------------------
    // 8. Assert Region 5 — FactorVoicesPanel (optional but good)
    //    Even without audio recordings the panel header must render.
    // -----------------------------------------------------------------------
    // Panels are rendered below the tabs, one per factor
    const voicesHeading = page
        .getByRole('heading', { name: /voices on factor 1/i })
        .or(page.getByText(/Voices on Factor 1/))
        .first();
    await expect(voicesHeading).toBeVisible({ timeout: 10_000 });

    // The "no audio" empty state is expected (no recordings in test data)
    await expect(page.getByText(/no post-sort audio recordings/i).first()).toBeVisible({
        timeout: 10_000,
    });

    // -----------------------------------------------------------------------
    // 9. Assert AnalysisRun history sidebar captured the run.
    //    Reload the page so the history panel fetches fresh data — the
    //    AnalysisHistoryPanel query is not auto-invalidated when a new run
    //    is posted from the same page instance.
    // -----------------------------------------------------------------------
    await page.reload();

    // After reload, navigate back to analysis page and wait for it to load
    await page.goto(`/app/${workspaceSlug}/studies/${studySlug}/analysis`);

    // Wait for eigenvalues to load (confirms the page is fully hydrated)
    await expect(page.locator('[aria-label*="Scree plot"]')).toBeVisible({ timeout: 30_000 });

    // The history panel header is always visible; expand it if collapsed
    const historyHeader = page.getByRole('button', { name: /analysis history/i });
    await expect(historyHeader).toBeVisible({ timeout: 10_000 });

    // Wait for at least one dated run entry in the panel body
    const runEntry = page
        .getByRole('button', {
            name: /load analysis run from/i,
        })
        .first();
    await expect(runEntry).toBeVisible({ timeout: 15_000 });

    // -----------------------------------------------------------------------
    // 10. Verify history persistence: click the run, see historical banner,
    //     then click "Back to current"
    // -----------------------------------------------------------------------
    await runEntry.click();

    // The historical-run amber banner should appear
    const historyBanner = page.getByText(/viewing run from/i).first();
    await expect(historyBanner).toBeVisible({ timeout: 15_000 });

    // Click "Back to current" to dismiss the banner
    const backButton = page.getByRole('button', { name: /back to current/i });
    await expect(backButton).toBeVisible();
    await backButton.click();

    // Banner must disappear after dismissal
    await expect(historyBanner).not.toBeVisible({ timeout: 10_000 });
});

// -------------------------------------------------------------------------
// Test 2 — Visual smoke test: Analysis page loads cleanly with data but
//           no previous analysis run (i.e., page renders without crashing).
//           This guards against import / SSR / API-wiring regressions.
// -------------------------------------------------------------------------
test('analysis page smoke: page renders with scree plot and run button', async ({
    page,
    testDb,
    authToken,
}) => {
    const workspaceSlug = testDb.getWorkspaceSlug();

    // Fresh study with participants but no analysis run yet
    const freshStudy = (await testDb.createStudy(
        authToken,
        testDataBuilders.study({
            slug: `analysis-smoke-${Date.now()}`,
            statements: testDataBuilders.statements(23),
            grid_config: gridConfig23,
            state: 'active',
        })
    )) as { slug: string };

    // Create a handful of participants
    await Promise.all(
        Array.from({ length: 5 }, () =>
            testDb.createParticipant(
                authToken,
                freshStudy.slug,
                testDataBuilders.participantResult({})
            )
        )
    );

    await testDb.loginToAdminUI(page);
    await page.goto(`/app/${workspaceSlug}/studies/${freshStudy.slug}/analysis`);

    // Page title region
    await expect(page.getByText(/analysis/i).first()).toBeVisible({ timeout: 15_000 });

    // "Commit and interpret" button appears once eigenvalues load
    const runBtn = page.getByRole('button', { name: /commit and interpret/i });
    await expect(runBtn).toBeEnabled({ timeout: 30_000 });

    // History panel shows the empty-state message (no runs yet)
    await expect(
        page
            .getByText(/no previous analyses for this study yet/i)
            .or(page.getByText(/run one to start the audit trail/i))
    ).toBeVisible({ timeout: 10_000 });
});
