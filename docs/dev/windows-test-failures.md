# Pre-existing test failures on Windows

The repository's `make test` suite is **not green on Windows** (`win32`). These
failures pre-date the current feature work and are almost all environmental
(POSIX assumptions, file-locking, jsdom setup) rather than product bugs. This is
a punch-list to make the suite pass on Windows later.

Captured on `main` (Go 1.x, Node via nvm4w). Counts are approximate — some jsdom
failures are timing-sensitive and vary run to run.

> Not in this list: `TestResumeButtonShowsToastWithoutChangingButtonText`
> (`internal/ui`) fails only because of an uncommitted WIP edit to
> `export_html_test.go` that expects an unimplemented `sessionId`-prop refactor —
> not a Windows issue.

## Go — ~24 failures across 5 packages

### 1. POSIX path assumptions (tests hard-code `/abs/path`)
On Windows `filepath.IsAbs("/abs/path")` is **false** (no drive letter), so
absolute-path validation rejects the fixtures.
- `internal/server`: `TestNormalizeProjectPath`, `TestHandleUpdateProject`
- `internal/files`: `TestHandleApiFiles_EmptyQueryLists`,
  `TestHandleApiFiles_LongQueryGoesDeep`, `TestHandleApiFiles_RanksMatches`,
  `TestWalkScopedMaxEntries`
- Likely fix: build paths with `t.TempDir()` / `filepath.Join` (or drive-prefix)
  instead of literal `/...`, and use `filepath`-aware comparisons.

### 2. Session entry off-by-one (pagination / fork / clone / new-session)
Counts are off by one (e.g. "total = 30, want 31"); suspect CRLF line endings in
test fixtures or a path-derived parse difference.
- `internal/server`: `TestHandleApiSession_NoPaginationByDefault`,
  `TestHandleApiSession_InvalidParamsReturnFull`,
  `TestHandleApiSession_PaginationWindowed`,
  `TestHandleApiSession_PaginationClampsBeyondEnd`,
  `TestHandleApiForkSession`, `TestHandleApiCloneSession`,
  `TestHandleApiCloneSessionDefaultsToLastEntry`,
  `TestHandleNewSessionPreinitializesWorker`,
  `TestHandleNewSessionCopiesSourceModelAndThinking`,
  `TestHandleNewSessionWithoutChatSender`, `TestHandleNewBtwThenGet`
- Likely fix: normalize fixture line endings (`.gitattributes` `* -text` for
  testdata, or write `\n` explicitly) and/or canonicalize cwd in fixtures.

### 3. Windows file-locking on `t.TempDir()` cleanup
`t.TempDir()` `RemoveAll` fails with "The process cannot access the file ... 
pi-web.sqlite" because the `*sql.DB` is never closed — Windows can't delete an
open file.
- `internal/server`: `TestHandleCustomThemesServesConfiguredStylesheet`,
  `TestHandleCustomThemesFallbackWhenMissing`, `TestCustomThemesPublicWhenAuthEnabled`
- Likely fix: have the test (or a `Server.Close()`) `db.Close()` before cleanup.

### 4. Tailscale exec/mocks (`internal/app`)
- `TestConfigureTailscaleServeRunsServeCommandWhenNoExistingRule`,
  `TestConfigureTailscaleServeDoesNothingWhenSameRuleExists`,
  `TestTailscaleSelfDNSRejectsStoppedBackend`
- Likely a command-runner/exec stub that assumes a POSIX `tailscale` invocation.

### 5. Already fixed by branch `fix/windows-project-path-migration`
These show up on `main` but pass once that branch lands (it canonicalizes
project paths): `TestCreateSessionFile`, `TestParseFileUsesHeaderCwdAsProject`,
`TestParseFileDeduplicatesRepeatedSessionHeader`,
`TestListRecentLocationsReturnsNewestBoundedLocations`.

## Frontend (vitest) — ~30–43 failures across 5 files

These look like jsdom / test-env setup problems (and some appear flaky):
- `src/shared/storage.test.js` — `localStorage.clear is not a function`: the
  jsdom/localStorage stand-in doesn't implement `clear()`. Fix the test setup
  (provide a complete `localStorage` mock, or use jsdom's real one).
- `src/shared/i18n.test.js` — `englishTemplate()` assertions.
- `src/components/session/BtwPopup.test.js`,
  `src/components/session/RightSidebar.test.js`,
  `src/components/session/CatGatekeeperSettings.test.js` — Svelte-5 component
  mount under jsdom; likely the same missing-DOM-API root cause.
- Start with the shared `localStorage`/DOM setup in the vitest config — fixing it
  may clear most of these at once.

## How to reproduce

```bash
export PATH="$PATH:/c/Users/HTK/go/bin"
go test ./... 2>&1 | grep -E '^--- FAIL|^FAIL'
cd web && ./node_modules/.bin/vitest run 2>&1 | grep -E 'FAIL '
```
