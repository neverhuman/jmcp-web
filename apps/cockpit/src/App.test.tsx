import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { controlPlane, systems, views } from "./fixtures";
import { resetDeckStoreForTests } from "./jitux/store";
import { createFixtureRuntime, hasValidEventBatch, loadRuntime } from "./runtime";

const apiOrigin = "http://127.0.0.1:18877";
const liveTimestamp = "2026-06-04T12:00:00Z";

type PayloadMap = Record<string, unknown>;

function runtimePayloads(workKind = "live.mock") {
  const tool = {
    name: "jeryu.mock.query",
    className: "codegraph",
    conformance: "C1 governed",
    sideEffects: "none",
    dataClasses: ["repo"],
    repo: "Jeryu",
    provider: "jeryu",
    health: "nominal",
    dependsOn: ["jmcpd.work-orders"],
    queue: 0,
  };
  return {
    "/health": { ok: true },
    "/work-orders": [
      {
        id: "WO-live",
        subject: "tenant/jeryu/entity",
        status: "Submitted",
        task: { kind: workKind, payload: { repo: "Jeryu", branch: "mock/runtime" } },
        evidence: [{}],
        updated_at: liveTimestamp,
      },
    ],
    "/evidence": [{ kind: "mock.evidence", uri: "sha256:liveproof", captured_at: liveTimestamp }],
    "/systems": systems,
    "/attention": [
      {
        attention_packet_id: "AP-live",
        work_order_id: "WO-live",
        attention_level: "decision",
        modality: "api",
        user_visible_summary: "Mock approval visible",
        recommendation: "Approve the mocked proof",
        decision_needed: true,
        options: [{ option_id: "approve", label: "Approve", effect: "allows proof", risk: "low" }],
        risk_delta: { from: "medium", to: "low", note: "mocked" },
        drilldown_refs: [],
        created_at: liveTimestamp,
        expires_at: "2026-06-04T13:00:00Z",
      },
    ],
    "/voice-text": [
      {
        interaction_id: "VT-live",
        channel: "text",
        speaker_id: "telegram:user:42",
        title: "Mock approval transcript",
        voice_state: "confirmed",
        transcript: "approve mock proof",
        intent: "approval",
        confidence: 1,
        confirmation_phrase: "mock",
        requires_response: true,
        decision_options: ["approve", "deny"],
        updated_at: liveTimestamp,
        source_ref: "voice.mock",
      },
    ],
    "/memory": [
      {
        memory_id: "ML-live",
        scope: "mock coverage",
        claim: "Runtime mocks preserve cockpit rendering.",
        lesson_state: "promoted",
        confidence: 99,
        retention: "project",
        expiry: "never",
        promotion: { status: "promoted", gate: "mock proof", reviewed_by: "codex", promoted_at: "2026-06-04T12:00:00Z" },
        counterexamples: [],
        source: "mock.runtime",
        rollback: "revert mock fixture",
      },
    ],
    "/replay": { events: 7, checkpoints: [{ id: "checkpoint-live", last_event_id: 7, created_at: liveTimestamp }] },
    "/approvals": [{ work_order_id: "WO-live", approver: "telegram:user:42", expires_at: "2026-06-04T13:00:00Z", decision: null }],
    "/approval-challenges": [
      {
        id: "challenge-live",
        work_order_id: "WO-live",
        approver: "telegram:user:42",
        channel: "telegram",
        token_hash: "sha256:live",
        target_user_id: 42,
        target_chat_id: 99,
        expires_at: "2026-06-04T13:00:00Z",
        state: "pending",
      },
    ],
    "/adapters": {
      service_cards: [{ name: "jeryu", capabilities: ["mock.query"], subjects: ["repo"] }],
      health: [{ name: "jeryu", health: "nominal", endpoint: "mock://jeryu", detail: "mocked" }],
    },
    "/ecosystem": { tools: [tool], live: true },
    "/fleet-board": {
      generated_at_note: "mocked",
      schema: "fleet-board.v1",
      repos: [
        {
          name: "JMCP",
          path: "/home/ubuntu/jmcp",
          branch: "mock/runtime",
          ci_configured: true,
          score: 96,
          raw: 96,
          caps: [],
          caps_count: 0,
          hard_findings: 0,
          score_freshness: "fresh",
          active_runner_count: 0,
          runner_busy: false,
          jeryu_gate: "pass",
          artifact_state: { local: "present", dev_canary: "present", prod: "present", release: "present", promote: "present" },
        },
      ],
      totals: { repo_count: 1, audited: 1, failed: 0, min_score: 96, max_score: 96, average_score: 96, total_hard_findings: 0, below_threshold: 0 },
    },
    "/universe": {
      live: true,
      bootstrapTui: {
        live: true,
        observedCoverage: 100,
        activeRepos: [{ repo: "Jeryu", toolCount: 1, score: 96, health: "nominal" }],
        repoScores: [{ repo: "Jeryu", toolCount: 1, score: 96, coverage: 100, currentTask: workKind, branch: "mock/runtime", pool: "local", placement: "jmcpd", health: "nominal" }],
        placements: [{ agent: "Jeryu", repo: "Jeryu", currentTask: workKind, branch: "mock/runtime", pool: "local", placement: "jmcpd", score: 96, health: "nominal" }],
        degradedSlices: [],
      },
      ecosystem: { tools: [tool], live: true },
    },
    "/control-plane": controlPlane,
    "/agents": [{ agentId: "agent-live", lastSeq: 3, backlogLen: 2 }],
    "/agent-sessions": [
      {
        id: "11111111-1111-4111-8111-111111111111",
        sessionKey: "jeryu.live.session",
        provider: "jeryu",
        subject: "Jeryu repo worker",
        status: "running",
        processKey: "proc-jeryu",
        streamUri: "/agent-sessions/11111111-1111-4111-8111-111111111111/stream",
        startedAt: liveTimestamp,
        updatedAt: liveTimestamp,
      },
    ],
    "/process-observations": [
      {
        id: "22222222-2222-4222-8222-222222222222",
        processKey: "proc-jeryu",
        command: "jeryu run proof",
        status: "running",
        pty: "pty-enabled",
        stuck: false,
        diagnosticClass: null,
        startedAt: liveTimestamp,
        updatedAt: liveTimestamp,
      },
    ],
    "/incidents": [],
  } satisfies PayloadMap;
}

function installFetchMock(payloads: PayloadMap, rejectedPaths = new Set<string>()) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input), apiOrigin);
    const path = url.pathname.replace(/^\/jmcp(?=\/|$)/, "") || "/";
    if (rejectedPaths.has(path)) {
      return Promise.reject(new Error(`mock failure ${path}`));
    }
    if (!(path in payloads)) {
      return Promise.reject(new Error(`unmocked ${path}`));
    }
    return Promise.resolve({
      ok: true,
      json: async () => payloads[path],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  closed = false;
  private listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener as (event: MessageEvent<string>) => void);
    this.listeners.set(type, listeners);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent<string>);
    }
  }
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("test api unavailable"))));
  resetDeckStoreForTests();
});

afterEach(() => {
  resetDeckStoreForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  MockEventSource.instances = [];
  cleanup();
});

describe("JMCP cockpit", () => {
  it("loads a fully mocked healthy runtime", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:34:56Z"));
    const fetchMock = installFetchMock(runtimePayloads());

    const runtime = await loadRuntime();

    expect(fetchMock).toHaveBeenCalledTimes(19);
    expect(runtime.apiHealth).toBe("nominal");
    expect(runtime.usingFixtures).toBe(false);
    expect(runtime.loadedAt).toBe("12:34:56Z");
    expect(runtime.workItems[0].title).toBe("live.mock");
    expect(runtime.evidenceBundles[0].hash).toBe("sha256:liveproof");
    expect(runtime.replayEvents[0].sequence).toBe(7);
    expect(runtime.approvalRequests[0].challengeId).toBe("challenge-live");
    expect(runtime.ecosystemLive).toBe(true);
    expect(runtime.agents[0].agentId).toBe("agent-live");
    expect(runtime.agentSessions[0].status).toBe("running");
    expect(runtime.processObservations[0].processKey).toBe("proc-jeryu");
    expect(runtime.sourceStatuses.filter((source) => source.state === "live")).toHaveLength(19);
  });

  it("keeps live slices while marking partial backend failure as fixture-backed", async () => {
    vi.useFakeTimers();
    installFetchMock(runtimePayloads(), new Set(["/ecosystem", "/universe"]));

    const runtime = await loadRuntime();

    expect(runtime.apiHealth).toBe("watch");
    expect(runtime.usingFixtures).toBe(true);
    expect(runtime.workItems[0].title).toBe("live.mock");
    expect(runtime.ecosystemLive).toBe(false);
    expect(runtime.sourceStatuses.find((source) => source.key === "ecosystem")?.state).toBe("degraded");
    expect(runtime.ecosystemDegradedReason).toContain("unavailable");
  });

  it("falls back to fixtures when every backend endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("all endpoints down"))));

    const runtime = await loadRuntime();
    const fixture = createFixtureRuntime();

    expect(runtime).toEqual(fixture);
  });

  it("validates event batches without accepting malformed stream payloads", () => {
    expect(hasValidEventBatch(JSON.stringify([{ id: 1, event_type: "work.updated" }]))).toBe(true);
    expect(hasValidEventBatch(JSON.stringify([{ id: "1", event_type: "work.updated" }]))).toBe(false);
    expect(hasValidEventBatch("not json")).toBe(false);
  });

  it("refreshes rendered runtime state from a mocked EventSource event", async () => {
    const payloads = runtimePayloads("live.mock");
    installFetchMock(payloads);
    vi.stubGlobal("EventSource", MockEventSource);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Work" }));
    expect(await screen.findByText("live.mock")).toBeInTheDocument();
    expect(MockEventSource.instances[0].url).toBe("/jmcp/events");

    Object.assign(payloads, runtimePayloads("live.refreshed"));
    MockEventSource.instances[0].emit("jmcp.events", [{ id: 2, event_type: "work.updated" }]);

    expect(await screen.findByText("live.refreshed")).toBeInTheDocument();
    expect(screen.queryByText("live.mock")).not.toBeInTheDocument();
  });

  it("renders every required dashboard view in navigation", () => {
    render(<App />);

    for (const view of views) {
      expect(screen.getByRole("button", { name: view.label })).toBeInTheDocument();
    }
  });

  it("shows the Mission Deck on the first screen", async () => {
    render(<App />);

    expect(await screen.findByLabelText("AIUX Mission Deck")).toBeInTheDocument();
    const rankedDeck = screen.getByLabelText("Ranked Mission Deck");
    expect(rankedDeck).toBeInTheDocument();
    expect(screen.getByLabelText("Inner dialogue")).toBeInTheDocument();
    expect(screen.queryByLabelText("JMCP control plane")).not.toBeInTheDocument();
  });

  it("opens the memory slice with promotion and quarantine drill-down", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Memory" }));

    expect(screen.getByRole("heading", { name: "Memory", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("ML-219")).toBeInTheDocument();
    expect(screen.getByText("Adapters that emit raw webhooks stay quarantined until wrapped in JCP envelopes.")).toBeInTheDocument();
    expect(screen.getByText("Incident / quarantine")).toBeInTheDocument();
  });

  it("opens the voice/text slice with transcript and confirmation details", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Voice/Text" }));

    expect(screen.getByRole("heading", { name: "Voice/Text", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Approve deployment request")).toBeInTheDocument();
    expect(screen.getByText("approve the deployment with token alpha")).toBeInTheDocument();
    expect(screen.getAllByText("response required").length).toBeGreaterThan(0);
  });

  it("shows the Universe view with repo scores and placement rows", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Universe" }));

    expect(screen.getByRole("heading", { name: /observed coverage/i })).toBeInTheDocument();
    expect(screen.getAllByText("Jeryu").length).toBeGreaterThan(0);
    expect(screen.getByText("/home/ubuntu/jmcp")).toBeInTheDocument();
    expect(screen.getByText("outdated score")).toBeInTheDocument();
    expect(screen.getAllByText("Jeryu gate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("artifact receipts").length).toBeGreaterThan(0);
    expect(screen.getByText("Placement Rows")).toBeInTheDocument();
  });

  it("shows the Telegram approval backplane with token and lineage details", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Approvals" }));

    expect(screen.getByRole("heading", { name: "Approvals", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Telegram backplane")).toBeInTheDocument();
    expect(screen.getByText("sha256:bridge-alpha")).toBeInTheDocument();
    expect(screen.getByText("challenge.AP-88")).toBeInTheDocument();
  });
});
