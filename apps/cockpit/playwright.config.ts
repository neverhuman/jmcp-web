import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

// Dedicated preview port for the fully-mocked cockpit E2E run. It must avoid the
// Jeryu protected/retired ports and the cockpit dev port (15873). All network
// traffic is mocked inside the page (see e2e/mock-broker.ts); no live JMCP API is
// required.
const PORT = 15999;
const HOST = "127.0.0.1";
const liveBaseURL = process.env.JMCP_VOICE_LIVE_BASE_URL;
const baseURL = liveBaseURL ?? `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: path.resolve(configDir, "../../target/jankurai/ux-qa/playwright-cockpit"),
  fullyParallel: true,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer:
    liveBaseURL === undefined
      ? {
          // Build first, then serve the static build with `vite preview`. The
          // preview server is fully offline; the broker is mocked per-page.
          command: `npm run build && npm run preview -- --host ${HOST} --port ${PORT} --strictPort`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180000,
        }
      : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
