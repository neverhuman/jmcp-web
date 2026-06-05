import { useSyncExternalStore } from "react";
import type { RuntimeState } from "../runtime";
import { initialJituxState, reduceJituxFrame } from "./reducer";
import {
  createDeckLiveSession,
  createDeckTrace,
  resetDeckSessionChannelForTests,
  type DeckLiveStopReason,
  type DeckSessionTraceProbe,
} from "./session-channel";
import { createQueueBlockerFrames, reason, seqFrame } from "./queue-blocker-frames";
export { createQueueBlockerFrames } from "./queue-blocker-frames";
import { createNowCommandFrames, dialogueForState } from "./command-scenes";
import { routeNowCommand } from "./command-router";
import { getCardsForPane, getRankedPanes } from "./deck-queries";
import type { JituxFrame, JituxState } from "./types";

export { getCardsForPane, getRankedPanes };
export type { DeckCardVM } from "./deck-queries";

type Listener = () => void;
type Selector<T> = (state: DeckState) => T;

export type DeckNavState = "idle" | "observing" | "agent_takeover" | "needs_user" | "acting" | "complete";
export type DeckStreamStatus = "idle" | "opening" | "live" | "degraded";
export type TraceProbe = DeckSessionTraceProbe;

export type DeckState = JituxState & {
  mode: "idle" | "mission_deck";
  navState: DeckNavState;
  generation: number;
  trace: TraceProbe[];
  caption: string;
  streamStatus: DeckStreamStatus;
  streamUrl: string | null;
  wsUrl: string | null;
  prompt: string;
  dialogue: string[];
};

export const initialDeckState: DeckState = {
  ...initialJituxState, mode: "idle", navState: "idle", generation: 0, trace: [], caption: "", streamStatus: "idle", streamUrl: null, wsUrl: null, prompt: "", dialogue: [],
};

function navStateFor(state: JituxState): DeckNavState {
  if (state.error) {
    return "needs_user";
  }
  if (state.complete) {
    return "complete";
  }
  if (state.active) {
    return "agent_takeover";
  }
  return "idle";
}

function reduceDeckFrame(state: DeckState, frame: JituxFrame): DeckState {
  const next = reduceJituxFrame(state, frame);
  if (next === state) {
    return state;
  }
  return { ...state, ...next, mode: next.active ? "mission_deck" : "idle", navState: navStateFor(next), generation: state.generation + 1 };
}

function createStore() {
  let state = initialDeckState;
  const listeners = new Set<Listener>();
  let latestRuntime: RuntimeState | null = null;
  let latestPrompt = "";
  let idleScanTimer: number | null = null;

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const setState = (nextState: DeckState) => {
    if (nextState !== state) {
      state = nextState;
      emit();
    }
  };

  const applyFramesTo = (base: DeckState, frames: JituxFrame[]): DeckState => {
    let nextState = base;
    for (const frame of frames) {
      nextState = reduceDeckFrame(nextState, frame);
    }
    return nextState;
  };

  const applyFrames = (frames: JituxFrame[]) => setState(applyFramesTo(state, frames));

  const stopIdleScan = () => {
    if (idleScanTimer === null) {
      return;
    }
    window.clearInterval(idleScanTimer);
    idleScanTimer = null;
  };

  const startIdleScan = () => {
    stopIdleScan();
    idleScanTimer = window.setInterval(() => {
      if (latestPrompt.trim().length > 0 && routeNowCommand(latestPrompt).intent !== "system_report") {
        return;
      }
      const ranked = getRankedPanes(state);
      if (ranked.length < 2 || !state.sessionId) {
        return;
      }
      const currentIndex = ranked.findIndex((pane) => pane.id === state.focusPaneId);
      const nextPane = ranked[(currentIndex + 1) % ranked.length];
      const frame = seqFrame("focus.change", state.sessionId, state.lastSeq + 1, {
        paneId: nextPane.id,
        reason: reason(0.68, `${nextPane.title} surfaced during ambient macro-system scanning.`, { freshness: 0.7, userQueryRelevance: 0.35 }),
      });
      setState(reduceDeckFrame(state, frame));
    }, 4200);
  };

  const primeCommandDeck = (runtime: RuntimeState, prompt = latestPrompt) => {
    latestPrompt = prompt;
    const route = routeNowCommand(prompt);
    const frames = route.intent === "work_queue" || route.intent === "queue_blockers"
      ? createQueueBlockerFrames(runtime)
      : createNowCommandFrames(runtime, prompt);
    setState({
      ...applyFramesTo(initialDeckState, frames),
      trace: createDeckTrace(runtime, "degraded", "frontend", {
        prompt,
        route: route.title,
        acceptedFrames: frames.length,
        firstFrameReceived: frames.length > 0,
      }),
      caption: "Cached snapshot is visible while the broker session opens.",
      streamStatus: "degraded",
      streamUrl: null,
      wsUrl: null,
      prompt,
      dialogue: dialogueForState(runtime, prompt),
    });
  };

  const markStreamDegraded = (caption: string) => {
    const route = routeNowCommand(latestPrompt);
    setState({
      ...state,
      streamStatus: "degraded",
      trace: latestRuntime
        ? createDeckTrace(latestRuntime, "degraded", "frontend", {
            prompt: latestPrompt,
            route: route.title,
            acceptedFrames: state.lastSeq,
          })
        : state.trace,
      caption,
    });
  };

  const acceptLiveFrame = (frame: JituxFrame, descriptor: { streamUrl: string; wsUrl: string }) => {
    const runtime = latestRuntime;
    const nextState = reduceDeckFrame(state, frame);
    setState({
      ...nextState,
      streamStatus: "live",
      streamUrl: descriptor.streamUrl,
      wsUrl: descriptor.wsUrl,
      trace: runtime
        ? createDeckTrace(runtime, "ready", "projection", {
            prompt: latestPrompt,
            route: routeNowCommand(latestPrompt).title,
            firstFrameReceived: true,
            acceptedFrames: nextState.lastSeq,
          })
        : nextState.trace,
      caption: "BROKER is driving the Mission Deck with live frames and ranked insights.",
    });
  };

  const liveSession = createDeckLiveSession({
    onOpening: () => {
      const runtime = latestRuntime;
      if (!runtime) return;
      setState({
        ...state,
        streamStatus: "opening",
        streamUrl: null,
        wsUrl: null,
        trace: createDeckTrace(runtime, "degraded", "frontend", {
          prompt: latestPrompt,
          route: routeNowCommand(latestPrompt).title,
          acceptedFrames: state.lastSeq,
        }),
        caption: `Broker session opening for ${routeNowCommand(latestPrompt).title}.`,
      });
    },
    onOpen: (descriptor) => {
      setState({
        ...state,
        streamStatus: "opening",
        streamUrl: descriptor.streamUrl,
        wsUrl: descriptor.wsUrl,
        caption: `Broker session ${descriptor.sessionId} opened for ${routeNowCommand(latestPrompt).title}.`,
      });
    },
    onFrame: (frame, descriptor) => {
      acceptLiveFrame(frame, descriptor);
    },
    onSessionUnavailable: () =>
      markStreamDegraded("Broker session unavailable; retrying to keep the Mission Deck broker-driven."),
    onStreamUnavailable: () =>
      markStreamDegraded("Broker stream unavailable; retrying to keep the Mission Deck broker-driven."),
  });

  return {
    getSnapshot: () => state,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (frame: JituxFrame) => setState(reduceDeckFrame(state, frame)),
    applyFrames,
    igniteQueueBlockers: (runtime: RuntimeState) => {
      latestRuntime = runtime;
      liveSession.stop();
      primeCommandDeck(runtime, "what is blocking the queue?");
    },
    startLiveQueueBlockers: (runtime?: RuntimeState, prompt = latestPrompt || "what is blocking the queue?") => {
      if (runtime) {
        latestRuntime = runtime;
      }
      const currentRuntime = latestRuntime;
      if (!currentRuntime) {
        return () => undefined;
      }
      if (!state.active) {
        primeCommandDeck(currentRuntime, prompt);
      }
      return liveSession.startWith({ prompt: prompt || "what is blocking the queue?", source: "deck" });
    },
    stopLiveQueueBlockers: (reason: DeckLiveStopReason = "deactivate") => {
      liveSession.stop();
      stopIdleScan();
      if (reason === "barge_in" && state.active) {
        markStreamDegraded("Live broker stream paused for barge-in; cached snapshot remains visible.");
      }
    },
    // Driven by the realtime reasoning agent: re-ignite the deck for this turn so
    // panes fly in and the Now rail goes purple the instant a question is asked,
    // before any speech. No-op until a runtime snapshot is known (Now view mounted).
    beginAgentTurn: (label?: string) => {
      const runtime = latestRuntime;
      if (!runtime) {
        return;
      }
      liveSession.stop();
      const trimmed = (label ?? "").trim();
      stopIdleScan();
      primeCommandDeck(runtime, trimmed || "status report");
      if (trimmed.length > 0) {
        setState({ ...state, caption: `Agent investigating: ${trimmed}` });
      }
      liveSession.startWith({ prompt: trimmed || "status report", source: "deck" });
    },
    startIdleMacroScan: () => {
      startIdleScan();
      return stopIdleScan;
    },
    // One reshuffle per reasoning step / tool call: advance focus to the next ranked
    // pane so the deck visibly moves at the speed of the agent's reasoning.
    pulseAgentStep: (label: string) => {
      const ranked = getRankedPanes(state);
      if (ranked.length === 0 || !state.sessionId) {
        return;
      }
      const currentIndex = ranked.findIndex((pane) => pane.id === state.focusPaneId);
      const nextPane = ranked[(currentIndex + 1) % ranked.length];
      const frame = seqFrame("focus.change", state.sessionId, state.lastSeq + 1, {
        paneId: nextPane.id,
        reason: reason(0.8, label, { userQueryRelevance: 0.85, freshness: 0.6 }),
      });
      setState(reduceDeckFrame(state, frame));
    },
    promotePane: (paneId: string, explanation: string) => {
      const current = state.panes[paneId];
      if (!current || !state.sessionId) {
        return;
      }
      const frame = seqFrame("focus.change", state.sessionId, state.lastSeq + 1, {
        paneId,
        reason: reason(0.75, explanation, { userQueryRelevance: 0.8, freshness: 0.5 }),
      });
      setState(reduceDeckFrame(state, frame));
    },
    clear: () => {
      liveSession.stop();
      stopIdleScan();
      latestRuntime = null;
      latestPrompt = "";
      resetDeckSessionChannelForTests();
      setState(initialDeckState);
    },
    rankedPanes: () => getRankedPanes(state),
    cardsForPane: (paneId: string) => getCardsForPane(state, paneId),
  };
}

export const deckStore = createStore();

export function useDeckSnapshot(): DeckState;
export function useDeckSnapshot<T>(selector: Selector<T>): T;
export function useDeckSnapshot<T>(selector?: Selector<T>): DeckState | T {
  const snapshot = useSyncExternalStore(deckStore.subscribe, deckStore.getSnapshot, deckStore.getSnapshot);
  return selector ? selector(snapshot) : snapshot;
}

export function resetDeckStoreForTests(): void {
  deckStore.clear();
}
