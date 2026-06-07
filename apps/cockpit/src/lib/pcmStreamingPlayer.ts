import { recordVoiceEvent } from "./minicpmVoiceClient";

export interface PcmAudioChunk {
  pcm: Float32Array;
  sampleRate: number;
  sequence: number;
  durationMs: number;
  audioFormat: "f32le";
  ttsElapsedMs?: number;
  queueDepthMs?: number;
  turnId?: string;
}

export type SchedulerEvent =
  | { type: "start"; queueDepthMs: number }
  | { type: "sequence_mismatch"; expected: number; actual: number }
  | { type: "underrun"; missingMs: number };

export class PcmPlaybackScheduler {
  private readonly jitterBufferMs: number;
  private expectedSequence = 0;
  private queuedMs = 0;
  private started = false;

  constructor(jitterBufferMs = 150) {
    this.jitterBufferMs = jitterBufferMs;
  }

  push(chunk: PcmAudioChunk): SchedulerEvent[] {
    const events: SchedulerEvent[] = [];
    if (chunk.sequence !== this.expectedSequence) {
      events.push({
        type: "sequence_mismatch",
        expected: this.expectedSequence,
        actual: chunk.sequence,
      });
      this.expectedSequence = chunk.sequence;
    }
    this.expectedSequence += 1;
    this.queuedMs += chunk.durationMs;
    if (!this.started && this.queuedMs >= this.jitterBufferMs) {
      this.started = true;
      events.push({ type: "start", queueDepthMs: this.queuedMs });
    }
    return events;
  }

  consume(durationMs: number): SchedulerEvent[] {
    if (!this.started) return [];
    this.queuedMs -= durationMs;
    if (this.queuedMs >= 0) return [];
    const missingMs = Math.abs(this.queuedMs);
    this.queuedMs = 0;
    return [{ type: "underrun", missingMs }];
  }

  clear(): void {
    this.expectedSequence = 0;
    this.queuedMs = 0;
    this.started = false;
  }

  forceStart(): SchedulerEvent | null {
    if (this.started || this.queuedMs <= 0) return null;
    this.started = true;
    return { type: "start", queueDepthMs: this.queuedMs };
  }

  queuedDurationMs(): number {
    return this.queuedMs;
  }

  isStarted(): boolean {
    return this.started;
  }
}

interface PlayerCallbacks {
  getTurnId: () => string | null;
  onPlaybackStart: (chunk: PcmAudioChunk) => void;
  onPlaybackIdle: () => void;
  onPlaybackEnergy: (energy: number) => void;
}

export class PcmStreamingPlayer {
  private readonly scheduler = new PcmPlaybackScheduler(150);
  private readonly callbacks: PlayerCallbacks;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private idleTimer: number | null = null;
  private startTimer: number | null = null;
  private pendingStartChunk: PcmAudioChunk | null = null;
  private lastTail: Float32Array | null = null;

  constructor(callbacks: PlayerCallbacks) {
    this.callbacks = callbacks;
  }

  async enqueue(chunk: PcmAudioChunk): Promise<void> {
    const node = await this.ensureNode();
    const events = this.scheduler.push(chunk);
    const ctx = this.ctx;
    if (ctx === null) return;
    const pcm = chunk.sampleRate === ctx.sampleRate
      ? chunk.pcm
      : resample(chunk.pcm, chunk.sampleRate, ctx.sampleRate);
    const smoothed = this.crossfade(pcm, ctx.sampleRate);
    const transferable = new Float32Array(smoothed);
    node.port.postMessage({ type: "push", samples: transferable.buffer }, [transferable.buffer]);
    this.callbacks.onPlaybackEnergy(estimatePcmEnergy(pcm));
    for (const event of events) {
      if (event.type === "sequence_mismatch") {
        this.record({
          event: "voice.playback_sequence_mismatch",
          stage: "browser",
          status: "error",
          sequence: event.actual,
        });
      } else if (event.type === "start") {
        this.startPlayback(chunk);
      }
    }
    if (!this.scheduler.isStarted()) {
      this.armStartTimer(chunk);
    }
    this.armIdleTimer();
  }

  clear(): void {
    this.scheduler.clear();
    this.lastTail = null;
    this.node?.port.postMessage({ type: "clear" });
    this.clearIdleTimer();
    this.clearStartTimer();
  }

  abort(): void {
    this.clear();
    this.record({ event: "voice.playback_abort", stage: "browser" });
  }

  hasPending(): boolean {
    return this.scheduler.isStarted() || this.scheduler.queuedDurationMs() > 0;
  }

  async close(): Promise<void> {
    this.clear();
    this.node?.disconnect();
    this.node = null;
    if (this.ctx !== null) {
      await this.ctx.close();
      this.ctx = null;
    }
  }

  private async ensureNode(): Promise<AudioWorkletNode> {
    if (this.node !== null) return this.node;
    const AudioContextCtor = window.AudioContext;
    const ctx = new AudioContextCtor({ latencyHint: "interactive" });
    await ctx.audioWorklet.addModule(new URL("./pcmRingWorklet.ts", import.meta.url));
    const node = new AudioWorkletNode(ctx, "jmcp-pcm-ring", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node.port.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data.type === "underrun") {
        this.record({ event: "voice.playback_underrun", stage: "browser", status: "error" });
      } else if (event.data.type === "idle") {
        this.callbacks.onPlaybackIdle();
      }
    };
    node.connect(ctx.destination);
    this.ctx = ctx;
    this.node = node;
    return node;
  }

  private crossfade(pcm: Float32Array, sampleRate: number): Float32Array {
    const fadeSamples = Math.min(Math.round(sampleRate * 0.005), pcm.length);
    if (fadeSamples <= 0) return pcm;
    const output = new Float32Array(pcm);
    if (this.lastTail !== null && this.lastTail.length === fadeSamples) {
      for (let i = 0; i < fadeSamples; i += 1) {
        const t = (i + 1) / (fadeSamples + 1);
        output[i] = this.lastTail[i] * (1 - t) + output[i] * t;
      }
    }
    this.lastTail = output.slice(output.length - fadeSamples);
    return output;
  }

  private startPlayback(chunk: PcmAudioChunk): void {
    this.clearStartTimer();
    this.node?.port.postMessage({ type: "start" });
    this.callbacks.onPlaybackStart(chunk);
  }

  private armStartTimer(chunk: PcmAudioChunk): void {
    this.pendingStartChunk = this.pendingStartChunk ?? chunk;
    if (this.startTimer !== null) return;
    this.startTimer = window.setTimeout(() => {
      const event = this.scheduler.forceStart();
      const startChunk = this.pendingStartChunk;
      this.pendingStartChunk = null;
      this.startTimer = null;
      if (event !== null && startChunk !== null) {
        this.startPlayback(startChunk);
      }
    }, 150);
  }

  private armIdleTimer(): void {
    this.clearIdleTimer();
    const waitMs = Math.max(220, this.scheduler.queuedDurationMs() + 220);
    this.idleTimer = window.setTimeout(() => {
      this.callbacks.onPlaybackIdle();
    }, waitMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private clearStartTimer(): void {
    if (this.startTimer !== null) {
      window.clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    this.pendingStartChunk = null;
  }

  private record(event: {
    event: string;
    stage: string;
    status?: "ok" | "error";
    sequence?: number;
  }): void {
    const turnId = this.callbacks.getTurnId();
    if (turnId === null) return;
    void recordVoiceEvent({
      turn_id: turnId,
      event: event.event,
      stage: event.stage,
      status: event.status,
      sequence: event.sequence,
    });
  }
}

export function estimatePcmEnergy(pcm: Float32Array): number {
  if (pcm.length === 0) return 0.08;
  let sum = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    sum += pcm[i] * pcm[i];
  }
  return Math.max(0.001, Math.sqrt(sum / pcm.length));
}

function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
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
