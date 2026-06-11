# Read-only investigation — do NOT edit any files

Repo: H:/Software/pi-web (Go + Svelte). Report findings with exact `file:line` references and quoted code snippets. Make no edits.

## The bug

Creating a NEW session => the assistant reply never materializes. Backend logs show:

    chat send failed: No API key found for the selected model

Pre-existing sessions (exercised by `e2e/tests/chat.spec.ts`) work fine. The e2e harness installs a STUB `pi` binary on PATH that just emits `Stub reply: ...`. Because we see a real "No API key found" error, the REAL pi binary (not the stub) is being invoked for new-session workers, while the stub is correctly used for pre-existing-session workers.

## Your job

Determine WHY a worker spawned for a newly-created session resolves/invokes a DIFFERENT `pi` executable (or environment) than a worker spawned for a pre-existing session. Both supposedly go through the same factory (`internal/rpc/worker.go` `NewPiWorkerWithStream` -> `exec.LookPath("pi")`). Find what ACTUALLY differs — point at exact divergent lines.

## Trace and report on

1. **Stub wiring.** How does the e2e harness install/point to the stub `pi`? Search `e2e/` (playwright config, fixtures, `lib/`, global setup) and the Go server for how the pi executable path is chosen. Is it always literally `"pi"` via `exec.LookPath`, or is there a configurable binary path / env override (e.g. `PI_BIN`, `PI_PATH`, a temp dir prepended to `PATH`, or a flag passed to `pi-web`)? Where is that env/PATH set, and does it apply equally to all worker spawns?

2. **Pre-init vs lazy spawn.** `internal/server/handlers.go` `handleNewSession` (~282-320) and `internal/server/new_session.go` `initializeNewSessionWorker` — the pre-init worker is spawned on a `go` goroutine with `context.Background()`. Compare the env/working-dir/PATH for THAT goroutine vs the worker spawned lazily on first chat in `handleChat`. Confirm whether both hit the same factory or diverge. Quote both call sites.

3. **How `cmd` is built.** In `internal/rpc/worker.go`, show exactly how the `exec.Cmd` is constructed: args, `cmd.Dir` (working directory!), `cmd.Env`. Pay special attention to `cmd.Dir`: if the new session's cwd/path becomes the worker's working directory, could a real `pi` be found relative to that dir, or could pi's own config / API-key discovery change based on cwd? Does `sessionPath`/cwd influence `exec.LookPath` or pi's API-key/model config discovery?

4. **Origin of the error string.** Grep the whole repo for `No API key found for the selected model`. Confirm whether it is emitted by pi-web Go code or only by the real pi binary.

5. **Missing model_change.** Flow 1 (new session from index) has NO `model_change` entry (1 entry = header only) because `initialSettingsFromSource` returns empty when there's no `sourceSessionId`. Does a worker with no `model_change` in the session file end up asking the real pi for a default model that needs an API key? Tie this to the error.

## Deliverable

A RANKED list of the most likely root cause(s), each with specific `file:line` evidence, and an explicit statement of what differs between the new-session worker path and the pre-existing-session worker path. Be concrete. Do not hand back a vague "race condition" answer unless you can point at the exact divergent line.
