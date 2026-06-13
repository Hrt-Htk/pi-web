import { test } from "../lib/test";

/**
 * DIAGNOSTIC — TRUE overview flow (source-less new session) against REAL pi.
 *
 * Reproduces the path that still fails: create a session the way the sessions
 * overview page does (POST /api/new-session { path } with NO sourceSessionId),
 * navigate to it, send a message, and watch #messages-list over time while
 * capturing ALL browser console logs (so we can see whether pi-worker-done /
 * the retry-reconcile actually fire).
 *
 * Run: cd e2e && npx playwright test tests/overview-flow-observe.spec.ts \
 *        --project="Desktop Chrome" --config=playwright-real.config.ts
 */

const POLL_INTERVAL_MS = 250;
const OBSERVATION_DURATION_MS = 18_000;

test("overview flow — source-less new session, observe list + console", async ({ page }) => {
  // Discover a real working dir from an existing session so the path is valid.
  const res = await page.request.get("/api/sessions");
  const data = await res.json();
  const list: any[] = Array.isArray(data) ? data : data.sessions || [];
  const withCwd = list.find((s: any) => s.Cwd || s.cwd);
  const cwd = withCwd?.Cwd || withCwd?.cwd || "H:/Software/pi-web";
  console.log(`[overview] using path: ${cwd}`);

  // Capture ALL console logs from the page.
  const logs: string[] = [];
  page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));

  // Create a brand-new session exactly like SessionsPage.createSession (no source).
  const createRes = await page.request.post("/api/new-session", {
    data: { path: cwd },
  });
  const created = await createRes.json();
  console.log(`[overview] create response:`, JSON.stringify(created));
  const newId = created.id;
  if (!newId) throw new Error("no id from /api/new-session");

  // Navigate to the new session (full SPA load of the session route).
  await page.goto(`/session?id=${encodeURIComponent(newId)}`);
  await page.waitForSelector("#pi-chat-message", { timeout: 15000 });
  await page.waitForTimeout(800);

  // Send the first message.
  await page.locator("#pi-chat-message").fill("hello");
  await page.locator("#pi-chat-send").click();
  console.log(`[overview] sent 'hello', observing...`);

  const ticks = Math.ceil(OBSERVATION_DURATION_MS / POLL_INTERVAL_MS);
  for (let i = 0; i < ticks; i++) {
    const elapsed = ((i * POLL_INTERVAL_MS) / 1000).toFixed(2);
    const s = await page.evaluate(() => {
      const list = document.getElementById("messages-list");
      const host = document.getElementById("chat-preview-host");
      const pendingUser = !!document.getElementById("chat-pending-user");
      const preview = !!document.getElementById("chat-preview-stream");
      const status = document.getElementById("pi-chat-status");
      return {
        list: list ? list.children.length : -1,
        host: host ? host.children.length : -1,
        pendingUser,
        preview,
        status: status ? Array.from(status.classList).join(",") : "none",
      };
    });
    console.log(
      `[t+${elapsed}s] list=${s.list} host=${s.host} pendingUser=${s.pendingUser ? "Y" : "n"} preview=${s.preview ? "Y" : "n"} status=${s.status}`,
    );
    if (i < ticks - 1) await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  console.log(`\n[overview] ===== BROWSER CONSOLE LOGS =====`);
  for (const l of logs) console.log(`  ${l}`);
});
