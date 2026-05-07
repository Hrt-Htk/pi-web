# Domain Packages and Vite Frontend Refactor Design

## Summary

Refactor `pi-web` from a flat Go `package main` plus embedded ad-hoc JavaScript into clearer backend domain packages and a Vite/Vitest-powered frontend codebase. The refactor preserves the current HTTP API, session rendering behavior, and visible UI behavior. Its goal is maintainability, testability, and safer future changes, not feature expansion or UI redesign.

## Goals

- Split backend responsibilities into focused internal Go packages with stable interfaces.
- Move frontend behavior into Vite-managed ES modules with Vitest coverage for pure logic.
- Preserve existing routes, response shapes, status codes, and browser behavior.
- Keep pi-web deployable as a single Go binary with embedded frontend assets.
- Add tests before each behavior-preserving extraction.

## Non-goals

- No visible redesign of the sessions index or session viewer.
- No authentication or CSRF behavior changes in this refactor.
- No changes to pi session JSONL semantics.
- No conversion to a database or long-running daemon architecture.
- No broad dependency cleanup beyond what Vite/Vitest requires.

## Backend Architecture

The current root-level Go files will move into focused packages under `internal/`, with `cmd/pi-web` as the executable entrypoint.

### `cmd/pi-web`

Owns only CLI/runtime wiring:

- flag parsing
- sessions directory selection
- bind host selection
- auth construction
- server construction
- browser opening
- startup logging

It should not parse sessions, render HTML, manage workers, or implement handlers directly.

### `internal/server`

Owns HTTP composition and request routing:

- `http.ServeMux` setup
- handler methods for current routes
- SSE client registration and broadcast coordination
- dependency wiring through interfaces

The package depends on domain services rather than concrete root-level globals. It should preserve these routes:

- `/`
- `/session`
- `/api/session`
- `/api/chat`
- `/api/set-model`
- `/api/set-thinking-level`
- `/api/models`
- `/api/worker-status`
- `/share`
- `/events`
- `/api/new-session`
- `/api/recent-locations`
- `/static/*` for built frontend assets

### `internal/auth`

Owns token authentication:

- token trimming
- enabled/disabled state
- token extraction from query/header/cookie
- middleware wrapping
- cookie creation

This refactor preserves current auth semantics exactly.

### `internal/sessions`

Owns session storage and lookup:

- session structs
- JSONL parsing
- project name encoding/decoding
- session cache
- session lookup by filename
- recent locations
- new session file creation
- sorting and formatting helpers used by templates, where backend-owned

Behavior must remain compatible with existing pi session files.

### `internal/chat`

Owns browser chat request parsing:

- multipart form parsing
- message trimming
- image extraction
- MIME validation
- max request/image sizes
- request model passed to workers

The package exposes explicit errors so HTTP handlers can preserve current status-code mapping.

### `internal/rpc`

Owns low-level pi RPC protocol details:

- command construction
- response parsing
- one-shot RPC calls
- long-lived `pi --mode rpc` process interaction
- scanner buffer sizing
- stderr capture

The package should not know about HTTP handlers.

### `internal/workers`

Owns worker lifecycle coordination:

- worker manager map
- per-session worker reuse
- errored-worker eviction
- idle reaping
- manager shutdown

It depends on an RPC worker factory interface, not directly on HTTP request types.

### `internal/render`

Owns HTML rendering and embedded assets:

- session export HTML generation
- template execution
- theme variable computation
- chat composer fragment rendering during the initial migration; later movement to frontend modules requires a separate approved change
- serving or embedding Vite build output

The server package calls render APIs instead of manipulating templates directly.

### `internal/share`

Owns GitHub Gist snapshot sharing:

- `gh` discovery
- auth status check
- temporary snapshot file creation
- gist creation
- gist URL/id parsing

The package exposes a runner interface for tests.

## Frontend Architecture

Create a Vite app under `web/`. Source code lives in `web/src`, tests in `web/src/**/*.test.js` or `web/tests`.

### `web/src/shared`

Shared browser utilities:

- API client wrapper around `fetch`
- HTML escaping
- DOM helpers
- URL helpers
- markdown/highlight initialization
- localStorage helpers

### `web/src/index`

Sessions index page behavior:

- search/filtering
- new-session modal
- recent locations
- global SSE subscription for new sessions

### `web/src/session`

Session viewer behavior:

- session data bootstrapping
- tree construction and filtering
- entry rendering
- header rendering
- navigation
- sidebar state
- toggle state persistence
- chat composer interactions
- model selector
- thinking-level selector

### `web/src/live`

Live session update behavior:

- EventSource connection
- reload event handling
- incremental `/api/session` refresh
- share dialog interactions currently in live reload code, unless moved to `session`

### Vendor Dependencies

Vite will initially use package dependencies for `marked`, `highlight.js`, and Alpine-compatible behavior where needed. Existing vendored browser files remain only until their replacements are wired through the Vite build. The first implementation should favor the least risky migration path:

- keep rendering output compatible with current `marked` and `highlight.js` usage
- avoid changing markdown sanitization behavior
- avoid changing CSS class names consumed by existing templates/tests

## Asset Build and Embedding

The Go binary remains self-contained.

Expected flow:

1. Vite builds frontend assets into `web/dist`.
2. Go embeds the built assets.
3. Server-rendered pages reference built JS/CSS asset paths through render helpers or a manifest.
4. Tests verify required built assets or manifest entries exist.

Development can use Vite directly for frontend tests/builds, but production remains `go build` after assets are built.

## Testing Strategy

Use TDD for each extraction step.

### Backend Tests

Before moving production code, add or adapt tests that describe the package behavior:

- `internal/auth`: token extraction, middleware, cookie behavior
- `internal/sessions`: parsing, cache invalidation, lookup, creation, path encoding
- `internal/chat`: multipart parsing, image limits, MIME validation, empty request rejection
- `internal/workers`: reuse, errored eviction, idle reaping, close semantics
- `internal/rpc`: command/response helpers and one-shot behavior with controlled test subprocesses where practical
- `internal/server`: route method/status preservation through injected fakes
- `internal/render`: generated HTML contains required bootstrapping, scripts, and escaped title/session content
- `internal/share`: `gh` runner behavior and response parsing with fakes

Existing tests should move with their packages and remain meaningful.

### Frontend Tests

Add Vitest coverage before extracting frontend logic:

- HTML escaping and safe markdown URL behavior
- tree-building and filtering behavior
- entry formatting helpers
- toggle state load/save behavior
- API client error normalization
- model/thinking selector pure state helpers where separable

DOM-heavy behavior can start with targeted jsdom tests. Avoid broad snapshot tests that only lock in implementation noise.

### Final Verification Commands

The implementation is not complete until all of these pass freshly:

- `go test ./...`
- `go vet ./...`
- `npm run test`
- `npm run build`

## Migration Plan Shape

The eventual implementation plan should sequence work to keep the app runnable after each phase:

1. Introduce frontend tooling and tests without changing served behavior.
2. Extract pure frontend helpers behind tests.
3. Switch Go embedding to built frontend assets.
4. Extract backend packages one domain at a time, moving tests with each package.
5. Thin `cmd/pi-web` to startup wiring.
6. Run full verification and remove obsolete root-level files or duplicate assets.

## Compatibility Requirements

- Existing public routes continue to work.
- Existing query parameters continue to work.
- Existing JSON response fields continue to work.
- Existing session IDs remain filenames as currently expected by the browser.
- Existing launchd plist and README commands continue to point at the `pi-web` binary.
- Existing UI behavior is preserved unless a change is explicitly approved separately.

## Risks and Mitigations

### Risk: Frontend build step complicates Go-only installation

Mitigation: document that source builds require frontend asset build first, while release binaries remain self-contained. Keep generated output or embedding strategy explicit in the implementation plan.

### Risk: Package extraction creates import cycles

Mitigation: define dependency direction up front: `cmd` -> `server` -> domain interfaces; domain packages do not import `server` or `cmd`.

### Risk: Behavior changes during large file moves

Mitigation: move one domain at a time under existing tests, adding tests before each move. Preserve route-level tests around status codes and response shapes.

### Risk: Browser rendering changes from module bundling

Mitigation: test pure rendering helpers before extraction, preserve CSS classes and DOM IDs, and verify generated pages include required bootstrapping data and assets.

### Risk: Vite asset manifest adds complexity to server rendering

Mitigation: start with a small render helper that maps logical asset names to built files and has focused tests. Do not spread manifest parsing across handlers.

## Open Decisions Resolved

- Refactor level: aggressive.
- Frontend tooling: full Vite/Vitest toolchain is acceptable.
- Backend split: domain packages under `internal/`.
- UI behavior: preserve current visible behavior.
