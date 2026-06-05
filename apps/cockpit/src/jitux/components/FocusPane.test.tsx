import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PaneVM } from "../types";
import { FocusPane } from "./FocusPane";

afterEach(() => {
  cleanup();
});

const pane: PaneVM = {
  id: "pane:queue",
  kind: "queue",
  title: "Queue blocker",
  rank: 1,
  risk: "high",
  status: "active",
  lod: "focus",
  confidence: 0.92,
  freshnessMs: 0,
  preview: {
    headline: "Queue blocker is blocking three downstream runs.",
    chips: ["blocked"],
    counters: [{ label: "prepared", value: "yes" }],
  },
  preparedTabs: ["evidence", "replay", "actions"],
};

describe("FocusPane", () => {
  it("renders the warming state when no pane is resolved", () => {
    render(<FocusPane pane={null} cards={[]} evidence={[]} actions={[]} />);

    expect(screen.getByRole("heading", { name: "Focus warming" })).toBeInTheDocument();
    expect(screen.getByText("Focus is warming")).toBeInTheDocument();
    // The prepared-data block (cards / evidence / actions) must not render.
    expect(screen.queryByLabelText("Prepared actions")).not.toBeInTheDocument();
  });

  it("renders the resolved pane title and its prepared tabs", () => {
    render(
      <FocusPane
        pane={pane}
        cards={[
          {
            id: "pane:queue.card",
            paneId: pane.id,
            title: pane.title,
            lod: pane.lod,
            status: "hydrated",
            risk: pane.risk,
            headline: pane.preview.headline,
          },
        ]}
        evidence={[]}
        actions={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Queue blocker" })).toBeInTheDocument();
    const tablist = screen.getByRole("tablist", { name: "Prepared drilldowns" });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("title"))).toEqual(["evidence", "replay", "actions"]);
    expect(tablist).toBeInTheDocument();
    expect(screen.queryByText("Focus is warming")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Prepared actions")).toBeInTheDocument();
  });
});
