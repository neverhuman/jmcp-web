import type { AttentionLevel, Risk } from "./types-core";

export interface AttentionAlternative {
  id: string;
  label: string;
  effect: string;
  risk: Risk;
}

export interface DrilldownRef {
  label: string;
  target: string;
  kind?: string;
}

export interface RiskDelta {
  from: Risk;
  to: Risk;
  note: string;
}

export interface AttentionIncident {
  id: string;
  title: string;
  severity: Risk;
  summary: string;
  quarantine: string;
  drilldown: string[];
}

export interface AttentionPacket {
  id: string;
  workOrderId: string;
  attentionLevel: AttentionLevel;
  modality: "text" | "voice" | "ui-card" | "notification" | "api";
  summary: string;
  whyNow: string;
  recommendation: string;
  decisionNeeded: boolean;
  alternatives: AttentionAlternative[];
  riskDelta: RiskDelta;
  drilldown: DrilldownRef[];
  expires: string;
  incident?: AttentionIncident;
}
