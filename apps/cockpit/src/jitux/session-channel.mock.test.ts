import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDeckLiveSession,
  getDeckSessionDescriptor,
  publishDeckSessionDescriptor,
  resetDeckSessionChannelForTests,
  subscribeDeckSessionDescriptor,
} from "./session-channel";
import { MockEventSource } from "./mock-event-source";
import { createQueueBlockerFrames } from "./queue-blocker-frames";
import { createFixtureRuntime } from "../runtime";

afterEach(() => {
  resetDeckSessionChannelForTests();
  MockEventSource.reset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function descriptorResponse(sessionId = "jitux_live"): Response {
  return new Response(
    JSON.stringify({
      sessionId,
      streamUrl: `/jitux/sessions/${sessionId}/stream`,
      wsUrl: `/jitux/sessions/${sessionId}/ws`,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("JITUX session channel", () => {
  it("publishes descriptors to multiple subscribers and supports unsubscribe", () => {
    const first: Array<{ sessionId: string; streamUrl: string }> = [];
    const second: Array<{ sessionId: string; streamUrl: string }> = [];

    const unsubscribeFirst = subscribeDeckSessionDescriptor((descriptor) => {
      first.push(descriptor);
    });

    publishDeckSessionDescriptor({
      sessionId: "jitux_a",
      streamUrl: "/jitux/sessions/jitux_a/stream",
    });

    const unsubscribeSecond = subscribeDeckSessionDescriptor((descriptor) => {
      second.push(descriptor);
    });

    publishDeckSessionDescriptor({
      sessionId: "jitux_b",
      streamUrl: "/jitux/sessions/jitux_b/stream",
    });

    unsubscribeFirst();
    publishDeckSessionDescriptor({
      sessionId: "jitux_c",
      streamUrl: "/jitux/sessions/jitux_c/stream",
    });
    unsubscribeSecond();

    expect(first).toEqual([
      { sessionId: "jitux_a", streamUrl: "/jitux/sessions/jitux_a/stream" },
      { sessionId: "jitux_b", streamUrl: "/jitux/sessions/jitux_b/stream" },
    ]);
    expect(second).toEqual([
      { sessionId: "jitux_a", streamUrl: "/jitux/sessions/jitux_a/stream" },
      { sessionId: "jitux_b", streamUrl: "/jitux/sessions/jitux_b/stream" },
      { sessionId: "jitux_c", streamUrl: "/jitux/sessions/jitux_c/stream" },
    ]);
    expect(getDeckSessionDescriptor()).toEqual({
      sessionId: "jitux_c",
      streamUrl: "/jitux/sessions/jitux_c/stream",
    });
    unsubscribeFirst();
    unsubscribeSecond();
  });
});

describe("JITUX live session stream-error recovery", () => {
  it("keeps a valid finite stream stable when EventSource errors after a live frame", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(descriptorResponse("jitux_live"))));
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    const onStreamUnavailable = vi.fn();
    const session = createDeckLiveSession({
      onOpening: vi.fn(),
      onOpen: vi.fn(),
      onFrame: vi.fn(),
      onSessionUnavailable: vi.fn(),
      onStreamUnavailable,
    });

    const stop = session.start();

    // Wait for the descriptor fetch to resolve and the EventSource to open.
    await vi.waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    const frames = createQueueBlockerFrames(createFixtureRuntime(), "jitux_live");
    const firstStream = MockEventSource.instances[0];

    // A successful live frame moves the deck to "live".
    firstStream.emitFrame(frames[0]);
    expect(onStreamUnavailable).not.toHaveBeenCalled();

    // A finite JITUX backlog stream can surface as EventSource "error" after
    // valid frames. That must not mark the broker unavailable.
    firstStream.emitError();
    expect(onStreamUnavailable).not.toHaveBeenCalled();
    expect(firstStream.closed).toBe(false);

    await vi.advanceTimersByTimeAsync(1500);
    expect(MockEventSource.instances).toHaveLength(1);

    stop();
  });
});
