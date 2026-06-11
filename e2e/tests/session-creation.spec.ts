import { test, expect, collapseScratchpad } from "../lib/test";
import {
  buildSession,
  realWorkingDir,
  uniqueSessionName,
  writeSession,
} from "../lib/sessions";

/**
 * Diagnostic tests for session creation flows.
 *
 * Two entry points create a new session:
 *   1. From the sessions index (SessionsPage) — modal → POST /api/new-session { path }
 *   2. From within an existing session (SessionHeader) — header "+" button → POST /api/new-session { path, sourceSessionId }
 *
 * Both navigate to /session?id=<new-id> via SPA navigation (history.pushState).
 *
 * Known observations from diagnostic runs:
 * - New sessions have 1 entry (session header) and no conversation messages
 * - Flow 1 (from index): composer renders, user message appears after send
 * - Flow 2 (from session): composer may not render immediately (timing issue?)
 * - The stub pi reply ("Stub reply: ...") doesn't reliably surface after new session creation
 *   (works fine with pre-existing sessions — see chat.spec.ts)
 */
test.describe("session creation diagnostic", () => {
  test.beforeEach(async ({ page }) => {
    await collapseScratchpad(page);
  });

  // ─────────────────────────────────────────────────────────────────
  // Flow 1: Create from the sessions index (sessions view)
  // ─────────────────────────────────────────────────────────────────
  test.describe("create from sessions index", () => {
    test("navigates to new session and renders session page", async ({
      page,
      sessionsDir,
    }) => {
      const cwd = realWorkingDir();

      await page.goto("/");
      await page.locator("[data-sessions-content].index-layout-ready").waitFor();

      // Open modal, fill path, create
      await page.locator("#newSessionBtn").click();
      await expect(page.locator("#modalOverlay")).toBeVisible({ timeout: 5000 });
      await page.locator("#sessionPath").fill(cwd);
      await page.locator("#createBtn").click();

      // Verify navigation
      await expect(page).toHaveURL(/\/session\?id=/, { timeout: 15000 });

      // Session header is visible
      await expect(page.locator(".session-header-bar")).toBeVisible();

      // Chat composer is visible and enabled
      await expect(page.locator("#pi-chat-composer")).toBeVisible();
      await expect(page.locator("#pi-chat-composer")).toHaveAttribute("data-chat-available", "true");

      // Textarea is present
      await expect(page.locator("#pi-chat-message")).toBeVisible();

      // New session has structural entries but no conversation messages
      const treeStatus = await page.locator("#tree-status").textContent();
      console.log("[diagnostic] Flow 1 tree status:", treeStatus);
    });

    test("user message appears in chat after sending", async ({
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

      // Send a message
      const prompt = `e2e-index-${testInfo.workerIndex}-${Date.now()}`;
      await page.locator("#pi-chat-message").fill(prompt);
      await page.locator("#pi-chat-send").click();

      // Worker starts processing
      await expect(page.locator("#pi-chat-send")).toBeDisabled({ timeout: 5000 });
      await expect(page.locator("#pi-chat-status")).toHaveClass(/running/);

      // User's prompt appears via optimistic preview
      await expect(page.locator("#messages")).toContainText(prompt, { timeout: 10000 });
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Flow 2: Create from within an existing session
  // ─────────────────────────────────────────────────────────────────
  test.describe("create from within a session", () => {
    test("navigates to new session and renders session page", async ({
      page,
      sessionsDir,
    }, testInfo) => {
      const cwd = realWorkingDir();
      const { entries } = buildSession({ cwd });
      const name = uniqueSessionName(testInfo, "source");
      const sourceId = writeSession(sessionsDir, name, entries);

      // Navigate to existing session
      await page.goto(`/session?id=${encodeURIComponent(sourceId)}`);
      await expect(page.locator("#messages")).toContainText("Initial reply.");

      // Click "+" button in header
      await page.locator("#new-session-header-btn").click();

      // Verify navigation to a DIFFERENT session
      await expect(page).toHaveURL(/\/session\?id=/, { timeout: 15000 });
      await expect(page).not.toHaveURL(`?id=${encodeURIComponent(sourceId)}`);

      // Wait for the session page to settle (SessionPage.onMount completes)
      await page.waitForTimeout(1000);

      // Session header is visible
      await expect(page.locator(".session-header-bar")).toBeVisible();

      // Chat composer should be visible and enabled
      await expect(page.locator("#pi-chat-composer")).toBeVisible();
      await expect(page.locator("#pi-chat-composer")).toHaveAttribute("data-chat-available", "true");

      // Textarea is present
      await expect(page.locator("#pi-chat-message")).toBeVisible();

      const treeStatus = await page.locator("#tree-status").textContent();
      console.log("[diagnostic] Flow 2 tree status:", treeStatus);
    });

    test("user message appears in chat after sending", async ({
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

      // Wait for session page to settle
      await page.waitForTimeout(1000);

      // Send a message
      const prompt = `e2e-session-${testInfo.workerIndex}-${Date.now()}`;
      await page.locator("#pi-chat-message").fill(prompt);
      await page.locator("#pi-chat-send").click();

      // Worker starts processing
      await expect(page.locator("#pi-chat-send")).toBeDisabled({ timeout: 5000 });
      await expect(page.locator("#pi-chat-status")).toHaveClass(/running/);

      // User's prompt appears via optimistic preview
      await expect(page.locator("#messages")).toContainText(prompt, { timeout: 10000 });
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Comparative: side-by-side observations
  // ─────────────────────────────────────────────────────────────────
  test.describe("comparative observations", () => {
    test("both flows produce a session with chat available", async ({
      page,
      sessionsDir,
    }, testInfo) => {
      const cwd = realWorkingDir();
      const cwd2 = realWorkingDir();
      const { entries } = buildSession({ cwd: cwd2 });
      const sourceName = uniqueSessionName(testInfo, "source");
      const sourceId = writeSession(sessionsDir, sourceName, entries);

      // --- Flow 1: From index ---
      await page.goto("/");
      await page.locator("[data-sessions-content].index-layout-ready").waitFor();

      await page.locator("#newSessionBtn").click();
      await expect(page.locator("#modalOverlay")).toBeVisible({ timeout: 5000 });
      await page.locator("#sessionPath").fill(cwd);
      await page.locator("#createBtn").click();
      await expect(page).toHaveURL(/\/session\?id=/, { timeout: 15000 });

      const flow1SessionId = new URL(page.url()).searchParams.get("id");
      const flow1ChatAvailable = await page.locator("#pi-chat-composer").getAttribute("data-chat-available");
      console.log("[diagnostic] Flow 1:", { sessionId: flow1SessionId, chatAvailable: flow1ChatAvailable });

      // --- Flow 2: From within session ---
      await page.goto(`/session?id=${encodeURIComponent(sourceId)}`);
      await expect(page.locator("#messages")).toContainText("Initial reply.");

      await page.locator("#new-session-header-btn").click();
      await expect(page).toHaveURL(/\/session\?id=/, { timeout: 15000 });
      await page.waitForTimeout(1000);

      const flow2SessionId = new URL(page.url()).searchParams.get("id");
      const flow2ChatAvailable = await page.locator("#pi-chat-composer").getAttribute("data-chat-available");
      console.log("[diagnostic] Flow 2:", { sessionId: flow2SessionId, chatAvailable: flow2ChatAvailable });

      // Both sessions have chat available
      expect(flow1ChatAvailable).toBe("true");
      expect(flow2ChatAvailable).toBe("true");

      // Sessions are different from each other and from the source
      expect(flow1SessionId).not.toBe(flow2SessionId);
      expect(flow1SessionId).not.toBe(sourceId);
      expect(flow2SessionId).not.toBe(sourceId);
    });
  });
});
