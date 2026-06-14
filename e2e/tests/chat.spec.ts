import { test, expect } from "../lib/live-test";
import { createLiveSession, deleteLiveSession } from "../lib/live-sessions";
import { realWorkingDir } from "../lib/sessions";

test.describe("chat (real pi)", () => {
  test.setTimeout(120_000);

  test("sending a message shows the assistant reply", async ({
    page,
    baseURL,
    sessionsDir,
  }, testInfo) => {
    // Run only on one project to avoid hitting the live server 7 times.
    test.skip(testInfo.project.name !== "Desktop Chrome", "real-pi spec runs once, not across all 7 projects");

    // Skip if the live server isn't available.
    test.skip(
      baseURL === undefined,
      "live pi-web server not reachable — skip pi-dependent specs",
    );

    // At this point baseURL is guaranteed to be a string.
    const liveURL = baseURL!;

    // Session cwd must exist on disk or chat is disabled ("View only").
    const cwd = realWorkingDir();
    const id = await createLiveSession(liveURL, cwd);

    try {
      await page.goto(`/session?id=${encodeURIComponent(id)}`);

      // Composer should be enabled (cwd exists -> chat available).
      const composer = page.locator("#pi-chat-composer");
      await expect(composer).toHaveAttribute("data-chat-available", "true");

      // Count assistant messages before sending.
      const assistantBefore = await page.locator(".assistant-message").count();

      const textarea = page.locator("#pi-chat-message");
      const prompt = `Reply with the single word: pong`;
      await textarea.fill(prompt);
      await page.locator("#pi-chat-send").click();

      // Wait for the user's message to appear (deterministic — it's our own text).
      await expect(page.locator("#messages")).toContainText(prompt, { timeout: 15_000 });

      // Wait for a NEW assistant message to appear.  We assert count > baseline
      // rather than exact text because real pi output is non-deterministic.
      // .assistant-message is the class SessionEntry.svelte applies to every
      // assistant-role entry, so this survives re-renders and SSE reloads.
      await expect.poll(
        () => page.locator(".assistant-message").count(),
        { timeout: 100_000 },
      ).toBeGreaterThan(assistantBefore);
    } finally {
      deleteLiveSession(sessionsDir, id);
    }
  });
});
