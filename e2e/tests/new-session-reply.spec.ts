import { test, expect } from "../lib/live-test";
import { createLiveSession, deleteLiveSession } from "../lib/live-sessions";
import { realWorkingDir } from "../lib/sessions";

test.describe("new session assistant reply (real pi)", () => {
  test.setTimeout(120_000);

  // ─────────────────────────────────────────────────────────────────
  // Flow 1: new session from the sessions index
  // ─────────────────────────────────────────────────────────────────
  test("flow 1 — new session from index shows the reply", async ({
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

    await page.goto("/");
    await page.locator("[data-sessions-content].index-layout-ready").waitFor();

    await page.locator("#newSessionBtn").click();
    await expect(page.locator("#modalOverlay")).toBeVisible({ timeout: 5000 });
    // The directory browser auto-selects the current directory, enabling Create.
    await expect(page.locator("#createBtn")).toBeEnabled({ timeout: 10000 });
    await page.locator("#createBtn").click();
    await expect(page).toHaveURL(/\/session\?id=/, { timeout: 15000 });

    const id = new URL(page.url()).searchParams.get("id");

    const composer = page.locator("#pi-chat-composer");
    await expect(composer).toHaveAttribute("data-chat-available", "true");

    const assistantBefore = await page.locator(".assistant-message").count();

    const prompt = `e2e-flow1-${testInfo.workerIndex}-${Date.now()}`;
    await page.locator("#pi-chat-message").fill(prompt);
    await page.locator("#pi-chat-send").click();

    await expect(page.locator("#messages")).toContainText(prompt, {
      timeout: 15_000,
    });

    await expect
      .poll(() => page.locator(".assistant-message").count(), {
        timeout: 100_000,
      })
      .toBeGreaterThan(assistantBefore);

    // Wait for the PERSISTED reply (not the streaming preview) before reloading.
    await expect(
      page.locator(".assistant-message:not(.chat-preview-stream)").first(),
    ).toBeVisible({ timeout: 100_000 });

    // Persistence check: reload and verify the persisted assistant message survives.
    await page.reload();
    await expect(
      page.locator(".assistant-message:not(.chat-preview-stream)").first(),
    ).toBeVisible({ timeout: 15_000 });

    deleteLiveSession(sessionsDir, id!);
  });

  // ─────────────────────────────────────────────────────────────────
  // Flow 2: new session from within an existing session
  // ─────────────────────────────────────────────────────────────────
  test("flow 2 — new session from within session shows the reply", async ({
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

    const cwd = realWorkingDir();
    const sourceId = await createLiveSession(baseURL!, cwd);

    try {
      await page.goto(`/session?id=${encodeURIComponent(sourceId)}`);

      // createLiveSession makes an empty session — wait for composer ready.
      await expect(page.locator("#pi-chat-composer")).toHaveAttribute(
        "data-chat-available",
        "true",
      );

      await page.locator("#new-session-header-btn").click();
      await expect(page).toHaveURL(/\/session\?id=/, { timeout: 15000 });

      const id = new URL(page.url()).searchParams.get("id");

      const composer = page.locator("#pi-chat-composer");
      await expect(composer).toHaveAttribute("data-chat-available", "true");

      const assistantBefore = await page.locator(".assistant-message").count();

      const prompt = `e2e-flow2-${testInfo.workerIndex}-${Date.now()}`;
      await page.locator("#pi-chat-message").fill(prompt);
      await page.locator("#pi-chat-send").click();

      await expect(page.locator("#messages")).toContainText(prompt, {
        timeout: 15_000,
      });

      await expect
        .poll(() => page.locator(".assistant-message").count(), {
          timeout: 100_000,
        })
        .toBeGreaterThan(assistantBefore);

      deleteLiveSession(sessionsDir, id!);
    } finally {
      deleteLiveSession(sessionsDir, sourceId);
    }
  });
});
