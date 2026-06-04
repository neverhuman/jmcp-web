export type ViewId =
  | "now"
  | "work"
  | "evidence"
  | "systems"
  | "universe"
  | "memory"
  | "voice-text"
  | "replay"
  | "approvals";

export type Health = "nominal" | "watch" | "blocked" | "degraded";
export type Risk = "low" | "medium" | "high";
export type AttentionLevel =
  | "silent"
  | "digest"
  | "heads-up"
  | "decision"
  | "urgent"
  | "incident";
export type VoiceState =
  | "started"
  | "transcribed"
  | "intent_detected"
  | "confirmation_requested"
  | "confirmed"
  | "denied"
  | "ended";
export type MemoryState = "shadow" | "proposed" | "quarantined" | "promoted" | "revoked";
export type ScoreFreshness = "fresh" | "cached" | "unscored" | "outdated";

export interface ViewDefinition {
  id: ViewId;
  label: string;
  description: string;
}

export interface WorkItem {
  id: string;
  title: string;
  owner: string;
  state: string;
  risk: Risk;
  lease: string;
  updated: string;
  evidence: number;
  repo?: string;
  branch?: string;
}

export interface EvidenceBundle {
  id: string;
  subject: string;
  source: string;
  status: "accepted" | "pending" | "rejected";
  hash: string;
  age: string;
}
