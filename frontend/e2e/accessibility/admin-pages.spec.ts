import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/db-setup';
import { gridConfig23, testDataBuilders } from '../fixtures/test-data';
import { expectNoA11yViolations } from './rules';

/**
 * E2E: admin accessibility smoke (task 6.7e)
 *
 * `public-pages.spec.ts` covers two pages that never carried an unnamed control or a
 * `text-slate-300` on white. The admin is where every defect in the 6.7 remediation
 * chain actually lived, and until this file it carried no axe coverage at all — task
 * 6.7a measured the backlog and named the gap; 6.7b-d and 6.7f cleared what the
 * static gate (`npm run lint:a11y`) can see. This file adds the runtime check that
 * sees the rest: axe computes the rendered accessible name, so it sees through Radix
 * `asChild`, resolves `<SelectValue>`, honours `display:none`, and computes real
 * contrast ratios instead of matching one banned class string.
 *
 * Run at two widths, not one. Task 6.7a found a control — the study designer's
 * language switcher — whose only visible text sits in a `hidden sm:inline` span:
 * named above the `sm` breakpoint (640px), nameless below it. A desktop-only axe run
 * cannot see that; `display:none` is a rendering fact axe evaluates live. That defect
 * is fixed in the same commit as this spec (StudyDesignPage.tsx) — this file is what
 * caught it.
 *
 * Coverage boundary — what a green run here does and does not prove:
 *   - Seven routes, matching the brief exactly: project dashboard, the concourse (its
 *     detail page — `ConcourseListPage` only ever auto-creates one and redirects to
 *     it, so there is nothing else to visit), and five study-scoped pages: design,
 *     access (recruitment), data, analysis, settings.
 *   - NOT covered: study overview (the study-scope landing page), data privacy,
 *     project settings, project members, account settings, the superuser admin-users
 *     page, create-project, participant detail, or any dialog/sheet/modal opened by
 *     interacting with these pages — axe only sees the DOM as first loaded.
 *   - Study design is audited in **draft** state, deliberately. An active, paused, or
 *     closed study opens a blocking `Dialog` on load (`isFullyReadOnly`); axe would
 *     then see only the dialog's own content, because Radix marks the rest of the
 *     page `aria-hidden` while a dialog is open. The QuestionBuilder /
 *     IntroductionEditor / BrandingEditor tree — where most of the 6.7a-c backlog
 *     lived — would go entirely unscanned in any other state.
 *   - Analysis is audited in its default **Explore** phase (scree plot + run button),
 *     the same state `analysis-workflow.spec.ts`'s smoke test renders. The Interpret
 *     phase (loadings/arrays/statements tabs) only exists after a run is committed;
 *     that spec exercises it functionally, but no axe pass covers it.
 *   - axe cannot see everything even on the pages it does visit. It will not flag a
 *     *named* control that should not be a tab stop at all — the Data table's seven
 *     status chips per row are exactly that case (task 6.7g): correctly named,
 *     axe-clean, and still up to 175 phantom tab stops on a full page. A rule that
 *     checks names cannot fail on a control that already has one.
 */

test.setTimeout(120_000);

const MOBILE_VIEWPORT = { width: 375, height: 800 };

/**
 * Every one of these pages wraps its content in Tailwind's `animate-in fade-in`
 * (`tailwindcss-animate`), typically `duration-500`/`duration-700`, sometimes nested
 * (a card inside the page's own fade-in animating a second time on top). Playwright's
 * `toBeVisible()` does not wait out a CSS transition — an element mid-fade already has
 * a bounding box and non-zero opacity, so it satisfies "visible" well before the
 * animation settles. axe's `color-contrast`, in contrast, reads the *actual* computed
 * opacity at scan time, so scanning mid-fade measures a foreground blended toward the
 * background and reports a spuriously low ratio for a color that is fine once settled
 * — confirmed by reproducing it: the same route audited with a generous fixed wait
 * instead of `waitReady()` alone comes back clean. `public-pages.spec.ts` already hits
 * this on the login page's fade-in and waits it out with a single
 * `toHaveCSS('opacity', '1')` on the one container that animates there; the admin
 * pages routinely animate several independent elements (the page shell, individual
 * `GuidanceCard`s, dashboard cards), so this waits out every `.animate-in` element
 * still short of full opacity instead of hardcoding one selector per route.
 */
async function waitForAnimationsToSettle(page: Page) {
    await page.waitForFunction(() => {
        const animating = document.querySelectorAll('.animate-in');
        return Array.from(animating).every((el) => getComputedStyle(el).opacity === '1');
    });
}

/**
 * Runs the smoke rule set at the project's default desktop viewport, then again at
 * 375px. `waitReady` is re-run after the resize (rather than a fixed sleep) because
 * the defect this spec exists to catch — a name that only exists above `sm` — only
 * disappears once the browser has actually reflowed at the new width; a locator wait
 * is the honest way to wait for that, a timeout would just be hoping it's enough.
 */
async function auditAtBothWidths(page: Page, waitReady: () => Promise<unknown>) {
    await waitReady();
    await waitForAnimationsToSettle(page);
    await expectNoA11yViolations(page);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await waitReady();
    await waitForAnimationsToSettle(page);
    await expectNoA11yViolations(page);
}

test.describe('Admin accessibility', () => {
    test('project dashboard', async ({ page, testDb, authToken }) => {
        await testDb.createStudy(
            authToken,
            testDataBuilders.study({ slug: `a11y-dash-${Date.now()}`, state: 'active' })
        );

        // loginToAdminUI navigates to /app/{slug}/dashboard itself.
        await testDb.loginToAdminUI(page);

        await auditAtBothWidths(page, async () => {
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            // The project title resolves before the studies list query does — wait
            // for the seeded study's own card (its default title, per
            // testDataBuilders.study) rather than just the page header, so the
            // scan covers the card content — where the study-state badge and
            // metadata row live — instead of racing ahead of it.
            await expect(page.getByText('Test Study')).toBeVisible();
        });
    });

    test('concourse detail', async ({ page, testDb, authToken }) => {
        // ConcourseListPage (the sidebar's "Concourse" link) has no content of its
        // own — it auto-creates the project's one concourse and redirects to its
        // detail page. Seeding it directly gives a deterministic URL instead of
        // depending on that client-side redirect's timing.
        const concourse = await testDb.createConcourse(authToken);
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${projectSlug}/concourses/${concourse.id}`);

        await auditAtBothWidths(page, () =>
            expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        );
    });

    test('study design (draft)', async ({ page, testDb, authToken }) => {
        // Draft, deliberately — see the file header. A non-draft study replaces the
        // whole editor with a blocking lock dialog on load, which would leave the
        // designer panels this suite most needs to reach entirely unscanned.
        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({ slug: `a11y-design-${Date.now()}` })
        )) as { slug: string };
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${projectSlug}/studies/${study.slug}/design`);

        await auditAtBothWidths(page, async () => {
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            // The control task 6.7a found nameless below `sm` — waiting on it also
            // means the toolbar (and not just the loading skeleton) is on screen.
            await expect(page.getByRole('button', { name: 'Select language' })).toBeVisible();
        });
    });

    test('access (recruitment)', async ({ page, testDb, authToken }) => {
        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                slug: `a11y-access-${Date.now()}`,
                statements: testDataBuilders.statements(23),
                grid_config: gridConfig23,
                state: 'active',
            })
        )) as { slug: string };
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${projectSlug}/studies/${study.slug}/recruitment`);

        await auditAtBothWidths(page, () =>
            expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        );
    });

    test('data', async ({ page, testDb, authToken }) => {
        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                slug: `a11y-data-${Date.now()}`,
                statements: testDataBuilders.statements(23),
                grid_config: gridConfig23,
                state: 'active',
            })
        )) as { slug: string };
        // A couple of real rows — the empty state and the populated table are
        // different DOM shapes, and the populated one is where the Data table's
        // status-chip cells (task 6.7g's target, not this task's) actually render.
        await Promise.all(
            Array.from({ length: 2 }, () =>
                testDb.createParticipant(
                    authToken,
                    study.slug,
                    testDataBuilders.participantResult({})
                )
            )
        );
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${projectSlug}/studies/${study.slug}/data`);

        // Anchored on the table, not a heading: DataExportsPage renders
        // StudyPageHeader's <h1> only in its zero-participant branch, so with
        // participants seeded (as here) a heading-based wait would time out
        // before axe ever runs — the table is the one thing guaranteed to exist
        // in this seeded state. (page-has-heading-one is still checked — by axe
        // itself, against the <h1> InteractiveDataView now provides; a locator
        // wait on it here would just be re-asserting what the scan below
        // already verifies.)
        await auditAtBothWidths(page, () => expect(page.locator('table')).toBeVisible());
    });

    test('analysis', async ({ page, testDb, authToken }) => {
        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                slug: `a11y-analysis-${Date.now()}`,
                statements: testDataBuilders.statements(23),
                grid_config: gridConfig23,
                state: 'active',
            })
        )) as { slug: string };
        // Enough completed sorts for eigenvalues to compute — matches the fixture
        // count analysis-workflow.spec.ts's own smoke test uses for the same reason.
        await Promise.all(
            Array.from({ length: 5 }, () =>
                testDb.createParticipant(
                    authToken,
                    study.slug,
                    testDataBuilders.participantResult({})
                )
            )
        );
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${projectSlug}/studies/${study.slug}/analysis`);

        await auditAtBothWidths(page, async () => {
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            await expect(page.locator('[aria-label*="Scree plot"]')).toBeVisible({
                timeout: 30_000,
            });
        });
    });

    test('study settings', async ({ page, testDb, authToken }) => {
        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({ slug: `a11y-settings-${Date.now()}` })
        )) as { slug: string };
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${projectSlug}/studies/${study.slug}/settings`);

        await auditAtBothWidths(page, () =>
            expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        );
    });
});
