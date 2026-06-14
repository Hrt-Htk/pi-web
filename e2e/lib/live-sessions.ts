import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Create a session via the live server's API.
 * Returns the session id (filename without path).
 */
export async function createLiveSession(baseURL: string, cwd: string): Promise<string> {
  const res = await fetch(baseURL + "/api/new-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: cwd }),
  });
  if (!res.ok) {
    throw new Error(`createLiveSession: HTTP ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string; ok: boolean };
  if (!body.ok) throw new Error(`createLiveSession: server returned ok=false`);
  return body.id;
}

/**
 * Delete the session file anywhere under sessionsDir.
 * The live server nests sessions under an encoded-cwd subdirectory, so we
 * walk the tree to find a file whose basename matches `id`.
 * Ignores errors if the file is already gone.
 */
export function deleteLiveSession(sessionsDir: string, id: string): void {
  try {
    _findAndDelete(sessionsDir, id);
  } catch {
    // already gone — that's fine
  }
}

function _findAndDelete(dir: string, target: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      _findAndDelete(full, target);
    } else if (entry === target) {
      rmSync(full);
      return;
    }
  }
}
