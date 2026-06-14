import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { STATE_FILE, TMP_DIR, LIVE_STATE_SRC, LIVE_STATE_FILE, LIVE_SESSIONS_DIR, type ServerState } from "./lib/paths";
import { startServer } from "./lib/server";

export default async function globalSetup() {
  mkdirSync(TMP_DIR, { recursive: true });
  const { baseURL, agentDir, sessionsDir, child } = await startServer();

  // Disable the "cat" focus/bedtime gatekeeper globally. Its sleep overlay is
  // time-of-day driven (default bedtime 23:00-07:00) and covers the UI,
  // intercepting clicks — which silently breaks click-based tests on CI runners
  // in that window (e.g. UTC night). Seed it off in the server-side store so
  // every page hydrates with it disabled.
  // Also disable auto-titling: with the stub model it appends a session_info
  // line and broadcasts a "reload" at an unpredictable moment, re-rendering
  // #messages and racing tests that assert on freshly-created DOM (e.g.
  // annotation highlights). Deterministic test env > background titling.
  const res = await fetch(`${baseURL}/api/settings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Show all artifacts by default (empty include filter). The product default
    // is "*.md, *.html", which would hide the .go writes and code snippets the
    // artifacts behavior tests assert on. The dedicated filter tests opt into a
    // filter explicitly; everything else runs unfiltered for determinism.
    body: JSON.stringify({
      settings: {
        "pi-web:v1:cat:enabled": "false",
        "pi-web:v1:auto-title:enabled": "false",
        "pi-web:v1:artifacts:include": "",
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`failed to seed test settings: HTTP ${res.status}`);
  }

  const state: ServerState = { baseURL, agentDir, sessionsDir, pid: child.pid! };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`[e2e] pi-web ready at ${baseURL} (pid ${child.pid})`);

  // Detach so the spawned server outlives this setup process; teardown kills by pid.
  child.unref();

  // ---------------------------------------------------------------------------
  // Live server detection — for pi-dependent specs that run against the user's
  // real pi-web (real pi workers, real responses).
  // ---------------------------------------------------------------------------
  try {
    const liveSrc = JSON.parse(readFileSync(LIVE_STATE_SRC, "utf8"));
    const liveBaseURL = `http://${liveSrc.host}:${liveSrc.port}`;
    const probe = await fetch(liveBaseURL + "/api/sessions");
    if (!probe.ok) {
      throw new Error(`probe returned HTTP ${probe.status}`);
    }
    writeFileSync(
      LIVE_STATE_FILE,
      JSON.stringify({ baseURL: liveBaseURL, sessionsDir: LIVE_SESSIONS_DIR }, null, 2),
    );
    console.log(`[e2e] live pi-web verified at ${liveBaseURL}`);
  } catch (err) {
    console.warn(
      `[e2e] live server not detected — pi-dependent specs will be skipped. ` +
        `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Write a sentinel so the fixture can produce a clear skip message.
    writeFileSync(LIVE_STATE_FILE, JSON.stringify({ baseURL: null, sessionsDir: LIVE_SESSIONS_DIR }, null, 2));
  }
}
