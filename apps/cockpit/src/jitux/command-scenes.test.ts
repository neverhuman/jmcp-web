import { describe, expect, it } from "vitest";
import { createFixtureRuntime, type RuntimeState } from "../runtime";
import type { FleetBoardSnapshot } from "../types";
import { createNowCommandFrames } from "./command-scenes";

function liveRuntime(): RuntimeState {
  const runtime = createFixtureRuntime();
  const liveKeys = new Set(["fleet-board", "ecosystem", "control-plane", "work-orders", "agents", "agent-sessions", "process-observations", "incidents", "replay", "evidence", "approvals", "approval-challenges", "attention"]);
  return {
    ...runtime,
    ecosystemLive: true,
    usingFixtures: false,
    sourceStatuses: runtime.sourceStatuses.map((source) => liveKeys.has(source.key) ? { key: source.key, label: source.label, state: "live" } : source),
    agents: [{ agentId: "agent-jeryu", lastSeq: 4, backlogLen: 2 }],
    agentSessions: [{
      id: "session-1",
      sessionKey: "jeryu.worker",
      provider: "jeryu",
      subject: "jeryu repo proof",
      status: "running",
      processKey: "proc-jeryu",
      streamUri: "/agent-sessions/session-1/stream",
      startedAt: "2026-06-05T12:00:00Z",
      updatedAt: "2026-06-05T12:03:00Z",
    }],
    processObservations: [{
      id: "proc-1",
      processKey: "proc-jeryu",
      command: "jeryu proof jankurai",
      status: "running",
      pty: "pty",
      stuck: false,
      diagnosticClass: null,
      startedAt: "2026-06-05T12:00:00Z",
      updatedAt: "2026-06-05T12:03:00Z",
    }],
  };
}

function paneTitles(frames: ReturnType<typeof createNowCommandFrames>): string[] {
  return frames.flatMap((frame) => frame.type === "pane.prepare" ? [frame.pane.title] : []);
}

function paneByTitle(frames: ReturnType<typeof createNowCommandFrames>, title: string) {
  return frames.find((frame) => frame.type === "pane.prepare" && frame.pane.title === title);
}

describe("Now command scenes", () => {
  it("renders Jeryu aliases as live repo, worker, issue, and overview cards", () => {
    const frames = createNowCommandFrames(liveRuntime(), "show me info on Jeryu", "scene-test");
    const titles = paneTitles(frames);

    expect(titles).toContain("Jeryu overview");
    expect(titles).toContain("jeryu repo");
    expect(titles).toContain("jeryu repo proof");
    expect(titles).toContain("jeryu priority issue");
    expect(frames.some((frame) => frame.type === "pane.prepare" && frame.pane.cardType === "terminal")).toBe(true);
    expect(frames.some((frame) => frame.type === "pane.prepare" && frame.pane.sourceBadges?.some((badge) => badge.status === "live"))).toBe(true);
  });

  it("shows only degraded source cards when Jeryu sources are unavailable", () => {
    const runtime = createFixtureRuntime();
    const frames = createNowCommandFrames(runtime, "Jeryu", "degraded-test");
    const panes = frames.flatMap((frame) => frame.type === "pane.prepare" ? [frame.pane] : []);

    expect(panes.length).toBeGreaterThan(0);
    expect(panes.every((pane) => pane.cardType === "degradedSource")).toBe(true);
    expect(panes.every((pane) => pane.sourceBadges?.every((badge) => badge.status === "degraded"))).toBe(true);
  });

  it("ranks failed GitHub delivery and Jankurai caps before routine report cards", () => {
    const runtime = liveRuntime();
    const board: FleetBoardSnapshot = {
      ...runtime.fleetBoard,
      repos: [
        {
          ...runtime.fleetBoard.repos[0],
          name: "broken-github",
          host: "github",
          jeryuGate: "missing-receipts",
          topFindings: ["GitHub push failed on remote PR"],
        },
        {
          ...runtime.fleetBoard.repos[1],
          name: "capped-repo",
          caps: ["delivery-lane"],
          capsCount: 1,
          topFindings: ["Jankurai cap blocks release"],
        },
        ...runtime.fleetBoard.repos.slice(2),
      ],
    };
    const frames = createNowCommandFrames({ ...runtime, fleetBoard: board }, "status report", "priority-test");
    const firstPrepare = frames.find((frame) => frame.type === "pane.prepare");

    expect(firstPrepare?.type).toBe("pane.prepare");
    expect(firstPrepare?.pane.title).toBe("broken-github priority issue");
    expect(paneByTitle(frames, "capped-repo priority issue")).toBeDefined();
  });

  it("keeps fleet issue cards source-backed when findings are blank strings", () => {
    const runtime = liveRuntime();
    const board: FleetBoardSnapshot = {
      ...runtime.fleetBoard,
      repos: [
        {
          ...runtime.fleetBoard.repos[0],
          name: "blank-finding-repo",
          caps: ["git-bad-behavior"],
          capsCount: 1,
          topFindings: ["", ""],
          runnerBusy: false,
          activeRunnerCount: 3,
          runnerHint: "3 local runners, 0 recently busy",
        },
      ],
    };
    const frames = createNowCommandFrames({ ...runtime, fleetBoard: board }, "status report", "blank-finding-test");
    const issueFrame = paneByTitle(frames, "blank-finding-repo priority issue");
    const opportunityFrame = paneByTitle(frames, "blank-finding-repo runner opportunity");

    expect(issueFrame?.type).toBe("pane.prepare");
    expect(issueFrame?.type === "pane.prepare" ? issueFrame.pane.preview.headline : "").toContain("Jankurai cap: git-bad-behavior");
    expect(opportunityFrame?.type).toBe("pane.prepare");
    expect(opportunityFrame?.type === "pane.prepare" ? opportunityFrame.pane.preview.headline : "").toContain("3 local runners, 0 recently busy");
    expect(opportunityFrame?.type === "pane.prepare" ? opportunityFrame.pane.sourceBadges?.[0].status : undefined).toBe("live");
  });

  it("creates task-starting prompts as draft cards with clarifying questions only", () => {
    const frames = createNowCommandFrames(liveRuntime(), "ask for a new task to clean up the UI", "task-test");
    const panes = frames.flatMap((frame) => frame.type === "pane.prepare" ? [frame.pane] : []);

    expect(panes).toHaveLength(1);
    expect(panes[0].cardType).toBe("taskDraft");
    expect(panes[0].sourceBadges?.[0].status).toBe("draft");
    expect(frames.filter((frame) => frame.type === "evidence.attach")).toHaveLength(1);
    expect(frames.some((frame) => frame.type === "action.ready")).toBe(false);
  });

  it("uses cached graph source cards only from live fleet-board or ecosystem sources", () => {
    const frames = createNowCommandFrames(liveRuntime(), "show me a graph on the code base", "graph-test");
    const panes = frames.flatMap((frame) => frame.type === "pane.prepare" ? [frame.pane] : []);

    expect(panes.some((pane) => pane.cardType === "graph")).toBe(true);
    expect(panes.filter((pane) => pane.cardType === "graph").every((pane) => pane.sourceBadges?.some((badge) => badge.status === "live"))).toBe(true);
  });
});
