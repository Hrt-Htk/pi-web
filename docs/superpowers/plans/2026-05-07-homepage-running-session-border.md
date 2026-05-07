# Homepage Running Session Border Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a subtle animated dashed border around homepage session cards whose worker status is currently `running`.

**Architecture:** Keep the change homepage-local. Extend the index page Alpine state in `web/src/index/index.js` to track per-session running state, poll `/api/worker-status?id=...` for visible cards, and toggle a `session-card--running` class on matching DOM nodes. Render the visual treatment in `templates/index.html` with a pseudo-element overlay and a reduced-motion fallback.

**Tech Stack:** Go HTML templates, Alpine.js, Vite frontend bundle, Vitest, existing `/api/worker-status` JSON endpoint.

---

## File Structure

- `templates/index.html`
  - Homepage template and inline CSS for session cards.
  - Add `data-session-id` hooks and the `session-card--running` visual treatment.
- `web/src/index/index.js`
  - Homepage Alpine state.
  - Add running-status state, polling lifecycle, DOM class syncing, and cleanup.
- `web/src/index/index.test.js`
  - Unit tests for running-state class application, removal, polling behavior, and cleanup.
- `templates_embed_test.go` *(only if needed)*
  - Update only if an embed assertion needs to cover new frontend strings or imports.

### Task 1: Add failing frontend tests for running-card state management

**Files:**
- Modify: `web/src/index/index.test.js`
- Reference: `web/src/index/index.js`

- [ ] **Step 1: Add a DOM fixture helper and fetch stubs for session cards**

```js
function mountSessionCards() {
  document.body.innerHTML = `
    <div class="project-group">
      <div class="session-card" data-id="alpha.jsonl" data-session-id="alpha.jsonl" data-search="alpha"></div>
      <div class="session-card" data-id="beta.jsonl" data-session-id="beta.jsonl" data-search="beta"></div>
    </div>
  `;
}
```

- [ ] **Step 2: Add a failing test that applies the running class for a running session**

```js
it('applies running class to cards with running worker status', async () => {
  mountSessionCards();
  const fetchImpl = vi.fn(async (url) => {
    if (url === '/api/worker-status?id=alpha.jsonl') {
      return new Response(JSON.stringify({ state: 'running' }), { status: 200 });
    }
    return new Response(JSON.stringify({ state: 'idle' }), { status: 200 });
  });
  const page = createSessionsPage({ fetchImpl, pollIntervalMs: 25 });

  await page.refreshRunningStatuses();

  expect(document.querySelector('[data-session-id="alpha.jsonl"]')).toHaveClass('session-card--running');
  expect(document.querySelector('[data-session-id="beta.jsonl"]')).not.toHaveClass('session-card--running');
});
```

- [ ] **Step 3: Add a failing test that removes the running class when state changes away from running**

```js
it('removes running class when a running session becomes idle', async () => {
  mountSessionCards();
  let currentState = 'running';
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ state: currentState }), { status: 200 }));
  const page = createSessionsPage({ fetchImpl, pollIntervalMs: 25 });

  await page.refreshRunningStatuses();
  expect(document.querySelector('[data-session-id="alpha.jsonl"]')).toHaveClass('session-card--running');

  currentState = 'idle';
  await page.refreshRunningStatuses();

  expect(document.querySelector('[data-session-id="alpha.jsonl"]')).not.toHaveClass('session-card--running');
});
```

- [ ] **Step 4: Add a failing test that does not leave a stale running class after status errors**

```js
it('clears running class when worker status fetch fails', async () => {
  mountSessionCards();
  let fail = false;
  const fetchImpl = vi.fn(async () => {
    if (fail) return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
    return new Response(JSON.stringify({ state: 'running' }), { status: 200 });
  });
  const page = createSessionsPage({ fetchImpl, pollIntervalMs: 25 });

  await page.refreshRunningStatuses();
  expect(document.querySelector('[data-session-id="alpha.jsonl"]')).toHaveClass('session-card--running');

  fail = true;
  await page.refreshRunningStatuses();

  expect(document.querySelector('[data-session-id="alpha.jsonl"]')).not.toHaveClass('session-card--running');
});
```

- [ ] **Step 5: Add a failing test that subscribe() starts polling and cleanup stops it**

```js
it('starts status polling on subscribe and clears it during cleanup', () => {
  mountSessionCards();
  vi.useFakeTimers();
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ state: 'idle' }), { status: 200 }));
  const page = createSessionsPage({ fetchImpl, pollIntervalMs: 25 });

  page.subscribe();
  vi.advanceTimersByTime(60);
  expect(fetchImpl).toHaveBeenCalled();

  page.cleanup();
  const callsAfterCleanup = fetchImpl.mock.calls.length;
  vi.advanceTimersByTime(60);
  expect(fetchImpl.mock.calls.length).toBe(callsAfterCleanup);

  vi.useRealTimers();
});
```

- [ ] **Step 6: Run the frontend tests to verify they fail**

Run: `cd web && npm test -- src/index/index.test.js`
Expected: FAIL with `createSessionsPage(...).refreshRunningStatuses is not a function`, missing `cleanup`, or missing `session-card--running` behavior.

- [ ] **Step 7: Commit the failing tests**

```bash
git add web/src/index/index.test.js
git commit -m "test: cover homepage running session cards"
```

### Task 2: Implement homepage running-state polling and DOM class syncing

**Files:**
- Modify: `web/src/index/index.js`
- Test: `web/src/index/index.test.js`

- [ ] **Step 1: Extend `createSessionsPage` to accept dependencies and lifecycle state**

```js
export function createSessionsPage({ fetchImpl = window.fetch.bind(window), pollIntervalMs = 5000 } = {}) {
  return {
    query: '',
    modal: false,
    path: '',
    recent: [],
    creating: false,
    error: '',
    runningSessionIds: new Set(),
    _es: null,
    _pollTimer: null,
    _unloadHandler: null,
```

- [ ] **Step 2: Add helpers to read session ids and sync the running CSS class**

```js
    sessionCards() {
      return Array.from(document.querySelectorAll('.session-card[data-session-id]'));
    },

    syncRunningCardClasses() {
      this.sessionCards().forEach((card) => {
        const id = card.dataset.sessionId;
        card.classList.toggle('session-card--running', this.runningSessionIds.has(id));
      });
    },
```

- [ ] **Step 3: Add worker-status refresh logic with normal-state fallback on errors**

```js
    async refreshRunningStatuses() {
      const cards = this.sessionCards();
      const nextRunning = new Set();

      await Promise.all(cards.map(async (card) => {
        const id = card.dataset.sessionId;
        if (!id) return;
        try {
          const response = await fetchImpl('/api/worker-status?id=' + encodeURIComponent(id));
          if (!response.ok) return;
          const payload = await response.json();
          if (payload && payload.state === 'running') nextRunning.add(id);
        } catch {
          // Intentional no-op: unavailable status falls back to non-running.
        }
      }));

      this.runningSessionIds = nextRunning;
      this.syncRunningCardClasses();
    },
```

- [ ] **Step 4: Add polling start/stop helpers and integrate them with `subscribe()`**

```js
    startStatusPolling() {
      this.stopStatusPolling();
      void this.refreshRunningStatuses();
      this._pollTimer = window.setInterval(() => {
        void this.refreshRunningStatuses();
      }, pollIntervalMs);
    },

    stopStatusPolling() {
      if (this._pollTimer) {
        window.clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },

    cleanup() {
      this.stopStatusPolling();
      if (this._es) {
        this._es.close();
        this._es = null;
      }
      if (this._unloadHandler) {
        window.removeEventListener('beforeunload', this._unloadHandler);
        this._unloadHandler = null;
      }
    },
```

- [ ] **Step 5: Update `subscribe()` to reuse cleanup and preserve new-session reload behavior**

```js
    subscribe() {
      try {
        this.cleanup();
        const es = new EventSource('/events?id=__all__');
        this._es = es;
        es.onmessage = (e) => {
          if (e.data === 'new-session') window.location.reload();
        };
        this._unloadHandler = () => this.cleanup();
        window.addEventListener('beforeunload', this._unloadHandler);
        this.startStatusPolling();
      } catch {
        this.stopStatusPolling();
      }
    },
```

- [ ] **Step 6: Run the focused frontend tests to verify they pass**

Run: `cd web && npm test -- src/index/index.test.js`
Expected: PASS with the new running-state tests green.

- [ ] **Step 7: Commit the polling/state implementation**

```bash
git add web/src/index/index.js web/src/index/index.test.js
git commit -m "feat: track running sessions on homepage"
```

### Task 3: Add the animated dashed border treatment to homepage cards

**Files:**
- Modify: `templates/index.html`
- Reference: `docs/superpowers/specs/2026-05-07-homepage-running-session-border-design.md`

- [ ] **Step 1: Add a failing template assertion in the existing homepage-related Go test if coverage is easy to extend**

```go
if !strings.Contains(body, `data-session-id="`) {
	t.Fatal("homepage should expose session ids for running-status cards")
}
```

If there is no low-friction existing test for the homepage markup, skip this step and rely on Vitest + manual verification.

- [ ] **Step 2: Add the session id hook to each homepage session card**

```html
<div class="session-card"
     data-id="{{ .ID }}"
     data-session-id="{{ .ID }}"
     data-search="{{ sessionName . | html }} {{ .Project | html }}"
     @click="window.location='/session?id={{ .ID }}'">
```

- [ ] **Step 3: Add the pseudo-element animated border styles**

```css
.session-card {
  position: relative;
  overflow: hidden;
}

.session-card--running::before {
  content: "";
  position: absolute;
  inset: 7px;
  border-radius: 4px;
  pointer-events: none;
  background:
    repeating-linear-gradient(90deg, #ff5f56 0 12px, transparent 12px 24px) top / 200% 2px repeat-x,
    repeating-linear-gradient(180deg, #ff5f56 0 12px, transparent 12px 24px) right / 2px 200% repeat-y,
    repeating-linear-gradient(270deg, #ff5f56 0 12px, transparent 12px 24px) bottom / 200% 2px repeat-x,
    repeating-linear-gradient(0deg, #ff5f56 0 12px, transparent 12px 24px) left / 2px 200% repeat-y;
  animation: session-running-border 1.6s linear infinite;
}

@keyframes session-running-border {
  from { background-position: 0 0, 0 0, 0 100%, 0 0; }
  to { background-position: 24px 0, 0 24px, -24px 100%, 0 -24px; }
}
```

- [ ] **Step 4: Add a reduced-motion fallback**

```css
@media (prefers-reduced-motion: reduce) {
  .session-card--running::before {
    animation: none;
  }
}
```

- [ ] **Step 5: Verify the Vite bundle still builds after the template/style change**

Run: `cd web && npm run build`
Expected: PASS with a fresh production bundle in `web/dist`.

- [ ] **Step 6: Commit the homepage visual treatment**

```bash
git add templates/index.html web/dist
git commit -m "feat: add running border to homepage cards"
```

### Task 4: Verify end-to-end behavior and document any follow-up

**Files:**
- Modify: `README.md` *(only if you decide the homepage indicator is worth mentioning)*
- Verify: working tree output

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd web && npm test`
Expected: PASS.

- [ ] **Step 2: Run targeted Go tests that cover embedded assets if template markup changed**

Run: `go test ./...`
Expected: PASS, including any template embed assertions.

- [ ] **Step 3: Manually verify the homepage behavior in the browser**

Run: `make build`
Expected: PASS.

Then launch the app and confirm:
- a running session card shows the animated dashed border,
- an idle session card shows no running border,
- the border disappears after the session returns to idle,
- hover/click behavior is unchanged.

- [ ] **Step 4: Check the final diff before handoff**

Run: `git status --short`
Expected: no unexpected files beyond intended source edits and regenerated frontend build artifacts.

- [ ] **Step 5: Commit any final verification/doc updates**

```bash
git add README.md templates/index.html web/src/index/index.js web/src/index/index.test.js web/dist
git commit -m "chore: verify homepage running border"
```

## Self-Review

- Spec coverage: the plan covers the running-only border treatment, whole-card scope, no glow/tint, live state updates, stale-state clearing, reduced motion, and tests.
- Placeholder scan: no `TODO`/`TBD` placeholders remain; the one optional Go test step explicitly says to skip it if no low-friction test target exists.
- Type consistency: the plan consistently uses `session-card--running`, `data-session-id`, `refreshRunningStatuses`, `startStatusPolling`, `stopStatusPolling`, and `cleanup`.
