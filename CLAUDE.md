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
- **Always build with `-o pi-web.exe`** — WSL/Git Bash produces `pi-web` (no extension) by default. Without `.exe` Windows can't run it.
- **Server layout:** prod runs from `h:\software\pi-web-prod\pi-web.exe` (port 31415). Test server runs from `h:\software\pi-web\pi-web.exe` (port 31416). Always use explicit paths — `pi-web.exe` is not in PATH.
- **Deploying / restarting the prod server:** use `scripts/deploy.ps1` — it stops prod by its recorded PID, copies the freshly built `pi-web.exe` into `h:\software\pi-web-prod\`, restarts it on 31415, and records the new PID. To start prod without redeploying (e.g. after a reboot), use `h:\software\pi-web-prod\start-prod.ps1`. **Never** stop prod with `Stop-Process -Name pi-web` or `taskkill /IM pi-web.exe` — those kill *every* pi-web instance, including a running test server on 31416. See "Deploying to prod" below for the full procedure.
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
1. Build (see Environment — run the frontend build, then `go build -o pi-web.exe`), then start the isolated test server: `pwsh -ExecutionPolicy Bypass -File scripts/start-test-server.ps1` (port 31416). Do NOT deploy to prod to verify UI changes.
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
- **NEVER stop, kill, or restart the production server on port `31415` during development or testing.** This is a hard rule — the prod server is always running and must not be touched by dev/test work. The ONLY sanctioned way to stop or replace prod is `scripts/deploy.ps1` (a deliberate deploy action — see "Deploying to prod").
  - **Test server on separate port — always.** For any testing (E2E, screenshots, manual verification):
    - **E2E suite:** `e2e/lib/server.ts` auto-spawns a test server on a free port via `startServer()` — just run `cd e2e && npx playwright test <spec>`.
    - **Manual testing (launch):** `pwsh -ExecutionPolicy Bypass -File scripts/start-test-server.ps1` — starts on port `31416` (localhost only, auth disabled), records PID to `.tmp/test-server.pid`. Fails if already running or if `pi-web.exe` is missing. (Requires PowerShell 7+ / `pwsh`; the script uses `Start-Process -Environment`, which Windows PowerShell 5.1 lacks.)
    - **Isolated data:** the test server runs against an isolated throwaway agent dir (`.tmp/test-agent`, gitignored), mirrored from the real sessions via `robocopy /MIR` on each startup. So you can rename/title/drive sessions on 31416 without ever touching the real `~/.pi/agent/sessions` that prod serves. Pass `-NoRefresh` to skip the mirror and reuse the existing copy for a fast restart.
    - **Manual testing (stop):** `pwsh -ExecutionPolicy Bypass -File scripts/stop-test-server.ps1` — kills ONLY the test server by recorded PID. Safe — never touches prod.
    - **NEVER use `taskkill //IM pi-web.exe`** — that kills ALL instances including prod. The stop script targets only the test server PID.
  - Never run tests against port `31415`.
- **Run the frontend build before `go build`** — `//go:embed` needs `web/dist` + `internal/ui/embedded/export/export.js`, produced by the frontend build. `make build` does both, but fails in a reduced shell where `npm` isn't resolvable (see Environment); when that happens, build directly: `cd web && npm run build` then `go build -o pi-web.exe ./cmd/pi-web`. Never ship a `go build` that skipped the frontend build.

## Deploying to prod

Prod runs from `h:\software\pi-web-prod\pi-web.exe` on port 31415 with auth enabled (the `PI_WEB_TOKEN` User-level environment variable) and serves the real sessions at `~/.pi/agent/sessions`. Deploy is a deliberate action, separate from dev/test work.

1. Build the binary (frontend build then `go build -o pi-web.exe`, see Environment). The output is `.\pi-web.exe` in the dev repo.
2. Run `pwsh -ExecutionPolicy Bypass -File scripts/deploy.ps1`. It stops the current prod by recorded PID, copies the binary into `pi-web-prod\`, restarts on 31415, and writes the new PID to `pi-web-prod\.tmp\prod-server.pid`.
3. Verify: `http://localhost:31415/` returns HTTP 401 (auth on) and the running version reflects your build.

`deploy.ps1` is the ONLY sanctioned way to stop or replace prod. Never kill prod by process name (`Stop-Process -Name pi-web` / `taskkill`) — it would also kill any running test server.

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
