// Package integration provides an in-memory worker/session harness for fast
// integration tests — the layer between Go unit tests and full Playwright E2E.
// It wires a real *server.Server and *workers.Manager together with an
// in-memory fake worker (no `pi --mode rpc` subprocess), so session/worker
// scenarios run in milliseconds. Inspired by geode's FakeVault. See docs/testing.md.
package integration
