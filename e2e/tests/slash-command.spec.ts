import { test, expect } from "../lib/live-test";
import { createLiveSession, deleteLiveSession } from "../lib/live-sessions";
import { realWorkingDir } from "../lib/sessions";
import { collapseScratchpad } from "../lib/test";

// The slash-command palette opens when "/" begins the composer message and
// lists the commands pi loaded for the session (served by the get_commands rpc).
// Only prompt and skill commands reach the palette; extension commands are
// excluded because they drive pi's TUI directly and never emit agent_end.

test.describe("slash-command palette (real pi)", () => {
  test.setTimeout(120_000);

  async function openSessionWithChat(
    page: import("@playwright/test").Page,
    baseURL: string,
    sessionsDir: string,
    testInfo: import("@playwright/test").TestInfo,
  ): Promise<string> {
    test.skip(testInfo.project.name !== "Desktop Chrome", "real-pi spec runs once, not across all 7 projects");
    test.skip(baseURL === undefined, "live pi-web server not reachable — skip pi-dependent specs");

    const cwd = realWorkingDir();
    const id = await createLiveSession(baseURL!, cwd);

    await collapseScratchpad(page);
    // ?load=1 ensures a worker is started so get_commands can return results.
    await page.goto(`/session?id=${encodeURIComponent(id)}&load=1`);

    const composer = page.locator("#pi-chat-composer");
    await expect(composer).toHaveAttribute("data-chat-available", "true");

    return id;
  }

  test("opens on '/' and shows commands", async ({
    page,
    baseURL,
    sessionsDir,
  }, testInfo) => {
    const id = await openSessionWithChat(page, baseURL!, sessionsDir, testInfo);

    try {
      await page.locator("#pi-chat-message").fill("/");

      const popup = page.locator("#pi-chat-slash-popup");
      await expect(popup).toBeVisible();

      // Real pi's command set depends on installed extensions/skills — assert
      // at least one item appears rather than exact names.
      // Commands load via get_commands after the worker cold-starts, so allow
      // generous time for the first item to appear.
      await expect(page.locator(".slash-item").first()).toBeVisible({ timeout: 30_000 });
    } finally {
      deleteLiveSession(sessionsDir, id);
    }
  });

  test("filters as the query narrows", async ({
    page,
    baseURL,
    sessionsDir,
  }, testInfo) => {
    const id = await openSessionWithChat(page, baseURL!, sessionsDir, testInfo);

    try {
      await page.locator("#pi-chat-message").fill("/");

      const popup = page.locator("#pi-chat-slash-popup");
      await expect(popup).toBeVisible();
      const initialCount = await page.locator(".slash-item").count();

      // Narrow with a query unlikely to match any command.
      await page.locator("#pi-chat-message").fill("/xyz_nonexistent_command_123");

      // Popup stays visible; item count drops (to 0 if nothing matches).
      await expect(popup).toBeVisible();
      const filteredCount = await page.locator(".slash-item").count();
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    } finally {
      deleteLiveSession(sessionsDir, id);
    }
  });

  test("Enter inserts the selected command into the composer", async ({
    page,
    baseURL,
    sessionsDir,
  }, testInfo) => {
    const id = await openSessionWithChat(page, baseURL!, sessionsDir, testInfo);

    try {
      await page.locator("#pi-chat-message").fill("/");
      await expect(page.locator("#pi-chat-slash-popup")).toBeVisible();
      // Commands load via get_commands after the worker cold-starts, so allow
      // generous time for the first item to appear.
      await expect(page.locator(".slash-item").first()).toBeVisible({ timeout: 30_000 });

      const textarea = page.locator("#pi-chat-message");
      await textarea.focus();
      await page.keyboard.press("Enter");

      // Command was inserted — value starts with "/".
      const value = await textarea.inputValue();
      expect(value.startsWith("/")).toBe(true);
      await expect(page.locator("#pi-chat-slash-popup")).toBeHidden();
    } finally {
      deleteLiveSession(sessionsDir, id);
    }
  });

  test("clicking a command inserts it and closes the palette", async ({
    page,
    baseURL,
    sessionsDir,
  }, testInfo) => {
    const id = await openSessionWithChat(page, baseURL!, sessionsDir, testInfo);

    try {
      await page.locator("#pi-chat-message").fill("/");
      await expect(page.locator("#pi-chat-slash-popup")).toBeVisible();
      // Commands load via get_commands after the worker cold-starts, so allow
      // generous time for the first item to appear.
      await expect(page.locator(".slash-item").first()).toBeVisible({ timeout: 30_000 });

      await page.locator(".slash-item").first().click();

      const value = await page.locator("#pi-chat-message").inputValue();
      expect(value.startsWith("/")).toBe(true);
      await expect(page.locator("#pi-chat-slash-popup")).toBeHidden();
    } finally {
      deleteLiveSession(sessionsDir, id);
    }
  });
});
