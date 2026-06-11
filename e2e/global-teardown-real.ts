import { readFileSync, rmSync } from "node:fs";
import { STATE_FILE, type ServerState } from "./lib/paths";

/**
 * Global teardown for real pi-web runs — only cleans up the state file.
 * Does NOT kill the server (it's already running independently).
 */
export default async function globalTeardown() {
  try {
    const state: ServerState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    // Only clean up if we started a server (pid > 0).
    // For real pi-web runs, pid is 0 — skip everything.
    if (state.pid && state.pid > 0) {
      // Would kill server and clean agentDir, but not our case.
    }
  } finally {
    rmSync(STATE_FILE, { force: true });
  }
}
