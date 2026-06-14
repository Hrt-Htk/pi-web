import { readFileSync } from "node:fs";
import { test as base, expect } from "@playwright/test";
import { LIVE_STATE_FILE } from "./paths";

function readLive(): { baseURL: string | undefined; sessionsDir: string } {
  const raw = JSON.parse(readFileSync(LIVE_STATE_FILE, "utf8"));
  // Playwright's baseURL fixture accepts string | undefined (not null).
  return { baseURL: raw.baseURL ?? undefined, sessionsDir: raw.sessionsDir };
}

interface Fixtures {
  /** Base URL of the live pi-web server (undefined when not reachable). */
  baseURL: string | undefined;
  /** Absolute path to the live server's sessions dir. */
  sessionsDir: string;
}

export const test = base.extend<Fixtures>({
  baseURL: async ({}, use) => {
    const { baseURL } = readLive();
    await use(baseURL);
  },
  sessionsDir: async ({}, use) => {
    await use(readLive().sessionsDir);
  },
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("pi-web:v1:cat:enabled", "false");
        localStorage.setItem("pi-web:v1:artifacts:include", "");
      } catch {
        /* ignore */
      }
    });
    await use(page);
  },
});

export { expect };
