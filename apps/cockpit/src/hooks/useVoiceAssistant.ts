import { useCallback, useEffect, useRef, useState } from "react";
import {
  audioBlobToPcm16kBase64,
  generateTurnId,
  recordVoiceEvent,
  type MiniCpmContent,
  type MiniCpmMessage,
} from "../lib/minicpmVoiceClient";
import { micSupported, requestMicrophoneStream } from "../lib/microphone";
import {
  PcmStreamingPlayer,
  estimatePcmEnergy,
  type PcmAudioChunk,
} from "../lib/pcmStreamingPlayer";
import {
  MIN_SPEECH_MS,
  SILENCE_MS,
  SYSTEM_PROMPT,
  WAKE_WORDS,
  isAbortError,
  preferredAudioType,
  stripWakeWord,
} from "../lib/voiceAssistantConfig";
import { runVoiceTurn } from "../lib/voiceAssistantTurn";
import type { VoiceAssistantApi, VoiceState } from "../lib/voiceAssistantTypes";
import {
  BrowserVadController,
  hashMediaDevice,
} from "../lib/browserVad";

export { stripWakeWord };
export type { VoiceAssistantApi, VoiceState };

// Always-listening, privacy-first voice assistant. The mic runs continuously in
// the browser; a lightweight energy VAD segments speech; each utterance is sent
// to jmcp-talk's same-origin local voice gateway while the widget is active. No audio
// or text leaves the machine. Barge-in cancels old reasoning, queued audio, and
// current playback the moment you start talking again.

export function useVoiceAssistant(): VoiceAssistantApi {
  const supported = micSupported();
  const [state, setState] = useState<VoiceState>("off");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef<VoiceState>("off");
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRef = useRef<BrowserVadController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const playerRef = useRef<PcmStreamingPlayer | null>(null);
  const playbackRef = useRef({ active: false, startedAtMs: 0, energy: 0 });
  const historyRef = useRef<MiniCpmMessage[]>([{ role: "system", content: SYSTEM_PROMPT }]);
  const turnAbortRef = useRef<AbortController | null>(null);
  const turnIdRef = useRef<string | null>(null);
  const captureTurnIdRef = useRef<string | null>(null);
  const capturingRef = useRef<boolean>(false);

  const setBoth = useCallback((next: VoiceState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const abortActiveWork = useCallback(() => {
    turnAbortRef.current?.abort();
    turnAbortRef.current = null;
    turnIdRef.current = null;
  }, []);

  const cancelPlayback = useCallback((eventName?: "voice.barge_in") => {
    const activeTurnId = turnIdRef.current;
    abortActiveWork();
    playerRef.current?.abort();
    playbackRef.current = { active: false, startedAtMs: 0, energy: 0 };
    if (eventName !== undefined && activeTurnId !== null) {
      void recordVoiceEvent({
        turn_id: activeTurnId,
        event: eventName,
        stage: "browser",
      });
    }
  }, [abortActiveWork]);

  const ensurePlayer = useCallback((): PcmStreamingPlayer => {
    if (playerRef.current !== null) return playerRef.current;
    playerRef.current = new PcmStreamingPlayer({
      getTurnId: () => turnIdRef.current,
      onPlaybackStart: (chunk) => {
        playbackRef.current = {
          active: true,
          startedAtMs: Date.now(),
          energy: estimatePcmEnergy(chunk.pcm),
        };
        setBoth("speaking");
      },
      onPlaybackIdle: () => {
        playbackRef.current = { active: false, startedAtMs: 0, energy: 0 };
        if (stateRef.current === "speaking") {
          setBoth(streamRef.current === null ? "off" : "listening");
        }
        turnIdRef.current = null;
      },
      onPlaybackEnergy: (energy) => {
        playbackRef.current = { ...playbackRef.current, energy };
      },
    });
    return playerRef.current;
  }, [setBoth]);

  const enqueueAudio = useCallback((audio: PcmAudioChunk, signal?: AbortSignal) => {
    if (signal?.aborted || stateRef.current === "off") return;
    const player = ensurePlayer();
    void player.enqueue(audio).catch((err: unknown) => {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : "audio playback failed");
      }
    });
  }, [ensurePlayer]);

  const runCommand = useCallback(async (
    command: string,
    inputContent?: MiniCpmContent[],
    providedTurnId?: string,
  ) => {
    abortActiveWork();
    const turnId = providedTurnId ?? generateTurnId();
    const turnAbort = new AbortController();
    turnAbortRef.current = turnAbort;
    turnIdRef.current = turnId;
    setBoth("thinking");
    setReply("");
    playerRef.current?.clear();
    try {
      await recordVoiceEvent({
        turn_id: turnId,
        event: "voice.upload",
        stage: inputContent === undefined ? "text" : "audio",
        bytes: inputContent === undefined ? command.length : contentBytes(inputContent),
        text: inputContent === undefined ? command : undefined,
      });
      const lastText = await runVoiceTurn({
        turnId,
        command,
        history: historyRef.current,
        signal: turnAbort.signal,
        inputContent,
        enqueueAudio,
        onDelta: (delta) => setReply((current) => current + delta),
        setThinking: () => setBoth("thinking"),
      });
      setReply(lastText);
      if (lastText.length === 0) {
        setError("The local voice gateway returned an empty voice turn.");
      }
    } catch (err) {
      if (turnAbort.signal.aborted || isAbortError(err)) {
        return;
      }
      setError(err instanceof Error ? err.message : "reasoning failed");
      setBoth(streamRef.current === null ? "off" : "listening");
    } finally {
      if (turnAbortRef.current === turnAbort) {
        turnAbortRef.current = null;
        if (stateRef.current !== "speaking" && !(playerRef.current?.hasPending() ?? false)) {
          turnIdRef.current = null;
        }
      }
      const playbackPending = playerRef.current?.hasPending() ?? false;
      if (stateRef.current === "thinking" && !playbackPending) {
        setBoth(streamRef.current === null ? "off" : "listening");
        turnIdRef.current = null;
      }
    }
  }, [abortActiveWork, enqueueAudio, setBoth]);

  const handleUtterance = useCallback(async (blob: Blob) => {
    if (stateRef.current === "off") return;
    setBoth("transcribing");
    const turnId = captureTurnIdRef.current ?? generateTurnId();
    captureTurnIdRef.current = null;
    try {
      const audioHash = await sha256Blob(blob);
      await recordVoiceEvent({
        turn_id: turnId,
        event: "voice.vad_segment",
        stage: "browser",
        bytes: blob.size,
        audio_hash: audioHash,
      });
      const data = await audioBlobToPcm16kBase64(blob);
      setTranscript("Voice turn");
      await runCommand("", [{ type: "audio", data }], turnId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "audio preparation failed");
      setBoth("listening");
      return;
    }
  }, [runCommand, setBoth]);

  // Run a typed command through the same local voice session path as a spoken turn.
  // Lets the agent be tested and used without a microphone.
  const sendText = useCallback(async (text: string) => {
    const clean = text.trim();
    if (clean.length === 0) return;
    if (stateRef.current === "transcribing" || stateRef.current === "thinking") return;
    setError(null);
    setTranscript(clean);
    await runCommand(clean);
  }, [runCommand]);

  const beginCapture = useCallback((bargeIn: boolean) => {
    const stream = streamRef.current;
    if (!stream) return;
    const turnId = generateTurnId();
    captureTurnIdRef.current = turnId;
    if (bargeIn) {
      cancelPlayback("voice.barge_in");
      setBoth("listening");
    }
    void recordVoiceEvent({ turn_id: turnId, event: "voice.mic_start", stage: "browser" });
    chunksRef.current = [];
    const audioType = preferredAudioType();
    const recorder =
      audioType.kind === "browser_default"
        ? new MediaRecorder(stream)
        : new MediaRecorder(stream, { mimeType: audioType.mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      void handleUtterance(blob);
    };
    recorder.start();
    capturingRef.current = true;
  }, [cancelPlayback, handleUtterance, setBoth]);

  const endCapture = useCallback((durationMs: number) => {
    const recorder = recorderRef.current;
    capturingRef.current = false;
    if (!recorder) return;
    if (durationMs < MIN_SPEECH_MS) {
      captureTurnIdRef.current = null;
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
      recorderRef.current = null;
      return;
    }
    const turnId = captureTurnIdRef.current;
    if (turnId !== null) {
      void recordVoiceEvent({
        turn_id: turnId,
        event: "voice.mic_stop",
        stage: "browser",
        latency_ms: Math.round(durationMs),
      });
    }
    try {
      recorder.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cancelPlayback();
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
      recorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      void ctxRef.current.close();
      ctxRef.current = null;
    }
    if (playerRef.current) {
      void playerRef.current.close();
      playerRef.current = null;
    }
    analyserRef.current = null;
    vadRef.current?.reset();
    vadRef.current = null;
    capturingRef.current = false;
    setBoth("off");
  }, [cancelPlayback, setBoth]);

  const start = useCallback(async () => {
    if (!supported || stateRef.current !== "off") return;
    setError(null);
    let stream: MediaStream | null = null;
    try {
      stream = await requestMicrophoneStream();
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      const deviceHash = await hashMediaDevice(stream);
      vadRef.current = new BrowserVadController({
        minSpeechMs: MIN_SPEECH_MS,
        silenceMs: SILENCE_MS,
        deviceHash,
        recordEvent: (event) => {
          const turnId = turnIdRef.current ?? captureTurnIdRef.current ?? generateTurnId();
          void recordVoiceEvent({ turn_id: turnId, ...event });
        },
      });
      const buffer = new Float32Array(analyser.fftSize);
      setBoth("listening");

      timerRef.current = window.setInterval(() => {
        const node = analyserRef.current;
        const vad = vadRef.current;
        if (!node) return;
        node.getFloatTimeDomainData(buffer);
        if (!vad) return;
        const now = Date.now();
        const decision = vad.acceptFrame({
          samples: buffer,
          nowMs: now,
          voiceState: stateRef.current,
          playbackActive: playbackRef.current.active,
          playbackStartedAtMs: playbackRef.current.startedAtMs,
          playbackEnergy: playbackRef.current.energy,
        });

        if (decision.type === "speech_start" && !capturingRef.current) {
          beginCapture(decision.bargeIn);
        } else if (decision.type === "speech_end" && capturingRef.current) {
          endCapture(decision.durationMs);
        }
      }, 32);
    } catch (err) {
      if (stream !== null) {
        stream.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = null;
      setError(err instanceof Error ? err.message : "microphone permission denied");
      setBoth("error");
    }
  }, [beginCapture, endCapture, setBoth, supported]);

  useEffect(() => stop, [stop]);

  return {
    state,
    supported,
    transcript,
    reply,
    error,
    wakeWords: WAKE_WORDS,
    start,
    stop,
    sendText,
  };
}

async function sha256Blob(blob: Blob): Promise<string> {
  if (typeof crypto === "undefined" || crypto.subtle === undefined) {
    return "";
  }
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function contentBytes(content: MiniCpmContent[] | undefined): number {
  if (content === undefined) {
    return 0;
  }
  let total = 0;
  for (const item of content) {
    if (item.type === "audio") {
      total += item.data.length;
    } else {
      total += item.text.length;
    }
  }
  return total;
}
