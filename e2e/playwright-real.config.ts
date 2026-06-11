import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for running tests against a REAL, already-running pi-web.
 *
 * The real pi-web is at https://desk-htk.tail502433.ts.net:31415
 * Tests navigate there directly; no local server is started.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./global-setup-real.ts",
  globalTeardown: "./global-teardown-real.ts",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
  ],
});
