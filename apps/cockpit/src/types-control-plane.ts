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

export type RuntimeSourceState = "live" | "degraded";

export interface RuntimeSourceStatus {
  key: string;
  label: string;
  state: RuntimeSourceState;
  reason?: string;
}

export interface AgentSummary {
  agentId: string;
  lastSeq: number;
  backlogLen: number;
}

export type AgentSessionStatus =
  | "starting"
  | "running"
  | "idle"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentSessionSummary {
  id: string;
  sessionKey: string;
  provider: string;
  subject?: string | null;
  status: AgentSessionStatus;
  processKey?: string | null;
  streamUri?: string | null;
  startedAt: string;
  updatedAt: string;
}

export type ProcessObservationStatus =
  | "starting"
  | "running"
  | "idle"
  | "stuck"
  | "completed"
  | "failed"
  | "cancelled";

export interface ProcessObservationSummary {
  id: string;
  processKey: string;
  command?: string | null;
  status: ProcessObservationStatus;
  pty?: string | null;
  stuck: boolean;
  diagnosticClass?: string | null;
  startedAt?: string | null;
  updatedAt: string;
}

export type IncidentSeverity = "info" | "warning" | "major" | "critical";
export type IncidentState = "open" | "investigating" | "quarantined" | "mitigated" | "closed";

export interface RuntimeIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  state: IncidentState;
  quarantineScope: string;
  containment: string;
  relatedWorkOrders: string[];
  notes: string[];
  openedAt: string;
  updatedAt: string;
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
