import type { VoiceState } from "./types-core";

export interface VoiceTextThread {
  id: string;
  channel: "voice" | "text";
  speaker: string;
  title: string;
  state: VoiceState | "draft";
  confidence: number;
  transcript: string;
  intent: string;
  confirmationPhrase?: string;
  requiresResponse: boolean;
  decisionOptions: string[];
  updated: string;
  sourceRef: string;
}
