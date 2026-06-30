# Development Rules

- **Do not write, edit, or build any code until the user explicitly says to proceed.** Investigate, propose a plan, and wait for approval before touching files.
- Only create an abstraction if it's actually needed
- Prefer clear function/variable names over inline comments
- Avoid helper functions when a simple inline expression would suffice
- Use knip to remove unused code if making large changes
- **Before any commit, PR, or issue:** read `docs/dev/workflow.md` and follow its rules — labels mandatory, conventional commits (`type(scope): desc` + `Closes #N`), branch naming (`type/issueN-description`), one issue one PR, never close an issue before its PR merges.
- **Before starting work on any issue:** create a properly named branch (`type/issueN-description`). Never work on `main` directly. Run `git status` first — it must be clean.
- Never start new work on a dirty tree. Run `git status` first; commit, stash, or discard changes before beginning. Scratch (`.tmp/`, `.pi/tasks/`, screenshots, transcripts) is gitignored so it never counts as dirty.

## Pre-flight (mandatory before any `edit` or `write` on source files)

**Before calling `edit` or `write` on any file under `web/src/`, `internal/`, `cmd/`, `e2e/`, or `docs/`, you MUST run these checks in order. If any check fails, STOP — do not proceed with the edit.**

1. **`git status`** — working tree must be clean. If dirty, tell the user and stop.
2. **`git branch --show-current`** — must match `type/issueN-description` (e.g. `feat/issue42-project-panel`). If on `main` or any other branch, tell the user and stop.
3. **Issue exists** — verify an open GitHub issue covers this work. If none exists, tell the user and stop (do not create the issue yourself — ask the user).

**This is not a suggestion. Run these three checks every time, before every code change.**

## Docs

Read the relevant doc in `@docs/` before structural changes, and update the matching doc whenever your change makes it out of date.

## Environment

- **Go:** `/c/Users/HTK/go/bin/go.exe` (add to PATH if not found: `export PATH="$PATH:/c/Users/HTK/go/bin"`)
- **Always build with `-o pi-web.exe`** — WSL/Git Bash produces `pi-web` (no extension) by default, but the user runs `pi-web.exe` from PATH. Without `.exe` the new binary is never picked up.
- **Restarting the server:** always kill the old PID and start the new binary in a **single command** — never ask the user to start it manually. Use: `powershell -Command "Stop-Process -Name pi-web -Force -ErrorAction SilentlyContinue" && sleep 2 && start "" pi-web.exe`. (PowerShell `Stop-Process -Name` is reliable; `taskkill` can fail with Access Denied.)
- **`make install` after building:** `~/.pi/agent/bin/pi-web.exe` (pi-managed) shadows the repo build when running `pi-web.exe` from PATH. After `make build`, run `make install` to copy the fresh binary there, otherwise the running server will serve stale embedded assets.
- **Node:** `/c/nvm4w/nodejs/` (npm at `C:/nvm4w/nodejs/npm.cmd`)
- **make:** `C:/Users/HTK/AppData/Local/Microsoft/WinGet/Packages/ezwinports.make_Microsoft.Winget.Source_8wekyb3d8bbwe/bin` (GNU Make 4.4.1, on the user PATH). A reduced shell may not see it — add to PATH: `export PATH="$PATH:/c/Users/HTK/AppData/Local/Microsoft/WinGet/Packages/ezwinports.make_Microsoft.Winget.Source_8wekyb3d8bbwe/bin"`. Note: make recipes run via `sh`, which can't resolve `npm` (it's `npm.cmd`), so `make build`/`make frontend-build` fail at the npm step. When that bites, run the steps directly: `cd web && /c/nvm4w/nodejs/npm.cmd run build` then `go build -ldflags="-s -w -X main.version=$(git describe --tags --always --dirty)" -o pi-web.exe ./cmd/pi-web`.

## Testing Pyramid

Every change must be tested at the appropriate level. Follow this bottom-up pyramid:

### Test-Driven Development (TDD) — mandatory

For every new feature or bug fix, write the test **before** the implementation:

1. **Red** — write a test that describes the desired behavior. Run it; it must fail.
2. **Green** — write the minimum code to make the test pass.
3. **Refactor** — clean up while keeping the test green.

The "watch it fail first" step is non-negotiable — it proves the test actually exercises the behavior. A test that passes on the first run is testing nothing.

**Exceptions** — TDD does not apply to:
- Documentation changes (`docs`)
- Build, config, or tooling changes (`chore`, `ci`, `build`)
- Quick UI tweaks with no logic (icon swaps, copy edits, removing dead buttons)
- Dependency bumps with no behavioral change

Everything else — backend handlers, worker/session logic, Svelte component behavior, bug fixes — is test-first. Pick the layer from the pyramid below that matches the change.

### Level 1: Unit Tests (mandatory for logic changes)
Pure functions: input → output, no side effects. Fast, isolated, run on every change.
- **Go:** table-driven tests in `*_test.go` alongside source.
- **Frontend:** tests next to source (`foo.js` → `foo.test.js`); DOM helpers take `{ documentImpl, windowImpl }` for DI.
- Run with `make test`.

### Level 2: Component Tests (mandatory for new Svelte components)
Components rendered in isolation with mocked props. Verify rendering, event handling, state transitions.
- Use `@testing-library/svelte` patterns with vitest.
- Test DOM structure and behavior, not visual appearance.

### Level 3: Integration Tests (mandatory for backend endpoints and cross-component flows)
- **Backend:** HTTP handlers with test server, DB mocks.
- **Frontend:** multi-component interactions, API call contracts.
- Verify contracts between layers.

### Level 4: E2E Tests (mandatory for critical user flows)
Real browser against running server. Playwright — lives in `e2e/`.
- **Screenshot on failure:** Playwright captures automatically.
- **Visual regression:** `expect(page).toHaveScreenshot()` for pixel-perfect UI changes.
- Run with `make e2e` (needs `make e2e-setup` once).
- Not in `test`/`check` — run explicitly when UI flows change.

### Level 5: Manual Browser Verification (mandatory for UI changes)
Before committing any UI change:
1. Build and serve: `make install` then restart server.
2. Open the affected page in the browser.
3. Verify the change visually works as expected.
4. Test edge cases: empty states, error states, transitions.
5. **If you can't verify it in the browser, the change is not done.**

### Commands
```bash
make test   # vitest + go test ./...
make check  # lint + format-check + test + build + vet (run before pushing)
make e2e    # Playwright E2E; needs `make e2e-setup` once. Not in test/check
```

### Additional Rules
- **Lint/format (frontend):** ESLint (`eslint-plugin-svelte`) + Prettier, config in `web/`. `make check` runs `frontend-lint` + `frontend-format-check`. Fix locally with `cd web && npm run format` (auto-format) and `npm run lint`. Style is 2-space indent, single quotes (enforced by Prettier).
- **NEVER stop, kill, or restart the production server on port `31415`.** This is a hard rule. The prod server is always running and must not be touched during development.
  - **Test server on separate port — always.** For any testing (E2E, screenshots, manual verification):
    - **E2E suite:** `e2e/lib/server.ts` auto-spawns a test server on a free port via `startServer()` — just run `cd e2e && npx playwright test <spec>`.
    - **Manual testing:** `PI_WEB_TOKEN="" start "" pi-web.exe -p <free-port> -host 127.0.0.1` (auth disabled, separate port).
    - **Killing a test server:** always target by PID, never by image name. Find PID via `netstat -ano | findstr :<port>` then `taskkill //PID <pid> //F`. Never use `taskkill //IM pi-web.exe //F` — that kills all instances including prod.
  - Never run tests against port `31415`.
- **Always `make build`, never `go build` alone** — `//go:embed` needs `web/dist` + `internal/ui/embedded/export/export.js` from the frontend build.

## Critical Rules

1. **Live app and export are separate renders.** Live = Svelte SPA via `internal/ui/embedded/app.html` (`spa_page.go`). Export/share = static snapshot via `internal/ui/embedded/share-session.html` (`export.go`), built from `web/src/export/export-entry.js` which reuses the live `web/src/session/` modules. Never leak live-only chrome (SPA scripts, SSE, chat) into the export.
2. **Existing session files are append-only for `session_info`** (browser rename + auto-titling). Conversation entries come from the `pi --mode rpc` worker, not pi-web.
3. **One worker per session.** Reused; crashed = evicted + replaced; idle reaped after 10 min.
4. **Icons:** Lucide only, via `web/src/shared/icons.js` — no hand-drawn SVG or hand-crafted unicode glyphs.
5. **i18n:** user-facing strings go through `t()` from `web/src/shared/i18n.js`; add keys to `web/src/shared/locales/en.js` first. Session content is never translated.
6. **Default port `31415`.** State: `~/.pi/agent/pi-web/pi-web-state.json`. SSE topics: `__all__` for index-wide, session ID per-session.
7. **Always interact with the fork (`Hrt-Htk/pi-web`), never the upstream (`ygncode/pi-web`).** Issues, PRs, and any GitHub interactions go to the fork only.

## User Override

If the user's instructions conflict with any rule in this document, ask for explicit confirmation before overriding. Only then execute their instructions.
