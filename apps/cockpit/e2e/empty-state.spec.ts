import { expect, test } from "@playwright/test";
import { mockBroker } from "./mock-broker";

// Tier 1 (c): REST endpoints return empty arrays. List views must render their
// empty-state affordances rather than outdated fixtures or a crash.
test("renders empty-state UI when REST endpoints return empty arrays", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await mockBroker(page, { rest: "empty" });
  await page.goto("/");

  // Shell mounts.
  await expect(page.getByRole("navigation", { name: "JMCP views" })).toBeVisible();

  // Work view: no work orders.
  await page.getByRole("button", { name: "Work" }).click();
  await expect(page.getByText("Work Orders", { exact: true })).toBeVisible();
  await expect(page.getByText("No work orders")).toBeVisible();

  // Evidence view: no evidence bundles.
  await page.getByRole("button", { name: "Evidence" }).click();
  await expect(page.getByText("Evidence Bundles", { exact: true })).toBeVisible();
  await expect(page.getByText("No evidence bundles")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
