import { describe, expect, it } from "vitest";
import { getRankedPanes } from "./deck-queries";
import type { PaneVM } from "./types";

function makePane(id: string, rank: number): PaneVM {
  return {
    id,
    kind: "queue",
    title: `Pane ${id}`,
    rank,
    risk: "low",
    status: "active",
    lod: "ghost",
    confidence: 0.5,
    freshnessMs: 0,
    preview: {
      headline: `Headline ${id}`,
      chips: [],
      counters: [],
    },
    preparedTabs: ["evidence"],
  };
}

describe("getRankedPanes", () => {
  it("orders by paneOrder and filters out panes missing from the map", () => {
    const panes: Record<string, PaneVM | undefined> = {
      a: makePane("a", 1),
      c: makePane("c", 3),
    };

    const ranked = getRankedPanes({ paneOrder: ["a", "b", "c"], panes });

    // "b" has no PaneVM entry, so it is dropped; remaining panes keep paneOrder.
    expect(ranked.map((pane) => pane.id)).toEqual(["a", "c"]);
  });

  it("caps the ranked panes at 20 entries", () => {
    const ids = Array.from({ length: 25 }, (_, index) => `pane_${index}`);
    const panes: Record<string, PaneVM | undefined> = {};
    for (const [index, id] of ids.entries()) {
      panes[id] = makePane(id, index + 1);
    }

    const ranked = getRankedPanes({ paneOrder: ids, panes });

    expect(ranked).toHaveLength(20);
    expect(ranked[0].id).toBe("pane_0");
    expect(ranked[19].id).toBe("pane_19");
  });

  it("returns an empty list when no panes resolve", () => {
    expect(getRankedPanes({ paneOrder: ["x", "y"], panes: {} })).toEqual([]);
  });
});
