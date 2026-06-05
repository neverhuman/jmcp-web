import type { RuntimeState } from "../runtime";
import {
  QUEUE_BLOCKERS_DECK_SESSION_REQUEST,
  openDeckSession,
  subscribeToDeckFrames,
  type DeckSessionDescriptor,
} from "./client";
import type { FrameSource, JituxFrame } from "./types";

export type DeckSessionChannelDescriptor = {
  sessionId: string;
  streamUrl: string;
};

export type DeckLiveStopReason = "deactivate" | "barge_in";

export type DeckSessionTraceProbe = {
  id: string;
  label: string;
  source: FrameSource;
  status: "queued" | "running" | "ready" | "degraded";
  latencyMs?: number;
};

export type DeckTurnTraceContext = {
  prompt?: string;
  route?: string;
  firstFrameReceived?: boolean;
  acceptedFrames?: number;
  rejectedFrames?: number;
};

export type DeckLiveSessionCallbacks = {
  onOpening: () => void;
  onOpen: (descriptor: DeckSessionDescriptor) => void;
  onFrame: (frame: JituxFrame, descriptor: DeckSessionDescriptor) => void;
  onSessionUnavailable: () => void;
  onStreamUnavailable: () => void;
};

type Listener = (descriptor: DeckSessionChannelDescriptor) => void;

let currentDescriptor: DeckSessionChannelDescriptor | null = null;
const listeners = new Set<Listener>();

function isAbortError(error: unknown): boolean {
  return (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

export function createDeckTrace(
  runtime: RuntimeState,
  status: DeckSessionTraceProbe["status"],
  source: FrameSource,
  context: DeckTurnTraceContext = {},
): DeckSessionTraceProbe[] {
  const liveSources = runtime.sourceStatuses.filter((item) => item.state === "live").length;
  const degradedSources = runtime.sourceStatuses.length - liveSources;
  const acceptedFrames = context.acceptedFrames ?? 0;
  const rejectedFrames = context.rejectedFrames ?? 0;
  return [
    { id: "prompt", label: context.prompt?.trim() ? "prompt" : "prompt empty", source: "frontend", status: context.prompt?.trim() ? "ready" : "queued" },
    { id: "route", label: context.route ? `route ${context.route}` : "route pending", source: "agent", status: context.route ? "ready" : "queued" },
    { id: "jitux-session", label: "JITUX session", source, status, latencyMs: status === "ready" ? 12 : undefined },
    { id: "first-frame", label: context.firstFrameReceived ? "first frame" : "first frame pending", source: "projection", status: context.firstFrameReceived ? "ready" : status },
    { id: "accepted-frames", label: `accepted ${acceptedFrames}`, source: "projection", status: acceptedFrames > 0 ? "ready" : "queued" },
    { id: "rejected-frames", label: `rejected ${rejectedFrames}`, source: "projection", status: rejectedFrames > 0 ? "degraded" : "ready" },
    { id: "source-diagnostics", label: `${liveSources} live/${degradedSources} degraded`, source: "adapter", status: degradedSources > 0 ? "degraded" : "ready", latencyMs: 33 },
    { id: "llm-tools-tts", label: "LLM/tool/TTS", source: "agent", status: runtime.voiceThreads.length > 0 || runtime.approvalRequests.length > 0 ? "ready" : "queued", latencyMs: 39 },
  ];
}

export function createDeckLiveSession(callbacks: DeckLiveSessionCallbacks) {
  let abortController: AbortController | null = null;
  let closeStream: (() => void) | null = null;
  let retryTimer: number | null = null;
  let token = 0;

  const clearRetryTimer = () => {
    if (retryTimer === null) {
      return;
    }
    window.clearTimeout(retryTimer);
    retryTimer = null;
  };

  const scheduleRetry = (currentToken: number, controller: AbortController) => {
    if (retryTimer !== null || controller.signal.aborted || currentToken !== token) {
      return;
    }
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      if (controller.signal.aborted || currentToken !== token) {
        return;
      }
      void attemptOpen(currentToken, controller);
    }, 1500);
  };

  const attemptOpen = async (currentToken: number, controller: AbortController) => {
    closeStream?.();
    closeStream = null;
    callbacks.onOpening();

    try {
      const descriptor = await openDeckSession(QUEUE_BLOCKERS_DECK_SESSION_REQUEST, controller.signal);
      if (controller.signal.aborted || currentToken !== token) return;
      let receivedFrame = false;
      publishDeckSessionDescriptor({ sessionId: descriptor.sessionId, streamUrl: descriptor.streamUrl });
      callbacks.onOpen(descriptor);
      const close = subscribeToDeckFrames(
        descriptor.streamUrl,
        (frame) => {
          if (controller.signal.aborted || currentToken !== token) return;
          receivedFrame = true;
          clearRetryTimer();
          callbacks.onFrame(frame, descriptor);
        },
        () => {
          if (controller.signal.aborted || currentToken !== token) return;
          // An error after a successful frame means the live stream broke; tear it
          // down, mark the deck degraded, and re-arm the retry so the deck does not
          // sit "live" but frozen. Pre-frame errors keep the original transient-retry
          // behavior.
          receivedFrame = false;
          closeStream?.();
          closeStream = null;
          callbacks.onStreamUnavailable();
          scheduleRetry(currentToken, controller);
        },
      );
      if (controller.signal.aborted || currentToken !== token) {
        close();
        return;
      }
      closeStream = close;
    } catch (error: unknown) {
      if (controller.signal.aborted || currentToken !== token || isAbortError(error)) return;
      callbacks.onSessionUnavailable();
      scheduleRetry(currentToken, controller);
    }
  };

  const stop = () => {
    token += 1;
    clearRetryTimer();
    abortController?.abort();
    abortController = null;
    closeStream?.();
    closeStream = null;
  };

  return {
    start: () => {
      stop();
      const currentToken = ++token;
      const controller = new AbortController();
      abortController = controller;
      void attemptOpen(currentToken, controller);

      return stop;
    },
    stop,
  };
}

export function publishDeckSessionDescriptor(descriptor: DeckSessionChannelDescriptor): void {
  currentDescriptor = descriptor;
  for (const listener of listeners) {
    listener(descriptor);
  }
}

export function getDeckSessionDescriptor(): DeckSessionChannelDescriptor | null {
  return currentDescriptor;
}

export function subscribeDeckSessionDescriptor(listener: Listener): () => void {
  listeners.add(listener);
  if (currentDescriptor !== null) {
    listener(currentDescriptor);
  }
  return () => listeners.delete(listener);
}

export function resetDeckSessionChannelForTests(): void {
  currentDescriptor = null;
  listeners.clear();
}
