import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { E2E_ROOT, STATE_FILE, LIVE_STATE_FILE } from "../lib/paths";
import { createLiveSession, deleteLiveSession } from "../lib/live-sessions";
import { buildSession, realWorkingDir, uniqueSessionName, writeSession } from "../lib/sessions";

function readState(): { baseURL: string; sessionsDir: string } {
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

function readLive(): { baseURL: string | undefined; sessionsDir: string } {
  const raw = JSON.parse(readFileSync(LIVE_STATE_FILE, "utf8"));
  return { baseURL: raw.baseURL ?? undefined, sessionsDir: raw.sessionsDir };
}

const test = base.extend({
  baseURL: async ({}, use) => {
    await use(readState().baseURL);
  },
  sessionsDir: async ({}, use) => {
    await use(readState().sessionsDir);
  },
});

test.describe("file uploads (issue #140)", () => {
  test.setTimeout(120_000);

  // -----------------------------------------------------------------------
  // Test 1: Composer accepts non-image files (fixture server, no pi needed).
  // -----------------------------------------------------------------------
  test("composer shows attachment chip for a .txt file", async ({
    page,
    sessionsDir,
  }, testInfo) => {
    // Create a session with a real cwd so chat is enabled.
    const cwd = realWorkingDir();
    const { entries } = buildSession({ cwd });
    const name = uniqueSessionName(testInfo, "file-upload");
    const id = writeSession(sessionsDir, name, entries);

    await page.goto(`/session?id=${encodeURIComponent(id)}`);

    // Composer should be enabled (cwd exists -> chat available).
    await expect(page.locator("#pi-chat-composer")).toHaveAttribute(
      "data-chat-available",
      "true",
    );

    const fileInput = page.locator("#pi-chat-images");
    await fileInput.setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });

    // A .pi-chat-attachment chip should appear in the composer attachment list.
    const chip = page.locator(".pi-chat-attachments .pi-chat-attachment");
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip.locator(".pi-chat-attachment-name")).toContainText("notes.txt");

    await page.screenshot({
      path: join(E2E_ROOT, ".shots", "issue140-composer-chip.png"),
    });
  });

  // -----------------------------------------------------------------------
  // Test 2: Real-pi send renders message attachment chip.
  // -----------------------------------------------------------------------
  test("sent message renders attachment chip (real pi)", async ({
    page,
  }, testInfo) => {
    // Run only on Desktop Chrome to avoid hitting the live server multiple times.
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "real-pi spec runs once",
    );

    const live = readLive();
    const liveBaseURL = live.baseURL;

    // Skip if the live server isn't available.
    test.skip(
      liveBaseURL === undefined,
      "live pi-web server not reachable — skip pi-dependent specs",
    );

    const cwd = realWorkingDir();
    const id = await createLiveSession(liveBaseURL!, cwd);

    try {
      await page.goto(liveBaseURL! + `/session?id=${encodeURIComponent(id)}`);

      // Composer should be enabled (cwd exists -> chat available).
      await expect(page.locator("#pi-chat-composer")).toHaveAttribute(
        "data-chat-available",
        "true",
      );

      const textarea = page.locator("#pi-chat-message");
      await textarea.fill("Reply with the single word: pong");

      await page.locator("#pi-chat-images").setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("hello"),
      });

      // Count assistant messages before sending (same pattern as chat.spec.ts).
      const assistantBefore = await page.locator(".assistant-message").count();

      await page.locator("#pi-chat-send").click();

      // Wait for the user's message to appear.
      await expect(page.locator("#messages")).toContainText(
        "Reply with the single word: pong",
        { timeout: 15_000 },
      );

      // Assert the .message-attachment chip appears inside #messages.
      const msgChip = page.locator("#messages .message-attachment");
      await expect(msgChip).toBeVisible({ timeout: 15_000 });
      await expect(msgChip).toContainText("notes.txt");

      await page.screenshot({
        path: join(E2E_ROOT, ".shots", "issue140-message-chip.png"),
      });

      // The raw "[Attached file:" string must NOT appear inside #messages
      // (it's rendered as a chip instead). The left session-list preview
      // pane intentionally shows raw text, so scope the check to #messages.
      await expect(page.locator("#messages")).not.toContainText(
        "[Attached file:",
      );

      // Wait for the assistant reply (same pattern as chat.spec.ts).
      await expect.poll(
        () => page.locator(".assistant-message").count(),
        { timeout: 100_000 },
      ).toBeGreaterThan(assistantBefore);
    } finally {
      deleteLiveSession(live.sessionsDir, id);
    }
  });
});
