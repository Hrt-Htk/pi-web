// Reproduces false "done" notification on new-session creation.
// A freshly created session that has received no message should never fire
// the pi-worker-done CustomEvent. See issue #26 follow-up.

import { test, expect, collapseScratchpad } from "../lib/test";
import { realWorkingDir } from "../lib/sessions";

test.describe("new session notification", () => {
  test("fresh session must not fire pi-worker-done", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "single-project repro to avoid racing new-session creation across projects"
    );

    await collapseScratchpad(page);

    // Record every pi-worker-done dispatch so it survives SPA navigation.
    await page.addInitScript(() => {
      (window as any).__doneEvents = (window as any).__doneEvents || [];
      window.addEventListener("pi-worker-done", () => {
        (window as any).__doneEvents.push(Date.now());
      });
    });

    const cwd = realWorkingDir();

    await page.goto("/");

    // Open the new-session modal and create a session.
    await page.locator("#web-menu-btn").click();
    await expect(page.locator("#web-menu [data-new-session-btn]")).toBeVisible();
    await page.locator("#web-menu [data-new-session-btn]").click();
    await page.locator("#sessionPath").fill(cwd);
    await page.locator("#createBtn").click();

    // Wait for SPA navigation to the session page.
    await page.waitForURL(/\/session\?id=/, { timeout: 15000 });

    // Cover the worker-status poll interval (1500 ms) plus activity/worker
    // window — long enough that a spurious running -> idle transition would
    // have already fired.
    await page.waitForTimeout(5000);

    const doneCount = await page.evaluate(() =>
      ((window as any).__doneEvents || []).length
    );
    expect(doneCount, "a freshly created session must not fire pi-worker-done").toBe(0);
  });
});
