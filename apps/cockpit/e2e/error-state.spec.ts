import { expect, test } from "@playwright/test";
import { mockBroker } from "./mock-broker";

// Tier 1 (b): every JMCP REST endpoint returns 500. The cockpit must degrade
// gracefully (fixture-backed degraded protocol indicator), not crash.
test("renders a degraded UI when REST endpoints return 500", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await mockBroker(page, { rest: "error" });
  await page.goto("/");

  // The shell still mounts and the JMCP brand is visible (no crash / blank page).
  await expect(page.getByRole("navigation", { name: "JMCP views" })).toBeVisible();

  // The protocol card surfaces the degraded backbone state.
  await expect(page.getByText("JPCM stream degraded")).toBeVisible({ timeout: 15000 });

  // The primary "Now" heading still renders.
  await expect(page.getByRole("heading", { name: "Now", level: 1 })).toBeVisible();

  // No uncaught page errors escaped to the console.
  expect(pageErrors).toEqual([]);
});
