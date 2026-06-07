import { useEffect } from "react";
import { Mic, MicOff, Loader2, Volume2, Brain, Ear } from "lucide-react";
import { useVoiceAssistant, type VoiceState } from "../hooks/useVoiceAssistant";
import "../voice-assistant.css";

// A floating, always-listening voice widget for the local on-box assistant.
// Mounted only on the standalone cockpit (main.tsx), so it never affects the
// shared <App/> that the web proof-host screenshots.

const LABELS: Record<VoiceState, string> = {
  off: "Voice muted",
  listening: "Voice listening",
  armed: "Voice listening",
  transcribing: "Voice transcribing",
  thinking: "Voice thinking",
  speaking: "Voice speaking",
  error: "Voice error",
};

function StateIcon({ state }: { state: VoiceState }) {
  if (state === "listening") return <Ear size={16} aria-hidden />;
  if (state === "armed") return <Mic size={16} aria-hidden />;
  if (state === "transcribing") return <Loader2 size={16} className="spin" aria-hidden />;
  if (state === "thinking") return <Brain size={16} aria-hidden />;
  if (state === "speaking") return <Volume2 size={16} aria-hidden />;
  return <MicOff size={16} aria-hidden />;
}

export default function VoiceAssistant() {
  const voice = useVoiceAssistant();
  const active = voice.state !== "off" && voice.state !== "error";

  useEffect(() => {
    if (!voice.supported || voice.state !== "off") {
      return;
    }
    let cancelled = false;
    if (typeof navigator.permissions?.query !== "function") {
      return;
    }
    void navigator.permissions
      .query({ name: "microphone" })
      .then((permission) => {
        if (!cancelled && permission.state === "granted") {
          void voice.start();
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [voice.supported, voice.state, voice.start]);

  const label =
    voice.state === "error" && voice.error
      ? `${LABELS.error}: ${voice.error}`
      : active
        ? `${LABELS[voice.state]}. Mute voice assistant`
        : "Start voice assistant";

  return (
    <aside className="voice-assistant" data-voice-state={voice.state} aria-live="polite">
      {voice.supported ? (
        <button
          type="button"
          className={active ? "voice-toggle active" : "voice-toggle"}
          aria-pressed={active}
          aria-label={label}
          title={label}
          onClick={() => (active ? voice.stop() : void voice.start())}
        >
          <StateIcon state={voice.state} />
          <span className="voice-status-dot" aria-hidden="true" />
        </button>
      ) : (
        <span className="voice-toggle unavailable" aria-disabled="true" aria-label="Voice unavailable" role="status" title="Voice unavailable">
          <MicOff size={16} aria-hidden />
          <span className="voice-status-dot" aria-hidden="true" />
        </span>
      )}
    </aside>
  );
}
