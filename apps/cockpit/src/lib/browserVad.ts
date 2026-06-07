import type { VoiceState } from "./voiceAssistantTypes";

export type VadOutcome = "accepted" | "echo_rejected" | "too_short" | "silence";

export interface VadFeatureRecord {
  ts: number;
  deviceHash: string;
  vadScore: number;
  rms: number;
  playbackEnergy: number;
  candidateDurationMs: number;
  outcome: VadOutcome;
}

export interface VadFrame {
  samples: Float32Array;
  nowMs: number;
  voiceState: VoiceState;
  playbackActive: boolean;
  playbackStartedAtMs: number;
  playbackEnergy: number;
}

export type VadDecision =
  | { type: "speech_start"; bargeIn: boolean }
  | { type: "speech_end"; durationMs: number }
  | { type: "none" };

export interface BrowserVadOptions {
  minSpeechMs: number;
  silenceMs: number;
  deviceHash: string;
  store?: VadLearningBackend;
  recordEvent?: (event: {
    event: string;
    stage: string;
    status?: "ok" | "error";
    latency_ms?: number;
    bytes?: number;
  }) => void;
}

export const BROWSER_VAD_MODEL_URL = "/models/vad/silero_vad.onnx";

export interface VadLearningBackend {
  save(record: VadFeatureRecord): Promise<void>;
  loadCalibration(deviceHash: string): Promise<{ scoreOffset: number; rmsOffset: number }>;
}

const DB_NAME = "jmcp_voice_vad";
const DB_VERSION = 1;
const STORE_NAME = "feature_records";
const MAX_RECORDS = 400;
const LISTENING_SCORE_THRESHOLD = 0.56;
const PLAYBACK_SCORE_THRESHOLD = 0.84;
const LISTENING_RMS_THRESHOLD = 0.012;
const PLAYBACK_RMS_THRESHOLD = 0.026;
const LISTENING_SUSTAINED_MS = 96;
const PLAYBACK_SUSTAINED_MS = 360;
const OUTPUT_START_GRACE_MS = 480;
const ECHO_LOG_INTERVAL_MS = 700;

export class VadLearningStore implements VadLearningBackend {
  async save(record: VadFeatureRecord): Promise<void> {
    const db = await openDb();
    await txDone(db, "readwrite", (store) => {
      store.put(record);
      const countRequest = store.count();
      countRequest.onsuccess = () => {
        const overflow = countRequest.result - MAX_RECORDS;
        if (overflow <= 0) return;
        const cursorRequest = store.openCursor();
        let deleted = 0;
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || deleted >= overflow) return;
          cursor.delete();
          deleted += 1;
          cursor.continue();
        };
      };
    });
    db.close();
  }

  async loadCalibration(deviceHash: string): Promise<{ scoreOffset: number; rmsOffset: number }> {
    const db = await openDb();
    const records = await new Promise<VadFeatureRecord[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onerror = () => reject(request.error ?? new Error("vad calibration read failed"));
      request.onsuccess = () => {
        const values = request.result.filter(
          (record) => record.deviceHash === deviceHash,
        ) as VadFeatureRecord[];
        resolve(values.slice(-80));
      };
    });
    db.close();
    const accepted = records.filter((record) => record.outcome === "accepted");
    const rejected = records.filter((record) => record.outcome === "echo_rejected");
    const scoreOffset = average(accepted.map((record) => record.vadScore)) > 0.8 ? -0.03 : 0;
    const rmsOffset = average(rejected.map((record) => record.rms)) > 0.02 ? 0.004 : 0;
    return { scoreOffset, rmsOffset };
  }
}

export class MemoryVadLearningStore implements VadLearningBackend {
  readonly records: VadFeatureRecord[] = [];

  async save(record: VadFeatureRecord): Promise<void> {
    this.records.push(record);
  }

  async loadCalibration(_deviceHash: string): Promise<{ scoreOffset: number; rmsOffset: number }> {
    return { scoreOffset: 0, rmsOffset: 0 };
  }
}

export class BrowserVadController {
  private readonly store: VadLearningBackend;
  private readonly recordEvent: BrowserVadOptions["recordEvent"];
  private readonly minSpeechMs: number;
  private readonly silenceMs: number;
  private readonly deviceHash: string;
  private scoreOffset = 0;
  private rmsOffset = 0;
  private candidateSinceMs = 0;
  private speechStartedAtMs = 0;
  private silenceSinceMs = 0;
  private capturing = false;
  private lastEchoLoggedAtMs = 0;
  private lastFeatures: VadFeatureRecord | null = null;

  constructor(options: BrowserVadOptions) {
    this.store = options.store ?? new VadLearningStore();
    this.recordEvent = options.recordEvent;
    this.minSpeechMs = options.minSpeechMs;
    this.silenceMs = options.silenceMs;
    this.deviceHash = options.deviceHash;
    void this.store.loadCalibration(this.deviceHash).then((calibration) => {
      this.scoreOffset = calibration.scoreOffset;
      this.rmsOffset = calibration.rmsOffset;
    });
  }

  acceptFrame(frame: VadFrame): VadDecision {
    if (frame.voiceState === "thinking" || frame.voiceState === "transcribing") {
      this.candidateSinceMs = 0;
      this.silenceSinceMs = 0;
      return { type: "none" };
    }
    const rms = frameRms(frame.samples);
    const vadScore = estimateVadScore(frame.samples, rms);
    const playbackGate = frame.playbackActive && frame.voiceState === "speaking";
    const scoreThreshold =
      (playbackGate ? PLAYBACK_SCORE_THRESHOLD : LISTENING_SCORE_THRESHOLD) + this.scoreOffset;
    const rmsThreshold =
      (playbackGate ? PLAYBACK_RMS_THRESHOLD : LISTENING_RMS_THRESHOLD) + this.rmsOffset;
    const sustainedMs = playbackGate ? PLAYBACK_SUSTAINED_MS : LISTENING_SUSTAINED_MS;
    const speechLike = vadScore >= scoreThreshold && rms >= rmsThreshold;

    if (!speechLike) {
      this.candidateSinceMs = 0;
      if (this.capturing) {
        if (this.silenceSinceMs === 0) {
          this.silenceSinceMs = frame.nowMs;
        }
        if (frame.nowMs - this.silenceSinceMs >= this.silenceMs) {
          this.capturing = false;
          const durationMs = frame.nowMs - this.speechStartedAtMs;
          void this.saveOutcome(
            frame,
            vadScore,
            rms,
            durationMs,
            durationMs < this.minSpeechMs ? "too_short" : "silence",
          );
          return { type: "speech_end", durationMs };
        }
      }
      return { type: "none" };
    }

    this.silenceSinceMs = frame.nowMs;
    if (this.candidateSinceMs === 0) {
      this.candidateSinceMs = frame.nowMs;
    }
    const candidateDurationMs = frame.nowMs - this.candidateSinceMs;

    if (playbackGate && this.isLikelyPlaybackEcho(frame, vadScore, rms, candidateDurationMs)) {
      void this.saveOutcome(frame, vadScore, rms, candidateDurationMs, "echo_rejected");
      this.logEchoRejected(frame.nowMs, candidateDurationMs);
      return { type: "none" };
    }

    if (!this.capturing && candidateDurationMs >= sustainedMs) {
      this.capturing = true;
      this.speechStartedAtMs = this.candidateSinceMs;
      void this.saveOutcome(frame, vadScore, rms, candidateDurationMs, "accepted");
      return { type: "speech_start", bargeIn: playbackGate };
    }

    return { type: "none" };
  }

  reset(): void {
    this.candidateSinceMs = 0;
    this.speechStartedAtMs = 0;
    this.silenceSinceMs = 0;
    this.capturing = false;
    this.lastFeatures = null;
  }

  lastFeatureRecord(): VadFeatureRecord | null {
    return this.lastFeatures;
  }

  private isLikelyPlaybackEcho(
    frame: VadFrame,
    vadScore: number,
    rms: number,
    candidateDurationMs: number,
  ): boolean {
    if (frame.nowMs - frame.playbackStartedAtMs < OUTPUT_START_GRACE_MS) {
      return true;
    }
    if (candidateDurationMs < PLAYBACK_SUSTAINED_MS) {
      return true;
    }
    const playbackEnergy = Math.max(0.001, frame.playbackEnergy);
    const envelopeMismatch = rms > Math.max(PLAYBACK_RMS_THRESHOLD, playbackEnergy * 0.34);
    const clearSpeech = vadScore >= 0.9 && envelopeMismatch;
    return !clearSpeech;
  }

  private logEchoRejected(nowMs: number, candidateDurationMs: number): void {
    if (nowMs - this.lastEchoLoggedAtMs < ECHO_LOG_INTERVAL_MS) {
      return;
    }
    this.lastEchoLoggedAtMs = nowMs;
    this.recordEvent?.({
      event: "voice.echo_rejected",
      stage: "browser",
      latency_ms: Math.round(candidateDurationMs),
    });
  }

  private async saveOutcome(
    frame: VadFrame,
    vadScore: number,
    rms: number,
    candidateDurationMs: number,
    outcome: VadOutcome,
  ): Promise<void> {
    const record: VadFeatureRecord = {
      ts: frame.nowMs,
      deviceHash: this.deviceHash,
      vadScore: round(vadScore),
      rms: round(rms),
      playbackEnergy: round(frame.playbackEnergy),
      candidateDurationMs: Math.round(candidateDurationMs),
      outcome,
    };
    this.lastFeatures = record;
    await this.store.save(record);
  }
}

export async function hashMediaDevice(stream: MediaStream): Promise<string> {
  const settings = stream.getAudioTracks()[0]?.getSettings();
  const input = JSON.stringify({
    channelCount: settings?.channelCount ?? 0,
    sampleRate: settings?.sampleRate ?? 0,
    sampleSize: settings?.sampleSize ?? 0,
    deviceId: settings?.deviceId ? "present" : "none",
  });
  if (typeof crypto === "undefined" || crypto.subtle === undefined) {
    return "device:unknown";
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export async function estimatePlaybackEnergy(blob: Blob): Promise<number> {
  const buffer = await blob.arrayBuffer();
  if (buffer.byteLength <= 44) {
    return 0.08;
  }
  const view = new DataView(buffer);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    return 0.08;
  }
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === "data") {
      let sum = 0;
      let count = 0;
      for (let i = offset + 8; i + 1 < offset + 8 + chunkSize; i += 2) {
        const sample = view.getInt16(i, true) / 0x8000;
        sum += sample * sample;
        count += 1;
      }
      return count > 0 ? Math.max(0.001, Math.sqrt(sum / count)) : 0.08;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return 0.08;
}

function frameRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }
  return samples.length > 0 ? Math.sqrt(sum / samples.length) : 0;
}

function estimateVadScore(samples: Float32Array, rms: number): number {
  if (samples.length === 0) {
    return 0;
  }
  let crossings = 0;
  let prev = samples[0];
  for (let i = 1; i < samples.length; i += 1) {
    const current = samples[i];
    if ((prev < 0 && current >= 0) || (prev >= 0 && current < 0)) {
      crossings += 1;
    }
    prev = current;
  }
  const zcr = crossings / samples.length;
  const energyScore = clamp((rms - 0.006) / 0.045, 0, 1);
  const speechBandScore = clamp(1 - Math.abs(zcr - 0.08) / 0.12, 0, 1);
  return round(clamp(energyScore * 0.74 + speechBandScore * 0.26, 0, 1));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "ts" });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("vad db open failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

function txDone(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  apply: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("vad db transaction failed"));
    apply(transaction.objectStore(STORE_NAME));
  });
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
