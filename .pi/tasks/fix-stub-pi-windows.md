# Task: make the e2e stub `pi` resolve on Windows

Repo: H:/Software/pi-web (Go + Svelte; we are on branch `fix/windows-test-failures`). You MAY edit files, but ONLY under `e2e/`. Do NOT touch any Go or Svelte production code.

## Background (root cause — already diagnosed, do not re-investigate)

The e2e tests spawn a STUB `pi` (a Node script at `e2e/lib/stub-pi/pi`) so chat flows work without the real `pi` binary or API keys. The stub is supposed to be put on PATH so the pi-web worker (`internal/rpc/worker.go` -> `exec.LookPath("pi")`) finds it. On Windows it is NOT found, so the worker falls through to the real `pi.exe`, which fails with "No API key found for the selected model" and writes no entries — so newly-created-session chat never displays.

Two compounding Windows bugs cause the stub to be unresolvable:

1. **PATH separator is hardcoded to `:`** in `e2e/lib/server.ts` (around line 81):
   ```ts
   PATH: `${STUB_PI_DIR}:${process.env.PATH ?? ""}`,
   ```
   On Windows the delimiter is `;`, so this corrupts the first PATH entry and the stub dir is effectively not on PATH.

2. **The stub is an extension-less Unix shebang script** named `pi` with no `.cmd`/`.bat`/`.exe`. Windows `exec.LookPath` only matches names with a `PATHEXT` extension, so even with the separator fixed, a bare `pi` is skipped.

## What to change (both inside e2e/)

### Change 1 — use the platform PATH delimiter in `e2e/lib/server.ts`
- Import `delimiter` from `node:path` (check existing imports first; there may already be a `join`/`dirname` import from `node:path` you can extend).
- Replace the hardcoded `:` join with `delimiter` so it reads, in effect:
  ```ts
  PATH: `${STUB_PI_DIR}${delimiter}${process.env.PATH ?? ""}`,
  ```
- Keep the existing comment intact.

### Change 2 — add a Windows wrapper so `LookPath("pi")` resolves the stub
- Add a `pi.cmd` file in `e2e/lib/stub-pi/` that invokes Node on the existing `pi` script and forwards all args and stdin. A robust batch wrapper:
  ```bat
  @echo off
  node "%~dp0pi" %*
  ```
  - `%~dp0` expands to the directory of the .cmd file (with trailing backslash), so `node "%~dp0pi"` runs the sibling stub script regardless of cwd.
  - `%*` forwards all arguments (the worker calls `pi --mode rpc`).
  - stdin/stdout are inherited by the child `node` process automatically, which the RPC protocol needs.
- Do NOT modify the existing `pi` script — keep it for Unix/CI where the shebang works.
- If you find a cleaner existing convention in the repo for cross-platform stub binaries, prefer matching it; otherwise the `pi.cmd` above is fine.

## Constraints
- Only edit/create files under `e2e/`.
- Do not change `internal/rpc/worker.go` or any Go/Svelte source.
- Match the surrounding TypeScript style in `server.ts` (the repo uses Prettier; 2-space indent, single quotes are NOT used in this file — match what's already there).

## Verify before reporting
- Re-read `e2e/lib/server.ts` to confirm the `delimiter` import exists and the PATH line uses it.
- Confirm `e2e/lib/stub-pi/pi.cmd` exists with the wrapper content.
- Run a quick TypeScript/type sanity check if easy (e.g. `cd web` is NOT relevant here; the e2e project may have its own tsconfig — only run a check if it's fast and obvious, otherwise skip).

## Report back
- The exact list of files changed/created.
- The final content of the PATH line in server.ts and of pi.cmd.
- Anything you were unsure about.
