import { test, expect, collapseScratchpad } from "../lib/test";
import {
  buildSession,
  realWorkingDir,
  uniqueSessionName,
  writeSession,
} from "../lib/sessions";

/**
 * Reproduction tests for: assistant reply never appears in a newly-created session.
 *
 * The stub `pi` writes "Stub reply: <prompt>" into the session file on every
 * prompt.  Pre-existing sessions surface it fine (chat.spec.ts).  These tests
 * assert the reply actually materialises after the two new-session flows.
 */
test.describe("new session assistant reply", () => {
  test.beforeEach(async ({ page }) => {
    await collapseScratchpad(page);
  });

  // ─────────────────────────────────────────────────────────────────
  // Control: pre-existing session (should always pass)
  // ─────────────────────────────────────────────────────────────────
  test("control — pre-existing session shows the reply", async ({
    page,
    sessionsDir,
  }, testInfo) => {
    const cwd = realWorkingDir();
    const { entries } = buildSession({ cwd });
    const name = uniqueSessionName(testInfo, "control");
    const id = writeSession(sessionsDir, name, entries);

    await page.goto(`/session?id=${encodeURIComponent(id)}`);

    const textarea = page.locator("#pi-chat-message");
    const prompt = `e2e-control-${testInfo.workerIndex}-${Date.now()}`;
    await textarea.fill(prompt);
    await page.locator("#pi-chat-send").click();

    await expect(page.locator("#messages")).toContainText(`Stub reply: ${prompt}`, {
      timeout: 20000,
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Flow 1: new session from the sessions index
  // ─────────────────────────────────────────────────────────────────
  test("flow 1 — new session from index shows the reply", async ({
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

    const prompt = `e2e-flow1-${testInfo.workerIndex}-${Date.now()}`;
    await page.locator("#pi-chat-message").fill(prompt);
    await page.locator("#pi-chat-send").click();

    await expect(page.locator("#messages")).toContainText(`Stub reply: ${prompt}`, {
      timeout: 20000,
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Flow 2: new session from within an existing session
  // ─────────────────────────────────────────────────────────────────
  test("flow 2 — new session from within session shows the reply", async ({
    page,
    sessionsDir,
  }, testInfo) => {
    const cwd = realWorkingDir();
    const { entries } = buildSession({ cwd });
    const name = uniqueSessionName(testInfo, "source");
    const sourceId = writeSession(sessionsDir, name, entries);

    await page.goto(`/session?id=${encodeURIComponent(sourceId)}`);
    await expect(page.locator("#messages")).toContainText("Initial reply.");

    await page.locator("#new-session-header-btn").click();
    await expect(page).toHaveURL(/\/session\?id=/, { timeout: 15000 });
    await page.waitForTimeout(1000);

    const prompt = `e2e-flow2-${testInfo.workerIndex}-${Date.now()}`;
    await page.locator("#pi-chat-message").fill(prompt);
    await page.locator("#pi-chat-send").click();

    await expect(page.locator("#messages")).toContainText(`Stub reply: ${prompt}`, {
      timeout: 20000,
    });
  });
});
