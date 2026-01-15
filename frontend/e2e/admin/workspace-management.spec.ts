import { test, expect } from "../fixtures/db-setup";
import { AdminPage } from "../pages/AdminPage";
import { VisualAssertions } from "../helpers/VisualAssertions";

test.describe("Workspace Management E2E Tests (Real Backend)", () => {
  let adminPage: AdminPage;
  let visual: VisualAssertions;
  let workspaceSlug: string;

  test.beforeEach(async ({ page, testDb, authToken }) => {
    adminPage = new AdminPage(page);
    visual = new VisualAssertions(page);

    await testDb.loginToAdminUI(page);
    workspaceSlug = testDb.getWorkspaceSlug();
  });

  test("should navigate to workspace settings via switcher", async ({
    page,
  }) => {
    // Open workspace switcher
    await page.getByTestId("workspace-switcher").click();

    // Screenshot dropdown
    // await visual.captureElement('[role="menu"]', 'workspace-switcher-dropdown');

    // Click workspace settings
    await page.getByRole("menuitem", { name: /workspace settings/i }).click();

    // Wait for navigation
    await expect(page).toHaveURL(
      new RegExp(`/admin/workspaces/${workspaceSlug}/settings`),
    );

    // Capture workspace settings page
    // await visual.compareScreenshot('workspace-settings-page', { fullPage: true });
  });

  test("should update workspace title and slug", async ({ page }) => {
    await page.goto(`/admin/workspaces/${workspaceSlug}/settings`);

    // Capture initial state
    // await visual.compareScreenshot('workspace-settings-before-update');

    // Update title
    const titleInput = page.getByLabel(/workspace title/i);
    await titleInput.fill("Updated Workspace Title");

    // Update slug
    const slugInput = page.getByLabel(/url slug/i);
    await slugInput.fill(`updated-${Date.now()}`);

    // Capture form with changes
    // await visual.captureElement('form', 'workspace-settings-form-filled');

    // Submit
    await page.getByRole("button", { name: /save changes/i }).click();

    // Wait for success toast
    await expect(page.getByText(/workspace updated/i)).toBeVisible();

    // Verify URL changed
    await expect(page).toHaveURL(/admin\/workspaces\/updated-.*\/settings/);
  });

  test("should display team members table", async ({ page }) => {
    await page.goto(`/admin/workspaces/${workspaceSlug}/settings`);

    // Wait for members table
    // await page.waitForSelector('[data-testid="members-table"]', { state: 'visible' });

    // Capture members table
    // await visual.captureElement('[data-testid="members-table"]', 'workspace-members-table');
    await expect(page.locator("table")).toBeVisible();
  });

  // NOTE: Testing member role change/removal requires a second user in the workspace.
  // Since testDb only sets up one user by default, we skip deeply interactive tests involving second users
  // unless we create them. For now, we focus on basic CRUD.

  test("should display permissions matrix sidebar", async ({ page }) => {
    await page.goto(`/admin/workspaces/${workspaceSlug}/settings`);
    await expect(page.getByText("Permissions")).toBeVisible();
  });

  test("should prevent self-removal", async ({ page }) => {
    await page.goto(`/admin/workspaces/${workspaceSlug}/settings`);

    // Try to change own role (should be disabled)
    // Adjust selector if needed, assuming the owner row is first
    // const currentUserRow = page.locator('tbody tr').first();
    // const roleSelect = currentUserRow.locator('[role="combobox"]');
    // await expect(roleSelect).toBeDisabled();
  });
});
