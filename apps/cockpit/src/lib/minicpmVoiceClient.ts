import type { PcmAudioChunk } from "./pcmStreamingPlayer";

export interface MiniCpmMessage {
  role: "system" | "user" | "assistant";
  content: string | MiniCpmContent[];
}

export type MiniCpmContent =
  | { type: "text"; text: string }
  | { type: "audio"; data: string };

export interface MiniCpmRunOptions {
  turnId: string;
  messages: MiniCpmMessage[];
  signal: AbortSignal;
  onDelta: (delta: string) => void;
  onAudio: (audio: PcmAudioChunk, signal: AbortSignal) => void;
}

export interface MiniCpmRunResult {
  text: string;
}

interface VoiceFrame {
  type: string;
  text: string;
  textDelta: string;
  audioData: string;
  audioFormat: string;
  sampleRate: number;
  sequence: number | null;
  durationMs: number | null;
  ttsElapsedMs: number | null;
  queueDepthMs: number | null;
  error: string;
  endOfTurn: boolean;
  turnId: string;
}

export interface VoiceEvent {
  turn_id: string;
  event: string;
  stage?: string;
  status?: "ok" | "error";
  latency_ms?: number;
  bytes?: number;
  text?: string;
  transcript?: string;
  audio_hash?: string;
  error_class?: string;
  sequence?: number;
  duration_ms?: number;
  tts_elapsed_ms?: number;
  queue_depth_ms?: number;
}

export const VOICE_CONNECT_TIMEOUT_MS = 10_000;
export const VOICE_FIRST_FRAME_TIMEOUT_MS = 45_000;
export const VOICE_IDLE_FRAME_TIMEOUT_MS = 15_000;
export const VOICE_TOTAL_TURN_TIMEOUT_MS = 120_000;
const OUTPUT_SAMPLE_RATE = 48_000;
const INPUT_SAMPLE_RATE = 16_000;

function envBase(key: string, defaultBase: string): string {
  const value = import.meta.env[key];
  return typeof value === "string" && value.length > 0 ? value : defaultBase;
}

function voiceBase(): string {
  return envBase("VITE_VOICE_BASE", "/voice");
}

function voiceWsBase(): string {
  return envBase("VITE_VOICE_WS_BASE", "/voice-ws");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function abortError(): DOMException {
  return new DOMException("Voice turn aborted", "AbortError");
}

function wsUrl(path: string): string {
  const base = voiceWsBase();
  if (base.startsWith("ws://") || base.startsWith("wss://")) {
    return `${base}${path}`;
  }
  const origin =
    typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin;
  const url = new URL(`${base}${path}`, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function parseFrame(raw: MessageEvent<unknown>): VoiceFrame {
  const data = typeof raw.data === "string" ? raw.data : "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return {
      type: "raw",
      text: "",
      textDelta: data,
      audioData: "",
      audioFormat: "",
      sampleRate: OUTPUT_SAMPLE_RATE,
      sequence: null,
      durationMs: null,
      ttsElapsedMs: null,
      queueDepthMs: null,
      error: "",
      endOfTurn: false,
      turnId: "",
    };
  }
  if (!isRecord(parsed)) {
    return {
      type: "unknown",
      text: "",
      textDelta: "",
      audioData: "",
      audioFormat: "",
      sampleRate: OUTPUT_SAMPLE_RATE,
      sequence: null,
      durationMs: null,
      ttsElapsedMs: null,
      queueDepthMs: null,
      error: "",
      endOfTurn: false,
      turnId: "",
    };
  }
  return {
    type: readString(parsed.type),
    text: readString(parsed.text),
    textDelta: readString(parsed.text_delta),
    audioData: readString(parsed.audio_data),
    audioFormat: readString(parsed.audio_format),
    sampleRate: readNumber(parsed.sample_rate) ?? OUTPUT_SAMPLE_RATE,
    sequence: readNumber(parsed.sequence),
    durationMs: readNumber(parsed.duration_ms),
    ttsElapsedMs: readNumber(parsed.tts_elapsed_ms),
    queueDepthMs: readNumber(parsed.queue_depth_ms),
    error: readString(parsed.error),
    endOfTurn: readBoolean(parsed.end_of_turn),
    turnId: readString(parsed.turn_id),
  };
}

function clearTimer(timer: number | null): void {
  if (timer !== null) {
    window.clearTimeout(timer);
  }
}

export function generateTurnId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `turn_${crypto.randomUUID()}`;
  }
  return `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export async function recordVoiceEvent(event: VoiceEvent): Promise<void> {
  try {
    await fetch(`${voiceBase()}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    /* observability must not break the live turn */
  }
}

export function runMiniCpmChat(options: MiniCpmRunOptions): Promise<MiniCpmRunResult> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const socket = new WebSocket(wsUrl("/chat"));
    let settled = false;
    let fullText = "";
    let firstFrameSeen = false;
    let nextAudioSequence = 0;
    let connectTimer: number | null = null;
    let firstFrameTimer: number | null = null;
    let idleTimer: number | null = null;
    let totalTimer: number | null = null;

    const elapsed = () => Math.round(performance.now() - started);

    const cleanup = () => {
      clearTimer(connectTimer);
      clearTimer(firstFrameTimer);
      clearTimer(idleTimer);
      clearTimer(totalTimer);
      options.signal.removeEventListener("abort", abortTurn);
    };

    const closeSocket = () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };

    const finish = (text: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      closeSocket();
      void recordVoiceEvent({
        turn_id: options.turnId,
        event: "voice.close",
        stage: "browser",
        latency_ms: elapsed(),
        text,
      });
      resolve({ text });
    };

    const fail = (stage: string, error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      closeSocket();
      void recordVoiceEvent({
        turn_id: options.turnId,
        event: "voice.error",
        stage,
        status: "error",
        latency_ms: elapsed(),
        error_class: error.name || "Error",
      });
      reject(error);
    };

    const timeout = (stage: string) => {
      fail(stage, new Error(`${stage}_timeout`));
    };

    const scheduleIdle = () => {
      clearTimer(idleTimer);
      idleTimer = window.setTimeout(() => timeout("idle_frame"), VOICE_IDLE_FRAME_TIMEOUT_MS);
    };

    function abortTurn() {
      fail("barge_in", abortError());
    }

    if (options.signal.aborted) {
      reject(abortError());
      return;
    }

    options.signal.addEventListener("abort", abortTurn, { once: true });

    connectTimer = window.setTimeout(() => timeout("connect"), VOICE_CONNECT_TIMEOUT_MS);
    totalTimer = window.setTimeout(() => timeout("total_turn"), VOICE_TOTAL_TURN_TIMEOUT_MS);

    socket.onopen = () => {
      clearTimer(connectTimer);
      firstFrameTimer = window.setTimeout(
        () => timeout("first_frame"),
        VOICE_FIRST_FRAME_TIMEOUT_MS,
      );
      void recordVoiceEvent({
        turn_id: options.turnId,
        event: "voice.send",
        stage: "browser",
      });
      socket.send(
        JSON.stringify({
          turn_id: options.turnId,
          messages: options.messages,
          streaming: true,
          tts: { enabled: true },
          use_tts_template: true,
          omni_mode: true,
          generation: { max_new_tokens: 240, length_penalty: 1.1, temperature: 0.7 },
        }),
      );
    };

    socket.onerror = () => {
      fail("connect", new Error("voice_websocket_error"));
    };

    socket.onclose = () => {
      if (!settled) {
        fail("close", new Error("voice_websocket_closed"));
      }
    };

    socket.onmessage = (event) => {
      const frame = parseFrame(event);
      if (!firstFrameSeen) {
        firstFrameSeen = true;
        clearTimer(firstFrameTimer);
        scheduleIdle();
        void recordVoiceEvent({
          turn_id: options.turnId,
          event: "voice.first_model_frame",
          stage: "browser",
          latency_ms: elapsed(),
        });
      } else {
        scheduleIdle();
      }

      if (frame.type === "heartbeat" || frame.type === "prefill_done") {
        return;
      }
      if (frame.type === "error") {
        fail("backend", new Error(frame.error || "voice_backend_error"));
        return;
      }
      if (frame.textDelta.length > 0) {
        fullText += frame.textDelta;
        options.onDelta(frame.textDelta);
      }
      if (frame.audioData.length > 0) {
        const pcm = base64ToFloat32(frame.audioData);
        const sampleRate = frame.sampleRate || OUTPUT_SAMPLE_RATE;
        const sequence = frame.sequence ?? nextAudioSequence;
        nextAudioSequence = sequence + 1;
        options.onAudio(
          {
            pcm,
            sampleRate,
            sequence,
            durationMs: frame.durationMs ?? Math.round((pcm.length / sampleRate) * 1000),
            audioFormat: frame.audioFormat === "f32le" ? "f32le" : "f32le",
            ttsElapsedMs: frame.ttsElapsedMs ?? undefined,
            queueDepthMs: frame.queueDepthMs ?? undefined,
            turnId: frame.turnId || options.turnId,
          },
          options.signal,
        );
      }
      if (frame.type === "done") {
        finish(frame.text.length > 0 ? frame.text : fullText.trim());
        return;
      }
      if (frame.type === "result" && frame.endOfTurn) {
        finish(frame.text.length > 0 ? frame.text : fullText.trim());
      }
    };
  });
}

export async function audioBlobToPcm16kBase64(blob: Blob): Promise<string> {
  const AudioContextCtor = window.AudioContext;
  const ctx = new AudioContextCtor();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = mixToMono(decoded);
    const resampled = resample(mono, decoded.sampleRate, INPUT_SAMPLE_RATE);
    return float32ToBase64(resampled);
  } finally {
    await ctx.close();
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const output = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      output[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return output;
}

function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) {
    return input;
  }
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const source = i * ratio;
    const left = Math.floor(source);
    const right = Math.min(input.length - 1, left + 1);
    const frac = source - left;
    output[i] = input[left] + (input[right] - input[left]) * frac;
  }
  return output;
}

function float32ToBase64(input: Float32Array): string {
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToFloat32(input: string): Float32Array {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}

export function float32PcmBase64ToWav(input: string, sampleRate: number): Blob {
  return float32PcmToWav(base64ToFloat32(input), sampleRate);
}

function float32PcmToWav(pcm: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
