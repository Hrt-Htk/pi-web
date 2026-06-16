import { test, expect } from "../lib/test";

test.describe("per-project new session button", () => {
  test("shows + button on each project group header in projects layout", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for the index to fully load
    await page.locator("[data-sessions-content].index-layout-ready").waitFor();

    // Switch to projects layout
    await page.locator('[data-layout-btn="projects"]').click();

    // Wait for project groups to render
    await page.locator(".project-group").first().waitFor();

    // Each project group should have a .project-new-btn
    const projectGroups = page.locator(".project-group");
    const count = await projectGroups.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const newBtn = projectGroups.nth(i).locator(".project-new-btn");
      await expect(newBtn).toBeVisible();
    }
  });

  test("does not show + button in timeline layout", async ({ page }) => {
    await page.goto("/");

    // Wait for the index to fully load
    await page.locator("[data-sessions-content].index-layout-ready").waitFor();

    // Ensure we're in timeline layout (default)
    await page.locator('[data-layout-btn="timeline"]').click();

    // In timeline layout there are no project groups, hence no per-project buttons
    await expect(page.locator(".project-group")).toHaveCount(0);
    await expect(page.locator(".project-new-btn")).toHaveCount(0);
  });

  test("new session button has correct aria-label", async ({ page }) => {
    await page.goto("/");

    await page.locator("[data-sessions-content].index-layout-ready").waitFor();
    await page.locator('[data-layout-btn="projects"]').click();
    await page.locator(".project-group").first().waitFor();

    const newBtn = page.locator(".project-new-btn").first();
    await expect(newBtn).toHaveAttribute(
      "aria-label",
      "New session in this project",
    );
  });
});
