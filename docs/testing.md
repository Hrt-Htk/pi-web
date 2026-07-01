# Testing in pi-web

This is the map of how pi-web is tested, and what we deliberately borrowed (and didn't) from the sibling **geode** project's test pyramid. See `CLAUDE.md` → "Testing Pyramid" for the per-change rules and the TDD mandate; this doc is the philosophy and the cross-repo comparison.

## The pyramid

| Layer | Tool | Where | In `make check`? |
|-------|------|-------|------------------|
| **Unit (Go)** | `go test` | `internal/**/_test.go` (table-driven, `httptest`) | Yes |
| **Unit / component (frontend)** | vitest + jsdom + `@testing-library/svelte` | `web/src/**/*.test.js` | Yes |
| **Integration (in-memory)** | `go test` | `internal/integration/` — fake worker + real server/manager | Yes |
| **Extension / memory / install** | vitest / Python / bash | `tests/` | Yes |
| **Benchmark** | `go test -bench` | `internal/server/bench_test.go` | No (run on demand) |
| **E2E** | Playwright | `e2e/tests/` — real browser, real binary, 2 projects default (7 with `E2E_FULL_MATRIX=1`) | Yes (non-pi specs) |
| **Manual / mobile smoke** | human | browser + real device (`docs/dev/mobile-smoke-checklist.md`) | No (release gate) |

Run `make test` for the fast layers, `make check` before pushing, `make e2e` for the browser layer (needs `make e2e-setup` once).

## The integration layer (in-memory worker/session harness)

Borrowed from geode's **FakeVault**: an in-memory mock of Obsidian's Vault API that lets geode run hundreds of sync scenarios in seconds without spawning real Electron instances.

pi-web's equivalent lives in `internal/integration/`. It wires a **real** `*server.Server` and `*workers.Manager` together with an **in-memory fake worker** that implements `workers.ChatWorker` — no `pi --mode rpc` subprocess. The seam is the existing `workers.Factory` injection point (`internal/workers/manager.go`); production passes a factory that spawns the real RPC worker, tests pass one that returns the fake. This fills the gap between Go unit tests and full E2E, covering scenarios that previously only the (slow, hard-to-parallelize) E2E layer could reach:

- Send → stream preview → SSE broadcast end to end.
- Worker crash → eviction → replacement (drives the real `workerFor` error-state path).
- SSE topic routing isolation (`__all__` index-wide vs per-session).
- Many concurrent sessions with no cross-talk.
- Idle worker reaping.

Each runs in milliseconds. Add a scenario here whenever a worker/session/SSE behavior is awkward to unit test but too cheap to justify an E2E spec.

## Real-session benchmark

Borrowed from geode's **Tree House + geode-test-A** real vaults (~660 files with real history, CRLF, binaries, accumulated divergence) — clean single-file fixtures miss real-world behavior.

pi-web's E2E fixtures (`e2e/fixtures/sessions/`) are small and sanitized; they don't reproduce long scrolls, diverse entry types, model switches, or partial-compaction states. The benchmark layer adds a large, deliberately-messy session to validate the UI against, not just empty stubs. As with geode, **for real-world confidence, also validate against a copy of an actual long session** — point a throwaway test server at a copy of a real `~/.pi/agent/sessions/...` file rather than committing private data into the repo.

## What we did NOT borrow from geode (and why)

| Geode practice | Why it doesn't fit pi-web |
|---|---|
| Real Electron E2E | We already test against a real browser (Playwright + Chromium). Geode needs real Electron because its mock can't fire vault events — our mock just makes HTTP calls. |
| 4-layer pyramid depth | Geode needs depth because a crypto bug means catastrophic data loss. pi-web bugs are annoying, not destructive — the cost of 4 layers outweighs the risk. |
| Multi-device dogfooding gate (7 days) | pi-web is a web app; the browser + device matrix covers the equivalent surface without a multi-day dogfooding hold. |

## What pi-web does better than geode

| Area | pi-web advantage |
|---|---|
| Component tests | Svelte components tested in isolation with vitest + `@testing-library/svelte`. Geode has no equivalent — plugin UI is only tested in E2E. |
| Visual regression | Playwright screenshot-on-failure + `toHaveScreenshot()`. Geode has none. |
| Lint/format gates | ESLint + Prettier + `make check` enforced in CI. Geode's `deno lint`/`deno fmt` is less structured. |

## TDD

Both projects mandate test-first development with the same narrow exceptions (docs, chore, quick UI tweaks, dependency bumps). See `CLAUDE.md` → "Test-Driven Development (TDD) — mandatory" for the Red/Green/Refactor rule.
