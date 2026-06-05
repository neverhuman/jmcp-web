import { expect, test } from "@playwright/test";
import { liveDeckFrame, mockBroker } from "./mock-broker";

// Tier 1 (a): the Mission Deck renders from primed fixtures and then flips to the
// live indicator once a mocked JITUX frame arrives over the stub EventSource.
test("renders the mission deck and goes live on an injected JITUX frame", async ({ page }) => {
  await mockBroker(page, { rest: "ok" });
  await page.goto("/");

  // Deck title + at least one ranked pane render straight from the primed
  // queue-blocker frames (no live stream required yet).
  await expect(page.getByRole("heading", { name: "Queue Blockers Mission Deck" })).toBeVisible();
  const rankedDeck = page.getByRole("list", { name: "Ranked Mission Deck" });
  await expect(rankedDeck).toBeVisible();
  await expect(rankedDeck.getByRole("listitem").first()).toBeVisible();

  // The trace ribbon (mission trace) is present as a deck liveness affordance.
  await expect(page.getByRole("region", { name: "Mission trace" })).toBeVisible();

  // Now drive the live indicator: the deck opens a session (mocked POST) and the
  // stub EventSource carries a single guard-valid frame, which flips the caption
  // to the BROKER-is-driving live message. Poll until a deck stream EventSource
  // exists and accepts the frame (the session open is async with retries).
  await expect
    .poll(
      async () =>
        page.evaluate(
          (frame) =>
            (window as unknown as { __emitDeckFrame: (f: unknown) => boolean }).__emitDeckFrame(frame),
          liveDeckFrame(),
        ),
      { timeout: 15000 },
    )
    .toBe(true);

  await expect(page.getByRole("region", { name: "Answer caption" })).toContainText(
    /BROKER is driving the Mission Deck/i,
    { timeout: 15000 },
  );
});
