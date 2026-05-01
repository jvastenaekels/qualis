/**
 * E2E: GDPR Art. 17 participant self-erasure (right to erasure)
 *
 * Quality roadmap Phase 4 item C — spec 4/4.
 * Tests the end-to-end erasure flow shipped in commit 8678466:
 *   - Participant navigates to the thank-you / post-sort success screen
 *   - Finds the "Right to erasure" section
 *   - Clicks "Request my data deletion"
 *   - Confirms in the AlertDialog
 *   - Sees the success toast and the "personal data has been removed" notice
 *   - Admin opens the data-inventory privacy page and sees anonymised = 1
 *
 * Strategy: We seed a completed participant via the API, capturing the
 * session_token. We then inject the correct Zustand-persist state into
 * localStorage using the exact key 'qualis-session' (version 2) that the
 * useSessionStore uses. This lets us jump straight to the post-sort success
 * screen without navigating the whole study flow.
 *
 * The StudyLayout loader fetches the public study config on navigation, which
 * satisfies the `if (!config) return null` guard in PostSortPage. After the
 * config loads, the page detects isCompleted=true and renders the success screen.
 */

import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders, gridConfig23 } from '../fixtures/test-data';

test.setTimeout(120_000);

test.describe
    .serial('GDPR Art. 17 self-erasure', () => {
        test('participant can erase their own data; admin privacy page reflects anonymised=1', async ({
            page,
            testDb,
            authToken,
            context,
        }) => {
            const workspaceSlug = testDb.getWorkspaceSlug();

            // ------------------------------------------------------------------ //
            // 1. Seed: active study + 1 completed participant                      //
            // ------------------------------------------------------------------ //
            const study = (await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `rgpd-erasure-${Date.now()}`,
                    statements: testDataBuilders.statements(23),
                    grid_config: gridConfig23,
                    state: 'active',
                })
            )) as { slug: string };
            const studySlug = study.slug;

            // Create the participant and capture their session token
            const participant = (await testDb.createParticipant(
                authToken,
                studySlug,
                testDataBuilders.participantResult({})
            )) as { session_token: string; confirmation_code?: string };
            const sessionToken = participant.session_token;

            // ------------------------------------------------------------------ //
            // 2. Navigate to the post-sort success screen as that participant       //
            //    by injecting the completed session state into localStorage.        //
            //    Key: 'qualis-session' (from useSessionStore, version 2).         //
            //    The studyLayoutLoader will fetch the study config; once the config //
            //    is loaded and isCompleted=true, PostSortPage shows the success     //
            //    screen including EraseMyDataDialog.                                //
            // ------------------------------------------------------------------ //
            await page.addInitScript(
                ({ token, slug, confirmationCode }) => {
                    // Zustand `persist` middleware stores state under the `name` option.
                    // useSessionStore uses name = 'qualis-session', version = 2.
                    // Field names must match the store interface exactly.
                    window.localStorage.setItem(
                        'qualis-session',
                        JSON.stringify({
                            state: {
                                token,
                                studySlug: slug,
                                hasConsented: true,
                                currentStep: 5,
                                maxReachedStep: 5,
                                language: 'en',
                                isCompleted: true,
                                confirmationCode: confirmationCode ?? 'TEST-CODE',
                                resumeCode: null,
                                isPilotMode: false,
                            },
                            version: 2,
                        })
                    );
                },
                {
                    token: sessionToken,
                    slug: studySlug,
                    confirmationCode: participant.confirmation_code ?? 'TEST-CODE',
                }
            );

            await page.goto(`/study/${studySlug}/post-sort`);

            // The success screen should render because isCompleted = true.
            // Give it time for the loader + config useEffect to fire.
            const thankYou = page.getByTestId('thank-you-message');
            await expect(thankYou).toBeVisible({ timeout: 30_000 });

            // ------------------------------------------------------------------ //
            // 3. Find the GDPR erasure section                                     //
            // ------------------------------------------------------------------ //
            // The EraseMyDataDialog renders below the confirmation code block when
            // sessionToken is available (from useSessionStore.getState().token).
            const erasureSection = page.getByText(/right to erasure/i).first();
            await expect(erasureSection).toBeVisible({ timeout: 10_000 });
            await erasureSection.scrollIntoViewIfNeeded();

            // ------------------------------------------------------------------ //
            // 4. Click "Request my data deletion"                                  //
            // ------------------------------------------------------------------ //
            const deleteButton = page.getByRole('button', { name: /request my data deletion/i });
            await expect(deleteButton).toBeVisible({ timeout: 10_000 });
            await deleteButton.click();

            // ------------------------------------------------------------------ //
            // 5. Confirm in the AlertDialog                                        //
            // ------------------------------------------------------------------ //
            const confirmTitle = page.getByRole('heading', { name: /erase your personal data/i });
            await expect(confirmTitle).toBeVisible({ timeout: 10_000 });

            // Click the destructive confirmation button
            const confirmAction = page.getByRole('button', { name: /yes, erase my data/i });
            await expect(confirmAction).toBeVisible({ timeout: 5_000 });
            await confirmAction.click();

            // ------------------------------------------------------------------ //
            // 6. Assert the success toast appears                                  //
            // ------------------------------------------------------------------ //
            // Sonner toast text (erasure.success): "Your personal data has been removed…"
            const successToast = page.getByText(/personal data has been removed/i).first();
            await expect(successToast).toBeVisible({ timeout: 15_000 });

            // ------------------------------------------------------------------ //
            // 7. Assert the "already erased" notice replaces the button            //
            // ------------------------------------------------------------------ //
            // erasure.already_erased: "Your personal data has been removed for this session."
            const alreadyErasedNotice = page.getByText(
                /personal data has been removed for this session/i
            );
            await expect(alreadyErasedNotice).toBeVisible({ timeout: 10_000 });

            // The delete button must have disappeared
            await expect(deleteButton).not.toBeVisible({ timeout: 5_000 });

            // ------------------------------------------------------------------ //
            // 8. Admin: verify anonymised count = 1 on the privacy page            //
            // ------------------------------------------------------------------ //
            // Open a fresh page (shares the browser context but starts with a clean
            // navigation) so the admin session doesn't collide with the participant.
            const adminPage = await context.newPage();

            // Inject admin session into the new page
            await testDb.loginToAdminUI(adminPage);

            await adminPage.goto(`/app/${workspaceSlug}/studies/${studySlug}/privacy`);
            await expect(adminPage).toHaveURL(/privacy/, { timeout: 15_000 });

            // Wait for the data inventory to load — "Participants snapshot" card
            await expect(adminPage.getByText(/participants snapshot/i)).toBeVisible({
                timeout: 15_000,
            });

            // The Anonymised stat should now be 1.
            // Strategy: find the stat card by first locating the label paragraph,
            // then reading the sibling value paragraph. We use the containing div
            // (parent) approach.
            //
            // The Stat component DOM:
            //   <div class="bg-slate-50 rounded-xl p-4">
            //     <p class="text-xs ...">Anonymised</p>
            //     <p class="text-2xl ...">1</p>
            //   </div>
            //
            // We use getByText to find the container that includes "Anonymised",
            // then assert the adjacent value using a data-driven text check.
            // Instead of CSS class selectors (fragile), we locate by the label text.
            const anonymisedLabel = adminPage.getByText('Anonymised', { exact: true });
            await expect(anonymisedLabel).toBeVisible({ timeout: 10_000 });

            // The sibling value <p> is the last <p> in the same parent div.
            // We navigate via Playwright's locator chain: parent → last p.
            const anonymisedCard = anonymisedLabel.locator('..');
            const statValue = anonymisedCard.locator('p').last();
            await expect(statValue).toHaveText('1', { timeout: 10_000 });

            await adminPage.close();
        });
    });
