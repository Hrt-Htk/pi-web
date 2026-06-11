import { test, expect, collapseScratchpad } from "../lib/test";
import {
  buildSession,
  realWorkingDir,
  uniqueSessionName,
  writeSession,
} from "../lib/sessions";

/**
 * DIAGNOSTIC / OBSERVABILITY TEST — new-session messages disappear.
 *
 * BUG: On every new session, after the assistant finishes streaming, both the
 * user's own posted message and the assistant reply disappear from the page.
 * They only reappear after navigating away and re-entering the session.
 *
 * This test does NOT assert pass/fail. It prints a time-series timeline of
 * DOM state so we can see exactly when messages appear, stream, and vanish.
 *
 * Run against REAL pi-web with REAL pi (no stub). The stub self-heals via
 * fsnotify recovery reload and will not reproduce the bug.
 *
 * Usage:
 *   # Build pi-web first, then run:
 *   cd e2e && npx playwright test tests/new-session-observe.spec.ts --project="Desktop Chrome" --reporter=line
 *
 * The timeline output looks like:
 *   [t+0.00s] messages=0 pending-user=no preview=no status=idle send=enabled
 *   [t+0.25s] messages=0 pending-user=yes preview=yes(0ch) status=running send=disabled
 *   [t+0.50s] messages=0 pending-user=yes preview=yes(12ch) status=running send=disabled
 *   ...
 *   [t+5.25s] messages=0 pending-user=no preview=no status=idle send=enabled   <-- disappearance?
 *   ...
 *   [t+20.00s] messages=0 pending-user=no preview=no status=idle send=enabled  <-- stayed gone
 */

const POLL_INTERVAL_MS = 250;
const OBSERVATION_DURATION_MS = 20_000;

/**
 * Poll DOM state every POLL_INTERVAL_MS for OBSERVATION_DURATION_MS,
 * printing a timeline to console.
 */
async function observeTimeline(page: import("@playwright/test").Page, label: string) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`  TIMELINE: ${label}`);
  console.log(`${"=".repeat(72)}`);

  const ticks = Math.ceil(OBSERVATION_DURATION_MS / POLL_INTERVAL_MS);
  let disappearanceDetected = false;
  let hadMessages = false;

  for (let i = 0; i < ticks; i++) {
    const elapsed = (i * POLL_INTERVAL_MS) / 1000;
    const timeLabel = `t+${elapsed.toFixed(2)}s`;

    const state = await page.evaluate(() => {
      const messagesEl = document.getElementById("messages");
      const messagesCount = messagesEl ? messagesEl.children.length : -1;

      const messagesListEl = document.getElementById("messages-list");
      const messagesListCount = messagesListEl ? messagesListEl.children.length : -1;

      const previewHost = document.getElementById("chat-preview-host");
      const previewHostChildren = previewHost ? previewHost.children.length : -1;

      const pendingUser = document.getElementById("chat-pending-user");
      const hasPendingUser = !!pendingUser;

      const preview = document.getElementById("chat-preview-stream");
      const previewExists = !!preview;
      const rawText = preview
        ? (preview.querySelector(".message-content")?.textContent || "").trim()
        : "";
      const previewTextLen = rawText.length;
      const previewSnippet = previewTextLen > 0
        ? rawText.substring(0, 50).replace(/\n/g, " ")
        : "";
      const previewClasses = preview ? Array.from(preview.classList).join(",") : "";

      const statusEl = document.getElementById("pi-chat-status");
      const statusClasses = statusEl ? Array.from(statusEl.classList).join(",") : "none";

      const sendBtn = document.getElementById("pi-chat-send");
      const sendDisabled = sendBtn ? sendBtn.hasAttribute("disabled") : true;

      return {
        messages: messagesCount,
        listCount: messagesListCount,
        previewHost: previewHostChildren,
        pendingUser: hasPendingUser,
        previewExists,
        previewTextLen,
        previewSnippet,
        previewClasses,
        status: statusClasses,
        sendDisabled,
      };
    });

    const line = formatTick(timeLabel, state);
    console.log(line);

    // Detect the disappearance pattern: had visible content, now gone
    const hasVisibleContent = state.pendingUser || state.previewExists || state.messages > 0;
    if (hadMessages && !hasVisibleContent && !disappearanceDetected) {
      console.log(`  *** DISAPPEARANCE DETECTED at ${timeLabel} ***`);
      disappearanceDetected = true;
    }
    if (hasVisibleContent) {
      hadMessages = true;
    }

    if (i < ticks - 1) {
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }
  }

  const finalState = await page.evaluate(() => {
    const messagesEl = document.getElementById("messages");
    return messagesEl ? messagesEl.children.length : 0;
  });

  console.log(`${"=".repeat(72)}`);
  if (disappearanceDetected) {
    if (finalState === 0) {
      console.log(`  RESULT: Messages disappeared and STAYED GONE (final: ${finalState} messages)`);
    } else {
      console.log(`  RESULT: Messages disappeared but recovered (final: ${finalState} messages)`);
    }
  } else if (hadMessages) {
    console.log(`  RESULT: Messages persisted normally (final: ${finalState} messages)`);
  } else {
    console.log(`  RESULT: No messages appeared during observation window`);
  }
  console.log(`${"=".repeat(72)}\n`);
}

function formatTick(time: string, s: {
  messages: number;
  listCount: number;
  previewHost: number;
  pendingUser: boolean;
  previewExists: boolean;
  previewTextLen: number;
  previewSnippet: string;
  previewClasses: string;
  status: string;
  sendDisabled: boolean;
}): string {
  const previewStr = s.previewExists
    ? `yes(${s.previewTextLen}ch)` + (s.previewSnippet ? ` "${s.previewSnippet}..."` : "") + (s.previewClasses ? `[${s.previewClasses}]` : "")
    : "no";
  return `[${time}] msgs=${s.messages} list=${s.listCount} pHost=${s.previewHost} pending=${s.pendingUser ? "Y" : "n"} preview=${previewStr} status=${s.status} send=${s.sendDisabled ? "dis" : "en"}`;
}

// ────────────────────────────────────────────────────────────────────

test.describe("new-session message disappearance — timeline observation", () => {
  test.beforeEach(async ({ page }) => {
    await collapseScratchpad(page);
  });

  // ─────────────────────────────────────────────────────────────────
  // Flow 1: Create from the sessions index (overview page)
  // Creates via an existing session so the new session inherits the model.
  // A brand-new session from the index has no source → no model → worker fails.
  // ─────────────────────────────────────────────────────────────────
  test("flow 1 — create from sessions index, observe timeline", async ({
    page,
  }, testInfo) => {
    // Find a chat-available session to start from (so new session inherits model).
    const res = await page.request.get("/api/sessions");
    const data = await res.json();
    const list: any[] = Array.isArray(data) ? data : data.sessions || [];
    const chatSession = list.find(
      (s: any) => s.ChatAvailable === true,
    );
    if (!chatSession) {
      console.log("[flow 1] No chat-available session found — skipping");
      test.skip();
    }
    const sourceId = chatSession.ID || chatSession.Filename;

    console.log(`[flow 1] Starting — worker ${testInfo.workerIndex}, source: ${sourceId}`);

    // Navigate to existing session first (so we have a model to inherit).
    await page.goto(`/session?id=${encodeURIComponent(sourceId)}`);
    await expect(page.locator("#messages")).toBeVisible({ timeout: 10000 });

    // Click "+" in the header to create a new session (inherits model from source).
    await page.locator("#new-session-header-btn").click();

    // Wait for navigation to new session
    await expect(page).toHaveURL(/\/session\?id=/, { timeout: 15000 });
    await expect(page).not.toHaveURL(`?id=${encodeURIComponent(sourceId)}`);

    // Wait for session page to settle
    await page.waitForTimeout(1000);

    // Wait for composer to be ready
    await expect(page.locator("#pi-chat-composer")).toBeVisible();
    await expect(page.locator("#pi-chat-message")).toBeVisible();

    // Small settle before sending
    await page.waitForTimeout(500);

    // Send a message — "hello" for a fast, short reply.
    await page.locator("#pi-chat-message").fill("hello");
    await page.locator("#pi-chat-send").click();

    // Wait for send button to become disabled (worker accepted)
    await expect(page.locator("#pi-chat-send")).toBeDisabled({ timeout: 10000 });

    console.log(`[flow 1] Message sent, starting observation...`);

    // Capture console logs for debugging
    const logs: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error" || msg.type() === "warn") {
        logs.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    // Observe the timeline
    await observeTimeline(page, `Flow 1 (from index) — prompt: "hello"`);

    // Print any errors
    if (logs.length > 0) {
      console.log(`[flow 1] Console errors/warnings (${logs.length}):`);
      for (const log of logs.slice(-10)) {
        console.log(`  ${log}`);
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // Flow 2: Create from within an existing session
  // ─────────────────────────────────────────────────────────────────
  test("flow 2 — create from existing session, observe timeline", async ({
    page,
    sessionsDir,
  }, testInfo) => {
    let sourceId: string;

    if (sessionsDir) {
      // Stub harness: create a seed session locally.
      const cwd = realWorkingDir();
      const { entries } = buildSession({ cwd });
      const name = uniqueSessionName(testInfo, "source");
      sourceId = writeSession(sessionsDir, name, entries);
    } else {
      // Real server: find an existing session via /api/sessions.
      const res = await page.request.get("/api/sessions");
      const sessions = await res.json();
      const list = Array.isArray(sessions) ? sessions : (sessions as any).sessions || [];
      if (list.length === 0) {
        console.log("[flow 2] No existing sessions on real server — skipping");
        test.skip();
      }
      // Pick the most recently active session.
      sourceId = list[0].ID || list[0].Filename;
    }

    console.log(`[flow 2] Starting — worker ${testInfo.workerIndex}, source: ${sourceId}`);

    // Navigate to existing session
    await page.goto(`/session?id=${encodeURIComponent(sourceId)}`);
    // Wait for the session to render (any content in #messages).
    await expect(page.locator("#messages")).toBeVisible({ timeout: 10000 });

    // Click "+" button in header to create new session
    await page.locator("#new-session-header-btn").click();

    // Wait for navigation to new session
    await expect(page).toHaveURL(/\/session\?id=/, { timeout: 15000 });
    await expect(page).not.toHaveURL(`?id=${encodeURIComponent(sourceId)}`);

    // Wait for session page to settle
    await page.waitForTimeout(1000);

    // Wait for composer to be ready
    await expect(page.locator("#pi-chat-composer")).toBeVisible();
    await expect(page.locator("#pi-chat-message")).toBeVisible();

    // Small settle before sending
    await page.waitForTimeout(500);

    // Send a message — "hello" for a fast, short reply.
    await page.locator("#pi-chat-message").fill("hello");
    await page.locator("#pi-chat-send").click();

    // Wait for send button to become disabled (worker accepted)
    await expect(page.locator("#pi-chat-send")).toBeDisabled({ timeout: 10000 });

    console.log(`[flow 2] Message sent, starting observation...`);

    // Observe the timeline
    await observeTimeline(page, `Flow 2 (from session) — prompt: "hello"`);
  });
});
