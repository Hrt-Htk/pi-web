import { test, expect, collapseScratchpad } from "../lib/test";
import {
  buildSession,
  realWorkingDir,
  uniqueSessionName,
  writeSession,
} from "../lib/sessions";

/**
 * Reproduction tests for: assistant reply flashes then disappears in a brand-new session.
 *
 * The stub `pi` supports a `[[defer-write]]` marker that emits done events BEFORE
 * writing canonical entries to disk.  This recreates the race where the frontend
 * reloads `/api/session` on `done`, finds no assistant entry yet, and clears the
 * preview permanently.
 */
test.describe("new session reply persistence", () => {
  test.beforeEach(async ({ page }) => {
    await collapseScratchpad(page);
  });

  // ─────────────────────────────────────────────────────────────────
  // Flow 1: brand-new session — reply should survive the done reload
  // ─────────────────────────────────────────────────────────────────
  test("flow 1 — new session reply stays visible (deferred write)", async ({
    page,
    sessionsDir,
  }, testInfo) => {
    const cwd = realWorkingDir();

    await page.goto("/");
    await page.locator("[data-sessions-content].index-layout-ready").waitFor();

    await page.locator("#newSessionBtn").click();
    await expect(page.locator("#modalOverlay")).toBeVisible({ timeout: 5000 });
    await page.locator("#sessionPath").fill(cwd);
    await page.locator("#createBtn").click();
    await expect(page).toHaveURL(/\/session\?id=/, { timeout: 15000 });

    const token = `persist-${testInfo.workerIndex}-${Date.now()}`;
    await page.locator("#pi-chat-message").fill(`${token} [[defer-write]]`);
    await page.locator("#pi-chat-send").click();

    // Assistant reply renders as a streaming preview (the "flash"). Assert on
    // the assistant-only "Stub reply:" prefix — the user's own echo also
    // contains the token, so matching the bare token would pass spuriously.
    await expect(page.locator("#messages")).toContainText(`Stub reply: ${token}`, { timeout: 10000 });

    // Wait for the canonical write + reload to settle, then assert it's still there.
    // This is the assertion that fails when the bug is present.
    await page.waitForTimeout(4000);
    await expect(page.locator("#messages")).toContainText(`Stub reply: ${token}`);
  });

  // ─────────────────────────────────────────────────────────────────
  // Control: pre-existing session — should be fine with deferred write
  // ─────────────────────────────────────────────────────────────────
  test("control — pre-existing session reply stays visible (deferred write)", async ({
    page,
    sessionsDir,
  }, testInfo) => {
    const cwd = realWorkingDir();
    const { entries } = buildSession({ cwd });
    const name = uniqueSessionName(testInfo, "persist-control");
    const id = writeSession(sessionsDir, name, entries);

    await page.goto(`/session?id=${encodeURIComponent(id)}`);

    const token = `persist-${testInfo.workerIndex}-${Date.now()}`;
    await page.locator("#pi-chat-message").fill(`${token} [[defer-write]]`);
    await page.locator("#pi-chat-send").click();

    // Assistant reply renders as a streaming preview.
    await expect(page.locator("#messages")).toContainText(`Stub reply: ${token}`, { timeout: 10000 });

    // Should still be visible after canonical write + reload.
    await page.waitForTimeout(4000);
    await expect(page.locator("#messages")).toContainText(`Stub reply: ${token}`);
  });
});
