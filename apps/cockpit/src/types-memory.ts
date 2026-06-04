import type { MemoryState } from "./types-core";

export interface MemoryIncident {
  title: string;
  summary: string;
  quarantine: string;
  drilldown: string[];
}

export interface MemoryPromotion {
  status: string;
  gate: string;
  reviewedBy?: string;
  promotedAt?: string;
}

export interface MemoryProposal {
  id: string;
  scope: string;
  claim: string;
  state: MemoryState;
  confidence: number;
  retention: string;
  expiry: string;
  promotion: MemoryPromotion;
  counterexamples: string[];
  source: string;
  rollback: string;
  incident?: MemoryIncident;
}
