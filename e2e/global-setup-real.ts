import { writeFileSync } from "node:fs";
import { STATE_FILE, type ServerState } from "./lib/paths";

/**
 * Global setup for running tests against a REAL, already-running pi-web.
 * Does NOT start or stop any server — just writes the state file.
 */
export default async function globalSetup() {
  const baseURL = "http://127.0.0.1:31415";

  try {
    const res = await fetch(baseURL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`real pi-web returned HTTP ${res.status}`);
    console.log(`[e2e] real pi-web reachable at ${baseURL}`);
  } catch (err: any) {
    throw new Error(`cannot reach real pi-web at ${baseURL}: ${err.message}`);
  }

  const state: ServerState = {
    baseURL,
    agentDir: "",
    sessionsDir: "",
    pid: 0,
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
