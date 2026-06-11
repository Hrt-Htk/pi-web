import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths";

// Path to the stub-pi directory.
const STUB_PI_DIR = join(REPO_ROOT, "e2e", "lib", "stub-pi");
const CONFIG_FILE = join(STUB_PI_DIR, "stub-delay.config");

/** Set the stub pi response delay (ms). Affects all subsequently-spawned stub workers. */
export function setStubDelay(ms: number): void {
  writeFileSync(CONFIG_FILE, String(ms));
}

/** Remove the delay config so the stub reverts to its default (30ms). */
export function resetStubDelay(): void {
  try {
    unlinkSync(CONFIG_FILE);
  } catch {
    /* already gone */
  }
}
