import { test, expect, collapseScratchpad } from "../lib/test";
import {
  buildSession,
  realWorkingDir,
  uniqueSessionName,
  writeSession,
} from "../lib/sessions";
import { setStubDelay, resetStubDelay } from "../lib/stub-delay";

/**
 * Regression test for: flashing ring / disappearing responses when navigating
 * between sessions.
 *
 * Root cause: ChatComposer's worker status polling interval was never cleaned
 * up on unmount. When navigating from session A (with an active worker) to
 * session B, session A's stale interval kept polling. When session A's worker
 * finished, the stale interval dispatched `pi-worker-done` on the global
 * window. Session B's LiveReload caught this event, called finishChatPreview()
 * + triggerReload(), and cleared session B's content.
 *
 * Fix: dispose() clears the interval; runChatComposer() returns a cleanup
 * function; ChatComposer.svelte's onMount returns the cleanup.
 *
 * Test strategy: use stub delay of 5000ms so session A's worker stays
 * "running" for 5 seconds — well past the navigation to session B.
 * After navigation, wait longer than 5s and verify session B's content
 * is not cleared.
 */
test.describe("session navigation cleanup", () => {
  test.beforeEach(() => {
    setStubDelay(5000);
  });

  test.afterEach(() => {
    resetStubDelay();
  });

  test("new session responses survive after old session worker finishes", async ({
    page,
    sessionsDir,
  }, testInfo) => {
    const cwd = realWorkingDir();
    const cwd2 = realWorkingDir();

    // Session A — worker will be started and stay running for 5s.
    const sessionA = buildSession({ cwd });
    const nameA = uniqueSessionName(testInfo, "nav-a");
    const idA = writeSession(sessionsDir, nameA, sessionA.entries);

    // Session B — navigated to while session A's worker is still running.
    const sessionB = buildSession({ cwd: cwd2 });
    const nameB = uniqueSessionName(testInfo, "nav-b");
    const idB = writeSession(sessionsDir, nameB, sessionB.entries);

    await collapseScratchpad(page);

    // --- Step 1: Navigate to session A and send a message ---
    await page.goto(`/session?id=${encodeURIComponent(idA)}`);
    await expect(page.locator("#messages")).toContainText("Initial reply.");

    // Send a message — worker becomes "running", stays that way for 5s.
    const textarea = page.locator("#pi-chat-message");
    const promptA = `session-a-prompt-${Date.now()}`;
    await textarea.fill(promptA);
    await page.locator("#pi-chat-send").click();

    // Verify the worker is running (status indicator shows "running").
    await expect(page.locator("#pi-chat-status")).toHaveClass(/running/);

    // --- Step 2: Navigate to session B WHILE worker is still running ---
    await page.goto(`/session?id=${encodeURIComponent(idB)}`);
    await expect(page.locator("#messages")).toContainText("Initial reply.");

    // Send a message in session B and wait for the response.
    const textareaB = page.locator("#pi-chat-message");
    const promptB = `session-b-prompt-${Date.now()}`;
    await textareaB.fill(promptB);
    await page.locator("#pi-chat-send").click();

    // Wait for session B's stub reply.
    await expect(page.locator("#messages")).toContainText(`Stub reply: ${promptB}`, {
      timeout: 15000,
    });

    // --- Step 3: Wait for session A's worker to finish (5s delay + buffer) ---
    // Without the fix: session A's stale interval would detect running→idle,
    // dispatch pi-worker-done, and session B's LiveReload would clear content.
    // With the fix: the interval was cleared on unmount, so nothing happens.
    await page.waitForTimeout(7000);

    // --- Step 4: Verify session B's content is still intact ---
    await expect(page.locator("#messages")).toContainText(`Stub reply: ${promptB}`);
    await expect(page.locator("#messages")).toContainText("Initial reply.");
  });
});
