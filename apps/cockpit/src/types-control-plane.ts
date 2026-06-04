import type { Health } from "./types-core";

export interface ControlPlaneEventBusStatus {
  appendOnly: boolean;
  streamUrl: string;
  sources: string[];
}

export interface ControlPlaneRepoStatus {
  name: string;
  health: Health;
  currentVersion: string;
  lastSuccessfulMainCi?: string | null;
  lastBinary?: string | null;
  lastTests?: string | null;
  latestChangedFiles: string[];
  activeWorkcells: number;
  overdueActivity: boolean;
  stuckActivity: boolean;
  failingAudit: boolean;
  auditReason?: string | null;
  rerunCommand: string;
}

export interface ControlPlaneWorkcell {
  id: string;
  repo: string;
  agent: string;
  task: string;
  status: string;
  allowedSlice: string[];
  persistence: string;
  pty: string;
  updatedAt: string;
  overdue: boolean;
  stuck: boolean;
  rerunCommand: string;
}

export interface ControlPlaneAuditLane {
  repo: string;
  lane: string;
  health: Health;
  reason: string;
  latestEvidence?: string | null;
  rerunCommand: string;
}

export interface ControlPlanePolicy {
  sandboxRequired: boolean;
  directPersistenceAllowed: boolean;
  prExportRequired: boolean;
  ptyDefault: string;
  findingCount: number;
}

export interface ControlPlaneVersioning {
  current: string;
  recommended: string;
  impact: string;
  reason: string;
  releaseCompatible: boolean;
  rollbackCompatible: boolean;
}

export interface ControlPlaneStream {
  name: string;
  url: string;
  stdoutStderr: boolean;
  ptyInput: boolean;
  interactiveOnly: boolean;
}

export interface ControlPlaneSummary {
  generatedAt: string;
  eventWatermark: number;
  eventBus: ControlPlaneEventBusStatus;
  repos: ControlPlaneRepoStatus[];
  activeWorkcells: ControlPlaneWorkcell[];
  auditLanes: ControlPlaneAuditLane[];
  policy: ControlPlanePolicy;
  versioning: ControlPlaneVersioning;
  streams: ControlPlaneStream[];
}
