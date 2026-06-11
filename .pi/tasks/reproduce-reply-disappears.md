# Task: deterministically reproduce the "assistant reply flashes then disappears in a brand-new session" bug

Repo: H:/Software/pi-web. Full tools. Make ONLY the two changes below. Do NOT modify product code (`internal/`, `web/`). Do NOT run anything — I will run the tests.

## The bug being reproduced
In a newly-created session, the real `pi` worker streams a reply (briefly visible), then signals `done`. The frontend (`web/src/session/live/live-events.js:123`) reloads `/api/session` on `done` and then calls `clearChatPreview()` (`:73`). If the canonical assistant entry isn't on disk yet when that fetch happens, the visible reply is cleared and never recovered (for a brand-new session) until a full page reload. The current e2e stub hides this because it writes the entry BEFORE sending `done`.

## Change 1 — make the stub able to emit `done` BEFORE writing the canonical entry (opt-in per prompt)

File: `e2e/lib/stub-pi/pi` (a plain-JS Node script; read it first).

Currently `handlePrompt` does (inside one `setTimeout(delay)`): append user+assistant entries, THEN send `message_update`/`message_end`/`turn_end`/`agent_end`.

Add an OPT-IN "deferred write" mode keyed off a marker in the prompt message so other specs are unaffected: if `cmd.message` contains the substring `[[defer-write]]`, then:
  1. Immediately (after the normal `respond(cmd.id, "prompt", {})` ack) send the stream + done events so the reply renders as a preview and the `done` reload fires: `message_update` (with `assistantMessageEvent.text = reply`), `message_end`, `turn_end`, `agent_end`.
  2. Only AFTER an additional ~1500ms delay, append the user + assistant canonical entries to the session file (the same entries it writes today).

When the marker is absent, behave EXACTLY as today (write entries first, then send events). Keep the `reply` text as `Stub reply: ${userText}` in both modes (so assertions can match on it). Note: the marker is part of `userText`; that's fine — the reply will read `Stub reply: ...[[defer-write]]...` and tests will match on the unique token, not the whole string.

Keep the code minimal and in the same style.

## Change 2 — add a persistence test that catches the disappearance

File: create `e2e/tests/reply-persistence.spec.ts`. Mirror imports/helpers/selectors from `e2e/tests/new-session-reply.spec.ts` and `e2e/tests/chat.spec.ts`.

Add a `test.describe("new session reply persistence", ...)` with `collapseScratchpad` in `beforeEach`, and ONE test:

**"flow 1 — new session reply stays visible (deferred write)":**
  - `page.goto("/")`, wait `[data-sessions-content].index-layout-ready`.
  - Click `#newSessionBtn`, wait `#modalOverlay` visible, fill `#sessionPath` with `realWorkingDir()`, click `#createBtn`, wait URL `/\/session\?id=/`.
  - Build a unique token: `const token = `persist-${testInfo.workerIndex}-${Date.now()}``.
  - Fill `#pi-chat-message` with `` `${token} [[defer-write]]` `` and click `#pi-chat-send`.
  - Assert the reply becomes visible (the flash): `await expect(page.locator("#messages")).toContainText(token, { timeout: 10000 });`
  - Then assert it is STILL visible after the canonical write + reload settle — this is the assertion that fails on the bug:
    `await page.waitForTimeout(4000);`
    `await expect(page.locator("#messages")).toContainText(token);`  // no timeout = must be present right now

Also add a **control** test in the same file proving a pre-existing session is fine with the deferred write (so we know the repro is new-session-specific):
**"control — pre-existing session reply stays visible (deferred write)":** use `buildSession`/`writeSession` like chat.spec.ts, goto the session, send `` `${token} [[defer-write]]` ``, assert `toContainText(token)` within 10s, `waitForTimeout(4000)`, assert `toContainText(token)` still present.

## Report back
The exact files changed/created and the relevant snippets. Do NOT run Playwright or build — I will run it.
