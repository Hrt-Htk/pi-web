# Domain Packages and Vite Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor pi-web into focused Go domain packages and a Vite/Vitest-managed frontend while preserving current behavior.

**Architecture:** Keep the Go binary self-contained. Move backend code into `internal/*` packages with `cmd/pi-web` as the thin executable, and move browser logic into `web/src` ES modules built by Vite. Preserve all current routes and UI behavior during the migration.

**Tech Stack:** Go 1.25, standard `net/http`, `embed`, fsnotify, Vite, Vitest, jsdom, marked, highlight.js.

---

## File Structure

### Create

- `cmd/pi-web/main.go` — final CLI entrypoint and startup wiring.
- `internal/auth/auth.go` — token middleware and token extraction.
- `internal/chat/request.go` — chat multipart request parsing.
- `internal/sessions/session.go` — session model, parsing, formatting, sorting.
- `internal/sessions/cache.go` — session cache.
- `internal/sessions/lookup.go` — session filename lookup.
- `internal/rpc/client.go` — RPC command/response models and command builders.
- `internal/rpc/oneshot.go` — one-shot pi RPC command runner.
- `internal/rpc/worker.go` — long-lived pi RPC worker.
- `internal/workers/manager.go` — worker lifecycle and reaper.
- `internal/render/render.go` — export HTML generation and template assets.
- `internal/render/assets.go` — Vite manifest/static asset helpers.
- `internal/share/share.go` — GitHub Gist sharing.
- `internal/server/server.go` — server struct, routing, dependency interfaces.
- `internal/server/handlers.go` — HTTP handlers.
- `internal/server/events.go` — SSE clients and live reload handling.
- `internal/server/watcher.go` — file watcher.
- `web/package.json` — frontend scripts and dependencies.
- `web/vite.config.js` — Vite library-style multi-entry build config.
- `web/vitest.config.js` — Vitest jsdom config.
- `web/src/shared/escape.js` — HTML escaping helper.
- `web/src/shared/api.js` — fetch wrapper and JSON error normalization.
- `web/src/shared/storage.js` — localStorage JSON helpers.
- `web/src/shared/markdown.js` — marked/highlight setup with URL sanitization.
- `web/src/index/index.js` — sessions index Alpine component.
- `web/src/session/session.js` — session viewer entrypoint importing session modules.
- `web/src/session/format.js` — extracted format/render helper functions.
- `web/src/session/toggle-state.js` — toggle persistence helpers.
- `web/src/live/live.js` — live reload entrypoint.
- `web/src/**/*.test.js` — Vitest tests for extracted frontend helpers.

### Move or Modify

- Move root Go tests next to extracted packages as package tests.
- Keep `templates/template.html`, `templates/chat_composer.html`, `templates/template.css`, and `templates/index.html` initially; update script tags to point at Vite-built assets once asset helpers exist.
- Remove old root `.go` files only after equivalent package files compile and tests pass.

---

## Task 1: Scaffold Vite/Vitest with one real tested helper

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.js`
- Create: `web/vitest.config.js`
- Create: `web/src/shared/escape.js`
- Create: `web/src/shared/escape.test.js`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing frontend test**

Create `web/src/shared/escape.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape.js';

describe('escapeHtml', () => {
  it('escapes text for safe insertion into HTML strings', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)> & "quote"')).toBe(
      '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quote&quot;'
    );
  });

  it('treats nullish values as empty strings', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Add package config without implementation**

Create `web/package.json`:

```json
{
  "name": "pi-web-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "vite build"
  },
  "dependencies": {
    "@vitejs/plugin-legacy": "latest",
    "alpinejs": "latest",
    "highlight.js": "latest",
    "marked": "latest"
  },
  "devDependencies": {
    "@vitejs/plugin-legacy": "latest",
    "jsdom": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

Create `web/vite.config.js`:

```js
import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [legacy({ targets: ['defaults', 'not IE 11'] })],
  build: {
    manifest: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/index/index.js'),
        session: resolve(__dirname, 'src/session/session.js'),
        live: resolve(__dirname, 'src/live/live.js')
      }
    }
  }
});
```

Create `web/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
cd web && npm install && npm run test -- src/shared/escape.test.js
```

Expected: FAIL because `./escape.js` does not exist or does not export `escapeHtml`.

- [ ] **Step 4: Write minimal implementation**

Create `web/src/shared/escape.js`:

```js
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(value);
  return div.innerHTML;
}
```

- [ ] **Step 5: Ignore generated frontend dependencies and build output**

Append to `.gitignore` if not already present:

```gitignore
web/node_modules/
web/dist/
```

- [ ] **Step 6: Verify frontend test passes**

Run:

```bash
cd web && npm run test -- src/shared/escape.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .gitignore web/package.json web/package-lock.json web/vite.config.js web/vitest.config.js web/src/shared/escape.js web/src/shared/escape.test.js
git commit -m "test: add frontend tooling and escape helper"
```

---

## Task 2: Extract frontend API and storage helpers behind tests

**Files:**
- Create: `web/src/shared/api.js`
- Create: `web/src/shared/api.test.js`
- Create: `web/src/shared/storage.js`
- Create: `web/src/shared/storage.test.js`

- [ ] **Step 1: Write failing API tests**

Create `web/src/shared/api.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { getJSON, postJSON } from './api.js';

describe('api helpers', () => {
  it('returns parsed JSON for a successful GET', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(getJSON('/api/models', { fetchImpl })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith('/api/models', { headers: { Accept: 'application/json' } });
  });

  it('throws the JSON error message for failed responses', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'bad request' }), { status: 400 }));
    await expect(getJSON('/api/bad', { fetchImpl })).rejects.toThrow('bad request');
  });

  it('POSTs JSON bodies with the expected headers', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(postJSON('/api/new-session', { path: '/tmp/project' }, { fetchImpl })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith('/api/new-session', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/tmp/project' })
    });
  });
});
```

- [ ] **Step 2: Write failing storage tests**

Create `web/src/shared/storage.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest';
import { loadJSON, saveJSON } from './storage.js';

describe('storage helpers', () => {
  beforeEach(() => localStorage.clear());

  it('loads fallback when key is missing', () => {
    expect(loadJSON('missing', { collapsed: true })).toEqual({ collapsed: true });
  });

  it('saves and loads JSON values', () => {
    saveJSON('state', { a: 1 });
    expect(loadJSON('state', {})).toEqual({ a: 1 });
  });

  it('returns fallback when stored JSON is invalid', () => {
    localStorage.setItem('bad', '{');
    expect(loadJSON('bad', [])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd web && npm run test -- src/shared/api.test.js src/shared/storage.test.js
```

Expected: FAIL because `api.js` and `storage.js` do not exist.

- [ ] **Step 4: Implement API helper**

Create `web/src/shared/api.js`:

```js
async function parseJSONResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload && payload.error ? payload.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function getJSON(url, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  return parseJSONResponse(response);
}

export async function postJSON(url, body, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return parseJSONResponse(response);
}
```

- [ ] **Step 5: Implement storage helper**

Create `web/src/shared/storage.js`:

```js
export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
```

- [ ] **Step 6: Verify tests pass**

Run:

```bash
cd web && npm run test -- src/shared/api.test.js src/shared/storage.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/shared/api.js web/src/shared/api.test.js web/src/shared/storage.js web/src/shared/storage.test.js
git commit -m "test: add frontend API and storage helpers"
```

---

## Task 3: Add Vite entrypoints without serving them yet

**Files:**
- Create: `web/src/index/index.js`
- Create: `web/src/session/session.js`
- Create: `web/src/live/live.js`

- [ ] **Step 1: Write entrypoint smoke tests**

Create `web/src/index/index.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { createSessionsPage } from './index.js';

describe('createSessionsPage', () => {
  it('creates the sessions page Alpine state object', () => {
    const page = createSessionsPage();
    expect(page).toMatchObject({ query: '', modal: false, path: '', recent: [], creating: false, error: '' });
    expect(typeof page.filter).toBe('function');
    expect(typeof page.openModal).toBe('function');
    expect(typeof page.create).toBe('function');
  });
});
```

Create `web/src/session/session.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { sessionEntrypointLoaded } from './session.js';

describe('session entrypoint', () => {
  it('exports a load marker for smoke testing', () => {
    expect(sessionEntrypointLoaded).toBe(true);
  });
});
```

Create `web/src/live/live.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { liveEntrypointLoaded } from './live.js';

describe('live entrypoint', () => {
  it('exports a load marker for smoke testing', () => {
    expect(liveEntrypointLoaded).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd web && npm run test -- src/index/index.test.js src/session/session.test.js src/live/live.test.js
```

Expected: FAIL because entrypoint modules do not exist.

- [ ] **Step 3: Implement index entrypoint preserving current behavior**

Create `web/src/index/index.js`:

```js
import Alpine from 'alpinejs';
import { getJSON, postJSON } from '../shared/api.js';

export function createSessionsPage() {
  return {
    query: '',
    modal: false,
    path: '',
    recent: [],
    creating: false,
    error: '',

    subscribe() {
      try {
        const es = new EventSource('/events?id=__all__');
        es.onmessage = (e) => {
          if (e.data === 'new-session') window.location.reload();
        };
      } catch {}
    },

    filter() {
      const q = this.query.toLowerCase();
      document.querySelectorAll('.session-card').forEach((card) => {
        const match = card.dataset.search.toLowerCase().includes(q);
        card.classList.toggle('hidden', !match);
      });
      document.querySelectorAll('.project-group').forEach((group) => {
        const anyVisible = group.querySelector('.session-card:not(.hidden)') !== null;
        group.style.display = anyVisible ? '' : 'none';
      });
    },

    async openModal() {
      this.modal = true;
      this.path = '';
      this.error = '';
      this.recent = [];
      this.$nextTick(() => this.$refs.sessionPath.focus());
      try {
        const response = await getJSON('/api/recent-locations');
        this.recent = (response.locations || []).slice(0, 10);
      } catch {}
    },

    async create() {
      const p = this.path.trim();
      if (!p) {
        this.error = 'Please enter a path';
        return;
      }
      this.creating = true;
      this.error = '';
      try {
        const response = await postJSON('/api/new-session', { path: p });
        if (response.ok && response.id) {
          window.location = '/session?id=' + encodeURIComponent(response.id);
          return;
        }
        this.error = response.error || 'Failed to create session';
      } catch (error) {
        this.error = error.message || 'Network error';
      } finally {
        this.creating = false;
      }
    }
  };
}

window.sessionsPage = createSessionsPage;
window.Alpine = Alpine;
Alpine.start();
```

- [ ] **Step 4: Implement session and live smoke entrypoints**

Create `web/src/session/session.js`:

```js
export const sessionEntrypointLoaded = true;
```

Create `web/src/live/live.js`:

```js
export const liveEntrypointLoaded = true;
```

- [ ] **Step 5: Verify tests and Vite build pass**

Run:

```bash
cd web && npm run test -- src/index/index.test.js src/session/session.test.js src/live/live.test.js && npm run build
```

Expected: PASS and Vite writes `web/dist/.vite/manifest.json`.

- [ ] **Step 6: Commit**

```bash
git add web/src/index/index.js web/src/index/index.test.js web/src/session/session.js web/src/session/session.test.js web/src/live/live.js web/src/live/live.test.js
git commit -m "feat: add Vite frontend entrypoints"
```

---

## Task 4: Add Go asset manifest helper and serve Vite-built index entry

**Files:**
- Create: `internal/render/assets.go`
- Create: `internal/render/assets_test.go`
- Modify: `export.go`
- Modify: `main.go`
- Modify: `templates/index.html`

- [ ] **Step 1: Write failing asset manifest tests**

Create `internal/render/assets_test.go`:

```go
package render

import "testing"

func TestAssetManifestScriptPath(t *testing.T) {
	manifest := Manifest{
		"src/index/index.js": ManifestEntry{File: "assets/index-abc123.js"},
	}
	got, ok := manifest.ScriptPath("src/index/index.js")
	if !ok {
		t.Fatalf("expected script path to be found")
	}
	if got != "/static/assets/index-abc123.js" {
		t.Fatalf("script path = %q", got)
	}
}

func TestAssetManifestMissingScript(t *testing.T) {
	manifest := Manifest{}
	if got, ok := manifest.ScriptPath("missing.js"); ok || got != "" {
		t.Fatalf("missing script = %q, %v; want empty false", got, ok)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
go test ./internal/render -run TestAssetManifest
```

Expected: FAIL because `internal/render` or `Manifest` does not exist.

- [ ] **Step 3: Implement minimal manifest helper**

Create `internal/render/assets.go`:

```go
package render

import "strings"

type Manifest map[string]ManifestEntry

type ManifestEntry struct {
	File string `json:"file"`
}

func (m Manifest) ScriptPath(entry string) (string, bool) {
	item, ok := m[entry]
	if !ok || item.File == "" {
		return "", false
	}
	return "/static/" + strings.TrimPrefix(item.File, "/"), true
}
```

- [ ] **Step 4: Verify manifest helper passes**

Run:

```bash
go test ./internal/render -run TestAssetManifest
```

Expected: PASS.

- [ ] **Step 5: Wire built index script without removing old session scripts**

Modify `templates/index.html`:

1. Remove the inline `<script>function sessionsPage() { ... }</script>` block at the bottom.
2. Add this before `</body>`:

```html
<script type="module" src="{{ indexScript }}"></script>
```

Modify the existing index template parsing in `sessions.go` or the new render package when it exists so the template has this function:

```go
"indexScript": func() string { return "/static/assets/index.js" },
```

For this transitional task, if hashed manifest serving is not wired yet, configure Vite output for a stable file or copy the built index bundle to `/static/assets/index.js` in the later serving step. Do not change any session page scripts in this task.

- [ ] **Step 6: Verify Go tests still pass**

Run:

```bash
go test ./...
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/render/assets.go internal/render/assets_test.go templates/index.html sessions.go export.go main.go
git commit -m "feat: add frontend asset manifest helper"
```

---

## Task 5: Extract auth package

**Files:**
- Create: `internal/auth/auth.go`
- Create: `internal/auth/auth_test.go`
- Modify: `main.go`
- Remove after compile: `auth.go`, `auth_test.go`

- [ ] **Step 1: Move auth tests first**

Create `internal/auth/auth_test.go` by copying `auth_test.go` and changing the package line to:

```go
package auth
```

Rename helper construction from `newAuth` to `New` in the copied tests. Rename `tokenCookieName` references to `TokenCookieName`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
go test ./internal/auth
```

Expected: FAIL because package `internal/auth` has no implementation.

- [ ] **Step 3: Implement auth package**

Create `internal/auth/auth.go` from the current `auth.go`, with these exported names:

```go
package auth

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

const TokenCookieName = "pi_token"

type Middleware struct {
	token string
}

func New(token string) *Middleware {
	return &Middleware{token: strings.TrimSpace(token)}
}

func (a *Middleware) Enabled() bool {
	return a.token != ""
}

func (a *Middleware) Wrap(h http.HandlerFunc) http.HandlerFunc {
	if !a.Enabled() {
		return h
	}
	return func(w http.ResponseWriter, r *http.Request) {
		got, fromQuery := ExtractToken(r)
		if subtle.ConstantTimeCompare([]byte(got), []byte(a.token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if fromQuery {
			http.SetCookie(w, &http.Cookie{
				Name:     TokenCookieName,
				Value:    got,
				Path:     "/",
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
			})
		}
		h(w, r)
	}
}

func ExtractToken(r *http.Request) (string, bool) {
	if t := r.URL.Query().Get("token"); t != "" {
		return t, true
	}
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer "), false
	}
	if h := r.Header.Get("X-Pi-Token"); h != "" {
		return h, false
	}
	if c, err := r.Cookie(TokenCookieName); err == nil {
		return c.Value, false
	}
	return "", false
}
```

- [ ] **Step 4: Verify auth package tests pass**

Run:

```bash
go test ./internal/auth
```

Expected: PASS.

- [ ] **Step 5: Update root server wiring**

Modify `main.go` imports to include:

```go
"pi-web/internal/auth"
```

Replace:

```go
auth := newAuth(os.Getenv(tokenEnvVar))
srv := newServer(sessionsDir, auth)
```

with:

```go
authMiddleware := auth.New(os.Getenv(tokenEnvVar))
srv := newServer(sessionsDir, authMiddleware)
```

Update `server.auth` field type from `*authMiddleware` to `*auth.Middleware` and replace `.wrap`/`.enabled` call sites with `.Wrap`/`.Enabled`.

- [ ] **Step 6: Remove old auth files and verify all Go tests pass**

Run:

```bash
rm auth.go auth_test.go
go test ./...
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/auth/auth.go internal/auth/auth_test.go main.go
git rm auth.go auth_test.go
git commit -m "refactor: move auth into internal package"
```

---

## Task 6: Extract chat request package

**Files:**
- Create: `internal/chat/request.go`
- Create: `internal/chat/request_test.go`
- Modify: `chat_handler.go`
- Modify: `worker_manager.go`
- Modify: `rpc_client.go`
- Remove after compile: `chat_request.go`, `chat_request_test.go`

- [ ] **Step 1: Move request tests first**

Copy `chat_request_test.go` to `internal/chat/request_test.go` and change package to:

```go
package chat
```

Update tested names to exported names:

- `parseChatRequest` -> `ParseRequest`
- `defaultMaxImageBytes` -> `DefaultMaxImageBytes`
- `defaultMaxChatRequestBytes` -> `DefaultMaxRequestBytes`
- `errEmptyChatRequest` -> `ErrEmptyRequest`
- `errImageTooLarge` -> `ErrImageTooLarge`
- `errUnsupportedImageType` -> `ErrUnsupportedImageType`

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
go test ./internal/chat
```

Expected: FAIL because package implementation does not exist.

- [ ] **Step 3: Implement chat package**

Create `internal/chat/request.go` by copying `chat_request.go`, changing package to `chat`, and exporting the API:

```go
const DefaultMaxImageBytes int64 = 10 << 20
const DefaultMaxRequestBytes int64 = 32 << 20

var ErrEmptyRequest = errors.New("message or image required")
var ErrUnsupportedImageType = errors.New("only image attachments are supported")
var ErrImageTooLarge = errors.New("image attachment too large")

type Image struct {
	Type     string `json:"type"`
	Data     string `json:"data"`
	MimeType string `json:"mimeType"`
}

type Request struct {
	Message string
	Images  []Image
}

func ParseRequest(r *http.Request, maxImageBytes, maxRequestBytes int64) (Request, error) {
	// Use the current parseChatRequest body exactly, replacing type/error names with exported names.
}
```

When filling `ParseRequest`, copy the full current `parseChatRequest` body and replace:

- `ChatRequest` with `Request`
- `ChatImage` with `Image`
- `errEmptyChatRequest` with `ErrEmptyRequest`
- `errImageTooLarge` with `ErrImageTooLarge`
- `errUnsupportedImageType` with `ErrUnsupportedImageType`

- [ ] **Step 4: Verify chat package tests pass**

Run:

```bash
go test ./internal/chat
```

Expected: PASS.

- [ ] **Step 5: Update callers**

Import `pi-web/internal/chat` in root files that reference `ChatRequest` or request parsing.

Replace types:

```go
ChatRequest
```

with:

```go
chat.Request
```

Replace parsing in `chat_handler.go`:

```go
chatReq, err := chat.ParseRequest(r, chat.DefaultMaxImageBytes, chat.DefaultMaxRequestBytes)
```

Update error checks to `chat.ErrEmptyRequest`, `chat.ErrImageTooLarge`, and `chat.ErrUnsupportedImageType`.

- [ ] **Step 6: Remove old files and verify**

Run:

```bash
rm chat_request.go chat_request_test.go
go test ./...
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/chat/request.go internal/chat/request_test.go chat_handler.go worker_manager.go rpc_client.go
git rm chat_request.go chat_request_test.go
git commit -m "refactor: move chat request parsing into internal package"
```

---

## Task 7: Extract sessions package

**Files:**
- Create: `internal/sessions/session.go`
- Create: `internal/sessions/cache.go`
- Create: `internal/sessions/lookup.go`
- Create: matching tests under `internal/sessions/`
- Modify: `main.go`, `chat_handler.go`, `share.go`, `export.go`
- Remove after compile: `sessions.go`, `sessions_cache.go`, `session_lookup.go`, related root tests

- [ ] **Step 1: Move sessions tests first**

Copy these tests into `internal/sessions/` and change package to `sessions`:

- `main_test.go` -> `session_test.go`
- `sessions_cache_test.go` -> `cache_test.go`
- `session_lookup_test.go` -> `lookup_test.go`

Export tested names in test copies:

- `encodeProjectName` -> `EncodeProjectName`
- `decodeProjectName` -> `DecodeProjectName`
- `createSessionFile` -> `CreateSessionFile`
- `loadAllSessions` -> `LoadAll`
- `parseSession` -> `ParseFile`
- `newSessionCache` -> `NewCache`
- `resolveSessionByID` -> `ResolveByID`

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
go test ./internal/sessions
```

Expected: FAIL because implementation does not exist.

- [ ] **Step 3: Implement sessions package by moving code**

Move code as follows:

```bash
mkdir -p internal/sessions
cp sessions.go internal/sessions/session.go
cp sessions_cache.go internal/sessions/cache.go
cp session_lookup.go internal/sessions/lookup.go
```

In each copied file:

- change `package main` to `package sessions`
- export public API names listed in Step 1
- keep helper functions unexported when only used inside the package
- remove template-specific globals from `session.go` if they move to `internal/render` later; for this task it is acceptable to keep formatting helpers in `sessions` if tests require them

- [ ] **Step 4: Verify package tests pass**

Run:

```bash
go test ./internal/sessions
```

Expected: PASS.

- [ ] **Step 5: Update root callers**

Import:

```go
"pi-web/internal/sessions"
```

Update root code references:

- `Session` -> `sessions.Session`
- `loadAllSessions` -> `sessions.LoadAll`
- `newSessionCache` -> `sessions.NewCache`
- `resolveSessionByID` -> `sessions.ResolveByID`
- `createSessionFile` -> `sessions.CreateSessionFile`
- `listRecentLocations` -> `sessions.ListRecentLocations`

- [ ] **Step 6: Remove old files and verify**

Run:

```bash
rm sessions.go sessions_cache.go session_lookup.go main_test.go sessions_cache_test.go session_lookup_test.go
go test ./...
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/sessions main.go chat_handler.go share.go export.go
git rm sessions.go sessions_cache.go session_lookup.go main_test.go sessions_cache_test.go session_lookup_test.go
git commit -m "refactor: move sessions into internal package"
```

---

## Task 8: Extract RPC and worker packages

**Files:**
- Create: `internal/rpc/client.go`, `internal/rpc/oneshot.go`, `internal/rpc/worker.go`
- Create: `internal/workers/manager.go`
- Move tests: `rpc_client_test.go`, `worker_manager_test.go`
- Modify: `chat_handler.go`, `models_cache.go`, `main.go`
- Remove after compile: `rpc_client.go`, `rpc_oneshot.go`, `worker_manager.go`, matching tests

- [ ] **Step 1: Move RPC tests first**

Copy `rpc_client_test.go` to `internal/rpc/client_test.go` with package `rpc`.

Update function names if needed to exported names:

- `buildPromptCommand` -> `BuildPromptCommand`
- `buildSetThinkingLevelCommand` -> `BuildSetThinkingLevelCommand`
- `buildGetStateCommand` -> `BuildGetStateCommand`
- `writeRPCCommand` -> `WriteCommand`

- [ ] **Step 2: Run RPC tests to verify they fail**

Run:

```bash
go test ./internal/rpc
```

Expected: FAIL because implementation does not exist.

- [ ] **Step 3: Move RPC implementation**

Copy:

```bash
mkdir -p internal/rpc
cp rpc_client.go internal/rpc/client.go
cp rpc_oneshot.go internal/rpc/oneshot.go
```

Change package to `rpc` and export only functions needed outside the package:

- `OneShot`
- `NewPiWorker`
- `BuildPromptCommand` only if tests require direct access

- [ ] **Step 4: Move worker implementation into RPC package temporarily**

Copy `worker_manager.go` to `internal/rpc/worker.go` and delete the `WorkerManager` type from the copy, leaving only `piRPCWorker` and its helpers. Rename constructor:

```go
func NewPiWorker(sessionPath string) (workers.ChatWorker, error)
```

If this causes an import cycle with `internal/workers`, instead define the `ChatWorker` interface in `internal/rpc` for this task and move it to `internal/workers` in Step 6.

- [ ] **Step 5: Verify RPC tests pass**

Run:

```bash
go test ./internal/rpc
```

Expected: PASS.

- [ ] **Step 6: Move worker manager tests first**

Copy `worker_manager_test.go` to `internal/workers/manager_test.go`, change package to `workers`, and import `pi-web/internal/chat` for `chat.Request`.

- [ ] **Step 7: Run worker tests to verify they fail**

Run:

```bash
go test ./internal/workers
```

Expected: FAIL because manager implementation does not exist.

- [ ] **Step 8: Implement worker manager package**

Create `internal/workers/manager.go` by copying the `ChatWorker`, `WorkerFactory`, `WorkerManager`, `WorkerStatus`, and reaper code from `worker_manager.go`. Change package to `workers`. Use `chat.Request` for prompt arguments.

- [ ] **Step 9: Verify worker tests pass and update callers**

Run:

```bash
go test ./internal/workers
```

Expected: PASS.

Then update root callers to use:

```go
"pi-web/internal/rpc"
"pi-web/internal/workers"
```

Create the manager with:

```go
workers.NewManager(rpc.NewPiWorker)
```

- [ ] **Step 10: Remove old RPC/worker files and verify**

Run:

```bash
rm rpc_client.go rpc_oneshot.go worker_manager.go rpc_client_test.go worker_manager_test.go
go test ./...
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add internal/rpc internal/workers chat_handler.go models_cache.go main.go
git rm rpc_client.go rpc_oneshot.go worker_manager.go rpc_client_test.go worker_manager_test.go
git commit -m "refactor: move RPC and worker lifecycle into internal packages"
```

---

## Task 9: Extract render, share, server, and watcher packages

**Files:**
- Create: `internal/render/render.go`
- Create: `internal/share/share.go`
- Create: `internal/server/server.go`
- Create: `internal/server/handlers.go`
- Create: `internal/server/events.go`
- Create: `internal/server/watcher.go`
- Move matching tests from root.
- Modify: `main.go`
- Remove old files after compile.

- [ ] **Step 1: Move render tests first**

Copy these tests to `internal/render/` with package `render`:

- `export_html_test.go`
- `templates_embed_test.go`
- `ask_user_question_render_test.go`
- `chat_ui_test.go`
- `home_mobile_test.go`
- `mobile_sidebar_test.go`
- `model_selector_test.go`
- `toggle_state_test.go`

Update tests to import `pi-web/internal/sessions` and construct `sessions.Session` instead of root `Session`.

- [ ] **Step 2: Run render tests to verify they fail**

Run:

```bash
go test ./internal/render
```

Expected: FAIL because render implementation does not exist or still references root package names.

- [ ] **Step 3: Move render implementation**

Copy `export.go` to `internal/render/render.go`, change package to `render`, import `pi-web/internal/sessions`, and export:

- `GenerateExportHTML`
- `ChatComposerHTML` if server tests need it

Update function signatures from `Session` to `sessions.Session`.

- [ ] **Step 4: Verify render tests pass**

Run:

```bash
go test ./internal/render
```

Expected: PASS.

- [ ] **Step 5: Move share tests first**

Copy `share_test.go` to `internal/share/share_test.go` with package `share`. Use fake session loader and fake renderer interfaces instead of reaching into root server state.

- [ ] **Step 6: Move share implementation**

Create `internal/share/share.go` from `share.go`, changing package to `share` and exposing:

```go
type Runner interface {
	AuthStatus() error
	CreateGist(htmlPath string) (string, string, error)
}

func FindGh() string
func Handle(w http.ResponseWriter, r *http.Request, deps Dependencies)
```

Where `Dependencies` contains a runner, session loader, and renderer function. Preserve current status codes and JSON response fields.

- [ ] **Step 7: Verify share tests pass**

Run:

```bash
go test ./internal/share
```

Expected: PASS.

- [ ] **Step 8: Move server and watcher implementation**

Create `internal/server` files by moving server struct, handlers, SSE, and file watcher code out of `main.go`, `chat_handler.go`, and `file_watcher.go`. Keep `cmd` startup outside this package. Expose:

```go
func New(deps Dependencies) *Server
func (s *Server) Routes(authMiddleware interface{ Wrap(http.HandlerFunc) http.HandlerFunc }) http.Handler
```

Define `Dependencies` with concrete services from `sessions`, `workers`, `render`, and `share` packages.

- [ ] **Step 9: Thin main into cmd entrypoint**

Create `cmd/pi-web/main.go` with current startup logic. Leave a temporary root `main.go` only if needed for compatibility, but final command should build with:

```bash
go build ./cmd/pi-web
```

- [ ] **Step 10: Verify full Go test suite**

Run:

```bash
go test ./...
go vet ./...
```

Expected: both pass.

- [ ] **Step 11: Commit**

```bash
git add internal/render internal/share internal/server cmd/pi-web main.go templates
git rm export.go share.go file_watcher.go chat_handler.go
git commit -m "refactor: move rendering sharing and HTTP server into internal packages"
```

---

## Task 10: Final frontend migration and verification

**Files:**
- Modify: `templates/template.html`
- Modify: `templates/index.html`
- Modify: `internal/render/render.go`
- Modify: `internal/render/assets.go`
- Modify: `README.md`

- [ ] **Step 1: Add render test for built asset references**

Create or extend `internal/render/assets_test.go`:

```go
func TestGeneratedSessionHTMLUsesStaticScriptPath(t *testing.T) {
	sess := sessions.Session{ID: "test.jsonl", Header: map[string]any{"type": "session"}}
	html := GenerateExportHTML(sess, true)
	if !strings.Contains(html, "/static/") {
		t.Fatalf("generated html should reference static built assets: %s", html)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
go test ./internal/render -run TestGeneratedSessionHTMLUsesStaticScriptPath
```

Expected: FAIL while session HTML still uses inline scripts only.

- [ ] **Step 3: Move legacy session scripts into Vite entrypoint**

Import the existing session app scripts into `web/src/session/session.js` in lexical order. If direct imports fail because scripts rely on shared global scope, wrap the existing script contents in explicit module exports one file at a time, starting with pure helpers from `30-format.js` and `80-ui.js`.

Required invariant: generated session HTML still exposes the same DOM IDs and global behavior after the Vite bundle loads.

- [ ] **Step 4: Update templates to use built assets**

Modify `templates/template.html` so it no longer inlines `{{MARKED_JS}}`, `{{HIGHLIGHT_JS}}`, and `{{JS}}`. It should load the session bundle with:

```html
<script type="module" src="{{SESSION_SCRIPT}}"></script>
```

Modify render code to replace `{{SESSION_SCRIPT}}` with the manifest path for `src/session/session.js`.

Modify live reload loading so `src/live/live.js` is either imported by the session bundle or loaded as its own module script.

- [ ] **Step 5: Update README source-build instructions**

Add this to README development/install docs:

```markdown
When building from source after frontend changes:

```bash
cd web
npm install
npm run build
cd ..
go build -o pi-web ./cmd/pi-web
```
```

- [ ] **Step 6: Run final verification**

Run:

```bash
cd web && npm run test && npm run build
cd ..
go test ./...
go vet ./...
go build -o pi-web ./cmd/pi-web
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add web templates internal/render README.md pi-web
git commit -m "refactor: serve Vite-built frontend assets"
```

---

## Self-Review Checklist

- Spec coverage: backend domain packages covered in Tasks 5-9; Vite/Vitest frontend covered in Tasks 1-4 and 10; behavior preservation covered by tests and route compatibility checks.
- Placeholder scan: plan contains no placeholder markers. The implementation tasks that move existing code intentionally instruct copying current code where full source already exists in the repository.
- Type consistency: frontend helpers use `escapeHtml`, `getJSON`, `postJSON`, `loadJSON`, `saveJSON`; Go package exports use `auth.New`, `auth.Middleware`, `chat.ParseRequest`, `sessions.LoadAll`, `workers.NewManager`, `rpc.NewPiWorker`, `render.GenerateExportHTML`.
- Scope: this remains a large refactor. Execute task-by-task with fresh verification and commits; do not batch unrelated package moves.
