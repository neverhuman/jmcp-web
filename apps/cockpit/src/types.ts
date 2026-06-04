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
export type AttentionLevel = "silent" | "digest" | "heads-up" | "decision" | "urgent" | "incident";
export type VoiceState = "started" | "transcribed" | "intent_detected" | "confirmation_requested" | "confirmed" | "denied" | "ended";
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

export interface SystemIncident {
  title: string;
  summary: string;
  quarantine: string;
  drilldown: string[];
}

export interface SystemNode {
  name: string;
  role: string;
  health: Health;
  jcp: string;
  latency: string;
  incident?: SystemIncident;
}

export interface ToolAsset {
  name: string;
  className: string;
  conformance: string;
  sideEffects: string;
  dataClasses: string[];
  repo?: string;
  provider?: string;
  health?: Health;
  dependsOn?: string[];
  queue?: number;
}

export interface UniverseSlice {
  name: string;
  live: boolean;
  coverage: number;
  degradedReason?: string;
}

export interface UniverseActiveRepo {
  repo: string;
  toolCount: number;
  score: number;
  health: Health;
}

export interface UniverseRepoScore {
  repo: string;
  toolCount: number;
  score: number;
  coverage: number;
  currentTask: string;
  branch: string;
  pool: string;
  placement: string;
  health: Health;
  degradedReason?: string;
}

export interface UniversePlacement {
  agent: string;
  repo: string;
  currentTask: string;
  branch: string;
  pool: string;
  placement: string;
  score: number;
  health: Health;
  degradedReason?: string;
}

export interface UniverseBootstrapTui {
  live: boolean;
  observedCoverage: number;
  activeRepos: UniverseActiveRepo[];
  repoScores: UniverseRepoScore[];
  placements: UniversePlacement[];
  degradedSlices: UniverseSlice[];
  degradedReason?: string;
}

export interface UniverseSnapshot {
  live: boolean;
  bootstrapTui: UniverseBootstrapTui;
  ecosystem: {
    tools: ToolAsset[];
    live: boolean;
    degradedReason?: string;
  };
}

export interface FleetBoardError {
  path: string;
  error: string;
}

export interface FleetBoardTotals {
  repoCount: number;
  audited: number;
  failed: number;
  minScore?: number | null;
  maxScore?: number | null;
  averageScore?: number | null;
  totalHardFindings: number;
  belowThreshold: number;
}

export interface FleetBoardRepo {
  name: string;
  path: string;
  branch?: string | null;
  host?: string | null;
  dirty?: number | null;
  dirtyFiles?: number | null;
  lastCommitSha?: string | null;
  headSha?: string | null;
  lastCommitWhen?: string | null;
  lastCommitEpoch?: number | null;
  lastBinaryEpoch?: number | null;
  lastTestsEpoch?: number | null;
  version?: string | null;
  ciConfigured: boolean;
  score?: number | null;
  raw?: number | null;
  caps: string[];
  capsCount?: number | null;
  hardFindings?: number | null;
  hlLevel?: string | null;
  scoreSource?: string | null;
  scoreFreshness: ScoreFreshness;
  activeRunnerCount: number;
  runnerBusy: boolean;
  runnerHint?: string | null;
  mainCiAgeSeconds?: number | null;
  jeryuGate: string;
  artifactState: {
    local: string;
    devCanary: string;
    prod: string;
    release: string;
    promote: string;
    latestSha?: string | null;
  };
  topFindings: string[];
  topToolOpportunities: string[];
}

export interface FleetBoardSnapshot {
  generatedAtNote: string;
  schema: string;
  repos: FleetBoardRepo[];
  totals: FleetBoardTotals;
  errors: FleetBoardError[];
}

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

export interface ReplayEvent {
  sequence: number;
  subject: string;
  family: string;
  timestamp: string;
  producer: string;
}

export interface ApprovalRequest {
  id: string;
  workOrderId: string;
  challengeId: string;
  channel: string;
  state: string;
  decision: string;
  reason: string;
  risk: Risk;
  expires: string;
  approver: string;
  tokenHash: string;
  targetUserId?: number;
  targetChatId?: number;
  workOrderTitle: string;
  workOrderState: string;
  workOrderOwner: string;
  currentTask: string;
  branch: string;
  pool: string;
  placement: string;
  voiceThreadId?: string;
  voiceThreadState?: string;
  voiceTranscript?: string;
  voiceConfirmationPhrase?: string;
  lineage: string[];
}
