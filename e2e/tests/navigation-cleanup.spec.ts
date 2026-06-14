import { test, expect } from "../lib/live-test";
import { createLiveSession, deleteLiveSession } from "../lib/live-sessions";
import { realWorkingDir } from "../lib/sessions";

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
 * Test strategy (real pi): create session A, send a prompt (worker starts
 * generating). Without waiting for A to finish, create session B, send a
 * distinct prompt, and assert B gets its own assistant message — proving B's
 * response is not lost or misrouted while A's worker is still busy.
 */
test.describe("session navigation cleanup (real pi)", () => {
  test.setTimeout(120_000);

  test("new session responses survive after old session worker finishes", async ({
    page,
    baseURL,
    sessionsDir,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "real-pi spec runs once, not across all 7 projects",
    );
    test.skip(
      baseURL === undefined,
      "live pi-web server not reachable — skip pi-dependent specs",
    );

    const liveURL = baseURL!;
    const cwd = realWorkingDir();
    const cwd2 = realWorkingDir();

    // Session A — worker will start generating and stay busy.
    const idA = await createLiveSession(liveURL, cwd);
    // Session B — navigated to while session A's worker is still running.
    const idB = await createLiveSession(liveURL, cwd2);

    try {
      // --- Step 1: Open session A and send a message ---
      await page.goto(`/session?id=${encodeURIComponent(idA)}`);
      await expect(page.locator("#pi-chat-composer")).toHaveAttribute(
        "data-chat-available",
        "true",
      );

      const promptA = `session-a-prompt-${Date.now()}`;
      await page.locator("#pi-chat-message").fill(promptA);
      await page.locator("#pi-chat-send").click();

      // Verify A's prompt appears (deterministic — it's our own text).
      await expect(page.locator("#messages")).toContainText(promptA, {
        timeout: 15_000,
      });
      // Don't wait for A's assistant reply — move on while A's worker is busy.

      // --- Step 2: Navigate to session B while A's worker is still running ---
      await page.goto(`/session?id=${encodeURIComponent(idB)}`);
      await expect(page.locator("#pi-chat-composer")).toHaveAttribute(
        "data-chat-available",
        "true",
      );

      const assistantBeforeB = await page.locator(".assistant-message").count();

      const promptB = `session-b-prompt-${Date.now()}`;
      await page.locator("#pi-chat-message").fill(promptB);
      await page.locator("#pi-chat-send").click();

      // --- Step 3: Assert session B gets its own new assistant message ---
      await expect(page.locator("#messages")).toContainText(promptB, {
        timeout: 15_000,
      });

      await expect.poll(
        () => page.locator(".assistant-message").count(),
        { timeout: 100_000 },
      ).toBeGreaterThan(assistantBeforeB);
    } finally {
      deleteLiveSession(sessionsDir, idA);
      deleteLiveSession(sessionsDir, idB);
    }
  });
});
