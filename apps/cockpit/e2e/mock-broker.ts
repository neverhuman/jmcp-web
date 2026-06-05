import type { Page, Route } from "@playwright/test";

// Fully-mocked broker for cockpit E2E. No live :18877 is ever contacted: every
// JMCP REST call is fulfilled by page.route, and the SSE/EventSource transport
// is replaced by an in-page stub installed via addInitScript so deck frames and
// /events frames can be emitted from injected fixtures.
//
// The REST loader (src/runtime.ts) hits `${VITE_JMCP_API_URL ?? "http://127.0.0.1:18877"}<path>`
// while the deck client (src/jitux/client.ts) hits the same-origin `/jmcp<path>`
// proxy. To cover both, routes are matched by trailing path glob (e.g. **/health),
// which matches the absolute 18877 URL and the /jmcp-proxied URL alike.

export type RestMode = "ok" | "empty" | "error";

type JsonBody = unknown;

const HEALTH_OK = { ok: true };
const HEALTH_EMPTY = { ok: true };

// Minimal API-shaped payloads that satisfy the runtime guards while exercising
// the empty UI on the list-backed views (work / evidence / systems / etc.).
function emptyBodies(): Record<string, JsonBody> {
  return {
    health: HEALTH_EMPTY,
    "work-orders": [],
    evidence: [],
    systems: [],
    attention: [],
    "voice-text": [],
    memory: [],
    replay: { events: 0, checkpoints: [] },
    approvals: [],
    "approval-challenges": [],
  };
}

// A small set of valid "ok" payloads. The deck primes its panes from in-browser
// fixtures regardless, so the ok-mode REST bodies only need to be guard-valid and
// non-empty enough to render nominal list views.
function okBodies(): Record<string, JsonBody> {
  return {
    health: HEALTH_OK,
    "work-orders": [
      {
        id: "WO-2201",
        title: "Stabilize broker intel projection",
        state: "blocked",
        risk: "high",
        lease: "lease-broker-intel",
        evidence: 2,
        updated_at: "2026-06-03T15:00:00.000Z",
      },
    ],
    evidence: [
      {
        id: "EV-9001",
        subject: "Broker intel projection proof",
        source: "jmcpd",
        status: "accepted",
        captured_at: "2026-06-03T15:00:00.000Z",
      },
    ],
    systems: [],
    attention: [],
    "voice-text": [],
    memory: [],
    replay: { events: 0, checkpoints: [] },
    approvals: [],
    "approval-challenges": [],
  };
}

function jituxSessionDescriptor() {
  return {
    sessionId: "e2e.mock.session",
    streamUrl: "/jmcp/jitux/sessions/e2e.mock.session/stream",
    wsUrl: "ws://127.0.0.1:15999/jmcp/jitux/sessions/e2e.mock.session/ws",
  };
}

// One guard-valid jitux frame that flips the live deck stream to "live" and
// drives the caption to the BROKER-is-driving live indicator. The deck reducer
// only requires a well-formed frame for the active session.
export function liveDeckFrame() {
  const sessionId = "e2e.mock.session";
  const seq = 1;
  return {
    v: 1,
    type: "focus.change",
    sessionId,
    seq,
    frameId: `${sessionId}.${seq}.focus.change`,
    emittedAt: "2026-06-03T15:00:00.000Z",
    source: "agent",
    paneId: "queue_blockers",
    reason: {
      score: 0.94,
      explanation: "Live broker frame promoted the queue blocker pane.",
      factors: {
        risk: 0.9,
        blockedness: 1,
        approvalExpiryPressure: 0,
        leasePressure: 0.75,
        adapterDegradedWeight: 0,
        evidenceGapWeight: 0.4,
        userQueryRelevance: 1,
        freshness: 0.6,
        downstreamBlastRadius: 0.72,
      },
    },
  };
}

async function fulfillJson(route: Route, body: JsonBody): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

// Install a stub EventSource + WebSocket before any app code runs. The stub
// records every constructed EventSource keyed by its URL so the test can emit
// frames into the deck stream (jitux.frame / message) and the /events stream
// (jmcp.events). WebSocket is stubbed to a no-op so DeckInteractionSocket never
// reaches the network.
async function installStubTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Listener = (event: { data?: string } | Event) => void;

    class StubEventSource {
      static instances: StubEventSource[] = [];
      url: string;
      listeners = new Map<string, Set<Listener>>();
      closed = false;
      onopen: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = String(url);
        StubEventSource.instances.push(this);
        // Defer "open" so listeners attach first.
        setTimeout(() => {
          if (this.closed) return;
          this.onopen?.(new Event("open"));
          this.dispatch("open", new Event("open"));
        }, 0);
      }

      addEventListener(type: string, listener: Listener): void {
        const set = this.listeners.get(type) ?? new Set<Listener>();
        set.add(listener);
        this.listeners.set(type, set);
      }

      removeEventListener(type: string, listener: Listener): void {
        this.listeners.get(type)?.delete(listener);
      }

      dispatch(type: string, event: { data?: string } | Event): void {
        for (const listener of this.listeners.get(type) ?? []) {
          listener(event);
        }
      }

      emit(type: string, data: unknown): void {
        if (this.closed) return;
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        this.dispatch(type, { data: payload });
      }

      close(): void {
        this.closed = true;
      }
    }

    class StubWebSocket {
      static OPEN = 1;
      readyState = 0;
      onopen: ((event: Event) => void) | null = null;
      constructor(_url: string) {
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.(new Event("open"));
        }, 0);
      }
      send(_data: string): void {}
      close(): void {
        this.readyState = 3;
      }
    }

    const w = window as unknown as {
      EventSource: unknown;
      WebSocket: unknown;
      __stubEventSource: typeof StubEventSource;
      __emitDeckFrame: (frame: unknown) => boolean;
      __emitEventsBump: (batch?: unknown) => boolean;
    };

    w.EventSource = StubEventSource as unknown;
    w.WebSocket = StubWebSocket as unknown;
    w.__stubEventSource = StubEventSource;

    // Emit a jitux frame into every deck stream (matches the session stream URL).
    w.__emitDeckFrame = (frame: unknown) => {
      const targets = StubEventSource.instances.filter(
        (instance) => !instance.closed && instance.url.includes("/stream"),
      );
      for (const instance of targets) {
        instance.emit("jitux.frame", frame);
        instance.emit("message", frame);
      }
      return targets.length > 0;
    };

    // Emit a jmcp.events batch into the App-level /events stream.
    w.__emitEventsBump = (batch?: unknown) => {
      const payload = batch ?? [{ id: 1, kind: "work.updated", ts: "2026-06-03T15:00:00.000Z" }];
      const targets = StubEventSource.instances.filter(
        (instance) => !instance.closed && instance.url.includes("/events"),
      );
      for (const instance of targets) {
        instance.emit("jmcp.events", payload);
      }
      return targets.length > 0;
    };
  });
}

export type MockBrokerOptions = {
  rest?: RestMode;
};

// Make the page fully offline. Routes every JMCP REST endpoint by trailing path
// (works for both the absolute 18877 loader and the /jmcp deck proxy) and the
// jitux session POST, and installs the stub SSE/WS transport.
export async function mockBroker(page: Page, options: MockBrokerOptions = {}): Promise<void> {
  const rest: RestMode = options.rest ?? "ok";
  await installStubTransport(page);

  // Playwright matches routes in reverse registration order (last registered wins),
  // so register broad backstops first and specific endpoints last.

  // Hard backstop: any other JMCP-namespaced call is refused offline.
  await page.route("**/jmcp/**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });

  // jitux session open (POST). Always succeeds so the deck can attempt to go live;
  // the stub EventSource then carries the frames.
  await page.route("**/jitux/sessions", async (route) => {
    await fulfillJson(route, jituxSessionDescriptor());
  });

  // Any jitux stream GET is fulfilled with an empty 200 body; real frames arrive
  // through the stub EventSource, not the HTTP response.
  await page.route("**/jitux/sessions/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
  });

  // Object-shaped platform endpoints. In ok/empty mode they return 500 so the
  // runtime keeps its in-fixture defaults for those (universe/fleet/control-plane
  // are not asserted by the Tier-1 specs); in error mode everything is 500.
  for (const endpoint of ["ecosystem", "fleet-board", "universe", "control-plane", "adapters"]) {
    await page.route(`**/${endpoint}`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "mock broker (unmodeled platform endpoint)" }),
      });
    });
  }

  const bodies = rest === "empty" ? emptyBodies() : okBodies();
  const endpoints = [
    "health",
    "work-orders",
    "evidence",
    "systems",
    "attention",
    "voice-text",
    "memory",
    "replay",
    "approvals",
    "approval-challenges",
  ];

  for (const endpoint of endpoints) {
    await page.route(`**/${endpoint}`, async (route) => {
      if (rest === "error") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "mock broker forced 500" }),
        });
        return;
      }
      await fulfillJson(route, bodies[endpoint]);
    });
  }
}
