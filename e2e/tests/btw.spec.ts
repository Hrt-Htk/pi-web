import { test as isolatedTest, expect, collapseScratchpad, isMobileLayout } from "../lib/test";
import { test as liveTest } from "../lib/live-test";
import { createLiveSession, deleteLiveSession } from "../lib/live-sessions";
import {
  buildSession,
  realWorkingDir,
  uniqueSessionName,
  writeSession,
} from "../lib/sessions";

// The "btw" floating scratch-chat opens from the git bar. It runs its own
// `pi --mode rpc` worker keyed by a per-parent btw session, so a sent message
// flows worker -> session JSONL -> SSE -> render, exactly like the main composer.
// The window is desktop-oriented; on mobile it is kept mutually exclusive with
// the composer, so these specs gate on layout.

// ── Test 1: pure UI (open/close, empty state) — isolated fixture ──
// Does not touch a worker; only exercises the popup's show/hide cycle and the
// empty-state render, so the isolated fixture suffices.

isolatedTest.describe("btw floating scratch-chat", () => {
  isolatedTest("opens from the git bar, shows the empty state, and closes", async ({
    page,
    sessionsDir,
  }, testInfo) => {
    const cwd = realWorkingDir();
    const { entries } = buildSession({ cwd });
    const id = writeSession(sessionsDir, uniqueSessionName(testInfo, "btw"), entries);

    await collapseScratchpad(page);
    await page.goto(`/session?id=${encodeURIComponent(id)}`);
    isolatedTest.skip(
      await isMobileLayout(page),
      "btw window is desktop-oriented; mobile keeps it mutually exclusive with the composer",
    );

    const btwBtn = page.locator("#pi-btw-button");
    await expect(btwBtn).toBeVisible();
    await expect(btwBtn).toHaveAttribute("aria-expanded", "false");
    await btwBtn.click();

    const win = page.locator(".pi-btw-window");
    await expect(win).toBeVisible();
    await expect(btwBtn).toHaveAttribute("aria-expanded", "true");
    // No btw session yet -> empty state.
    await expect(win.locator(".pi-btw-empty")).toBeVisible();

    await win.locator(".pi-btw-close").click();
    await expect(win).toBeHidden();
    await expect(btwBtn).toHaveAttribute("aria-expanded", "false");
  });
});

// ── Test 2: sends a message, asserts optimistic UI — live fixture ──
// Needs a real worker (btw creates its own session via /api/btw/new and sends
// via /api/chat). We assert the deterministic optimistic + running render,
// not the actual reply content.

liveTest.describe("btw message send (real pi)", () => {
  liveTest.setTimeout(120_000);

  liveTest("sending a message renders the optimistic user bubble and running state", async ({
    page,
    baseURL,
    sessionsDir,
  }, testInfo) => {
    liveTest.skip(testInfo.project.name !== "Desktop Chrome", "real-pi spec runs once, not across all 7 projects");
    liveTest.skip(baseURL === undefined, "live pi-web server not reachable — skip pi-dependent specs");

    const cwd = realWorkingDir();
    const id = await createLiveSession(baseURL!, cwd);

    try {
      await collapseScratchpad(page);
      // ?load=1 ensures a worker is started for the parent session.
      await page.goto(`/session?id=${encodeURIComponent(id)}&load=1`);
      liveTest.skip(
        await isMobileLayout(page),
        "btw window is desktop-oriented; mobile keeps it mutually exclusive with the composer",
      );

      await page.locator("#pi-btw-button").click();
      const win = page.locator(".pi-btw-window");
      await expect(win).toBeVisible();

      const prompt = `btw-${testInfo.workerIndex}-${Date.now()}`;
      await win.locator("#pi-btw-input").fill(prompt);
      await win.locator("#pi-btw-send").click();

      // Input clears immediately; the optimistic user bubble renders the prompt.
      await expect(win.locator("#pi-btw-input")).toHaveValue("");
      await expect(win.locator(".pi-btw-msg.user")).toContainText(prompt);

      // Creating the btw session + sending flips the window into the running
      // state (the "working" assistant bubble). We assert the deterministic
      // optimistic + running render, not the reply content.
      await expect(win.locator(".pi-btw-msg.working")).toBeVisible();
    } finally {
      deleteLiveSession(sessionsDir, id);
    }
  });
});
