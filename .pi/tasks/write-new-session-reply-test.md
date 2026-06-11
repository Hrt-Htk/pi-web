# Task: write a faithful Playwright reproduction test for the new-session "assistant reply never appears" bug

Repo: H:/Software/pi-web. You have full tools. **Write ONE new test file only. Do NOT run anything, do NOT modify other files, do NOT touch product code.** I will run the test myself.

## Why
The existing `e2e/tests/session-creation.spec.ts` only asserts the user's OWN optimistic message preview appears — it never asserts the assistant reply materializes. So it passes even though the real bug is "assistant reply never shows in a newly-created session." We need a test that asserts the assistant reply, mirroring the pre-existing-session control in `e2e/tests/chat.spec.ts`.

The stub `pi` writes a deterministic `Stub reply: <prompt>` into the session file on every prompt; the browser surfaces it via the live-reload SSE path. The control test asserts exactly:
```ts
await expect(page.locator("#messages")).toContainText(`Stub reply: ${prompt}`, { timeout: 20000 });
```

## Read these first to copy patterns/selectors EXACTLY (do not invent selectors)
- `e2e/tests/chat.spec.ts` — the working pre-existing-session reply assertion (imports, helpers, selectors, 20s timeout).
- `e2e/tests/session-creation.spec.ts` — the exact UI steps for both new-session flows (modal selectors `#newSessionBtn`, `#sessionPath`, `#createBtn`; header button `#new-session-header-btn`; the `realWorkingDir`, `buildSession`, `uniqueSessionName`, `writeSession` helpers from `../lib/sessions`; `collapseScratchpad` from `../lib/test`).

## Create `e2e/tests/new-session-reply.spec.ts` with THREE tests, each sending a unique prompt and asserting `#messages` contains `Stub reply: <prompt>` within 20000ms:

1. **control — pre-existing session shows the reply** (this should PASS; it proves the harness/stub works): copy `chat.spec.ts`'s flow verbatim (write a session with `buildSession`/`writeSession`, goto it, fill `#pi-chat-message`, click `#pi-chat-send`, assert the reply).

2. **flow 1 — new session from the sessions index shows the reply**: `page.goto("/")`, wait for `[data-sessions-content].index-layout-ready`, click `#newSessionBtn`, wait `#modalOverlay` visible, fill `#sessionPath` with `realWorkingDir()`, click `#createBtn`, wait for URL `/\/session\?id=/`. Then fill `#pi-chat-message` with a unique prompt, click `#pi-chat-send`, and assert `#messages` contains `Stub reply: <prompt>` within 20000ms.

3. **flow 2 — new session from within a session shows the reply**: create + write a source session (`buildSession`/`writeSession`), goto it, wait for `#messages` to contain `"Initial reply."`, click `#new-session-header-btn`, wait for URL change to a different `/session?id=`, `await page.waitForTimeout(1000)`, then fill `#pi-chat-message`, click `#pi-chat-send`, and assert the `Stub reply: <prompt>` within 20000ms.

Use `collapseScratchpad(page)` in a `beforeEach` like the diagnostic spec does. Match the existing file style (double quotes, 2-space indent, the same imports). Wrap in a `test.describe("new session assistant reply", () => { ... })`.

## Report back
Just the path of the file you created and its full contents. Do NOT run Playwright or any build — I will run it.
