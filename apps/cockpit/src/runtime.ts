import {
  attentionPackets,
  approvalRequests,
  controlPlane,
  evidenceBundles,
  fleetBoard,
  memoryLessons,
  replayEvents,
  systems,
  toolAssets,
  voiceTextThreads,
  workItems,
} from "./fixtures";
import {
  isAdapters,
  isApprovalArray,
  isApprovalChallengeArray,
  isAttentionPacketArray,
  isControlPlane,
  isEcosystem,
  isEventBatch,
  isEvidenceArray,
  isFleetBoard,
  isHealthResponse,
  isMemoryProposalArray,
  isReplay,
  isSystemArray,
  isUniverse,
  isVoiceThreadArray,
  isWorkOrderArray,
  type ApiAdapters,
  type ApiControlPlane,
  type ApiApproval,
  type ApiApprovalChallenge,
  type ApiAttentionPacket,
  type ApiEcosystem,
  type ApiEvidence,
  type ApiFleetBoard,
  type ApiMemoryProposal,
  type ApiReplay,
  type ApiUniverse,
  type ApiVoiceThread,
  type ApiWorkOrder,
} from "./runtime-api";
import {
  mapAdapters,
  mapApproval,
  mapApprovalChallenge,
  mapAttentionPacket,
  mapEvidence,
  mapMemoryProposal,
  mapReplay,
  mapUniverse,
  mapVoiceThread,
  mapWorkOrder,
} from "./runtime-mappers";
import type {
  ApprovalRequest,
  AttentionPacket,
  EvidenceBundle,
  Health,
  MemoryProposal,
  ReplayEvent,
  SystemNode,
  UniverseActiveRepo,
  UniverseBootstrapTui,
  UniversePlacement,
  UniverseRepoScore,
  UniverseSlice,
  UniverseSnapshot,
  ToolAsset,
  VoiceTextThread,
  WorkItem,
  RuntimeSourceStatus,
  ControlPlaneSummary,
  FleetBoardSnapshot,
  AgentSummary,
  AgentSessionSummary,
  ProcessObservationSummary,
  RuntimeIncident,
} from "./types";

import { createDegradedEcosystem, createFixtureUniverse, createRuntimeUniverse, getJson } from "./runtime-helpers";

type SettledSource = PromiseSettledResult<unknown>;

const runtimeSourceCatalog: Array<{ key: string; label: string }> = [
  { key: "health", label: "health" },
  { key: "work-orders", label: "work orders" },
  { key: "evidence", label: "evidence" },
  { key: "systems", label: "systems" },
  { key: "attention", label: "attention" },
  { key: "voice-text", label: "voice/text" },
  { key: "memory", label: "memory" },
  { key: "replay", label: "replay" },
  { key: "approvals", label: "approvals" },
  { key: "approval-challenges", label: "approval challenges" },
  { key: "adapters", label: "adapters" },
  { key: "ecosystem", label: "Jeryu ecosystem" },
  { key: "universe", label: "universe" },
  { key: "fleet-board", label: "fleet board" },
  { key: "control-plane", label: "control plane" },
  { key: "agents", label: "agent bus" },
  { key: "agent-sessions", label: "agent sessions" },
  { key: "process-observations", label: "process observations" },
  { key: "incidents", label: "incidents" },
];

export type RuntimeState = {
  apiHealth: Health;
  sourceStatuses: RuntimeSourceStatus[];
  workItems: WorkItem[];
  evidenceBundles: EvidenceBundle[];
  systems: SystemNode[];
  toolAssets: ToolAsset[];
  universe: UniverseSnapshot;
  fleetBoard: FleetBoardSnapshot;
  agents: AgentSummary[];
  agentSessions: AgentSessionSummary[];
  processObservations: ProcessObservationSummary[];
  incidents: RuntimeIncident[];
  controlPlane: ControlPlaneSummary;
  attentionPackets: AttentionPacket[];
  voiceThreads: VoiceTextThread[];
  memoryLessons: MemoryProposal[];
  replayEvents: ReplayEvent[];
  approvalRequests: ApprovalRequest[];
  ecosystemLive: boolean;
  ecosystemDegradedReason: string;
  loadedAt: string;
  usingFixtures: boolean;
};

export function createFixtureRuntime(): RuntimeState {
  return {
    apiHealth: "degraded",
    sourceStatuses: degradedSourceStatuses("fixture data"),
    workItems,
    evidenceBundles,
    systems,
    toolAssets,
    universe: createFixtureUniverse(),
    fleetBoard,
    agents: [],
    agentSessions: [],
    processObservations: [],
    incidents: [],
    controlPlane,
    attentionPackets,
    voiceThreads: voiceTextThreads,
    memoryLessons,
    replayEvents,
    approvalRequests,
    ecosystemLive: false,
    ecosystemDegradedReason: "fixture data",
    loadedAt: "fixture",
    usingFixtures: true,
  };
}

export async function loadRuntime(): Promise<RuntimeState> {
  if (typeof fetch !== "function") {
    return createFixtureRuntime();
  }

  const [
    health,
    apiWork,
    apiEvidence,
    apiSystems,
    apiAttention,
    apiVoiceText,
    apiMemory,
    apiReplay,
    apiApprovals,
    apiApprovalChallenges,
    apiAdapters,
    apiEcosystem,
    apiUniverse,
    apiFleetBoard,
    apiControlPlane,
  ] = await Promise.allSettled([
    getJson<{ ok: boolean }>("/health", isHealthResponse),
    getJson<ApiWorkOrder[]>("/work-orders", isWorkOrderArray),
    getJson<ApiEvidence[]>("/evidence", isEvidenceArray),
    getJson<SystemNode[]>("/systems", isSystemArray),
    getJson<ApiAttentionPacket[]>("/attention", isAttentionPacketArray),
    getJson<ApiVoiceThread[]>("/voice-text", isVoiceThreadArray),
    getJson<ApiMemoryProposal[]>("/memory", isMemoryProposalArray),
    getJson<ApiReplay>("/replay", isReplay),
    getJson<ApiApproval[]>("/approvals", isApprovalArray),
    getJson<ApiApprovalChallenge[]>("/approval-challenges", isApprovalChallengeArray),
    getJson<ApiAdapters>("/adapters", isAdapters),
    getJson<ApiEcosystem>("/ecosystem", isEcosystem),
    getJson<ApiUniverse>("/universe", isUniverse),
    getJson<ApiFleetBoard>("/fleet-board", isFleetBoard),
    getJson<ApiControlPlane>("/control-plane", isControlPlane),
  ]);

  const allFailed = [
    health,
    apiWork,
    apiEvidence,
    apiSystems,
    apiAttention,
    apiVoiceText,
    apiMemory,
    apiReplay,
    apiApprovals,
    apiApprovalChallenges,
    apiAdapters,
    apiEcosystem,
    apiUniverse,
    apiFleetBoard,
    apiControlPlane,
  ].every((result) => result.status === "rejected");
  if (allFailed) {
    return createFixtureRuntime();
  }

  const liveWork = apiWork.status === "fulfilled" ? apiWork.value.map(mapWorkOrder) : workItems;
  const liveEvidence = apiEvidence.status === "fulfilled" ? apiEvidence.value.map(mapEvidence) : evidenceBundles;
  const liveSystems = apiSystems.status === "fulfilled" ? apiSystems.value : systems;
  const liveAttention = apiAttention.status === "fulfilled" ? apiAttention.value.map(mapAttentionPacket) : attentionPackets;
  const liveVoiceText = apiVoiceText.status === "fulfilled" ? apiVoiceText.value.map(mapVoiceThread) : voiceTextThreads;
  const liveMemory = apiMemory.status === "fulfilled" ? apiMemory.value.map(mapMemoryProposal) : memoryLessons;
  const liveReplay = apiReplay.status === "fulfilled" ? mapReplay(apiReplay.value) : replayEvents;
  const liveUniverse =
    apiUniverse.status === "fulfilled"
      ? mapUniverse(apiUniverse.value)
      : createRuntimeUniverse({
          systems: liveSystems,
          workItems: liveWork,
          toolAssets: apiEcosystem.status === "fulfilled" ? apiEcosystem.value.tools : apiAdapters.status === "fulfilled" ? mapAdapters(apiAdapters.value) : toolAssets,
          ecosystem: apiEcosystem.status === "fulfilled" ? apiEcosystem.value : createDegradedEcosystem(apiAdapters.status === "rejected" ? "Jeryu ecosystem endpoint unavailable" : "Jeryu ecosystem unavailable"),
        });
  const workOrderById = new Map(liveWork.map((item) => [item.id, item]));
  const approvalByWorkOrderId = new Map(
    apiApprovals.status === "fulfilled" ? apiApprovals.value.map((approval) => [approval.work_order_id, approval]) : [],
  );
  const voiceByApprover = new Map(liveVoiceText.map((thread) => [thread.speaker, thread]));
  const liveApprovals =
    apiApprovalChallenges.status === "fulfilled"
      ? apiApprovalChallenges.value.map((challenge) =>
          mapApprovalChallenge(challenge, {
            workOrder: workOrderById.get(challenge.work_order_id),
            approval: approvalByWorkOrderId.get(challenge.work_order_id),
            voiceThread: voiceByApprover.get(challenge.approver),
          }),
        )
      : apiApprovals.status === "fulfilled"
        ? apiApprovals.value.map(mapApproval)
        : approvalRequests;
  const liveTools = liveUniverse.ecosystem.tools.length > 0 ? liveUniverse.ecosystem.tools : apiAdapters.status === "fulfilled" ? mapAdapters(apiAdapters.value) : toolAssets;
  const ecosystemLive = liveUniverse.ecosystem.live;
  const ecosystemDegradedReason = liveUniverse.ecosystem.degradedReason ?? "Jeryu ecosystem unavailable";
  const partialFailure = [
    health,
    apiWork,
    apiEvidence,
    apiSystems,
    apiAttention,
    apiVoiceText,
    apiMemory,
    apiReplay,
    apiApprovals,
    apiApprovalChallenges,
    apiAdapters,
    apiEcosystem,
    apiUniverse,
    apiFleetBoard,
    apiControlPlane,
  ].some((result) => result.status === "rejected");
  const sourceStatuses = [
    sourceStatus("health", "health", health),
    sourceStatus("work-orders", "work orders", apiWork),
    sourceStatus("evidence", "evidence", apiEvidence),
    sourceStatus("systems", "systems", apiSystems),
    sourceStatus("attention", "attention", apiAttention),
    sourceStatus("voice-text", "voice/text", apiVoiceText),
    sourceStatus("memory", "memory", apiMemory),
    sourceStatus("replay", "replay", apiReplay),
    sourceStatus("approvals", "approvals", apiApprovals),
    sourceStatus("approval-challenges", "approval challenges", apiApprovalChallenges),
    sourceStatus("adapters", "adapters", apiAdapters),
    sourceStatus("ecosystem", "Jeryu ecosystem", apiEcosystem),
    sourceStatus("universe", "universe", apiUniverse),
    sourceStatus("fleet-board", "fleet board", apiFleetBoard),
    sourceStatus("control-plane", "control plane", apiControlPlane),
    degradedSourceStatus("agents", "agent bus", "endpoint unavailable"),
    degradedSourceStatus("agent-sessions", "agent sessions", "endpoint unavailable"),
    degradedSourceStatus("process-observations", "process observations", "endpoint unavailable"),
    degradedSourceStatus("incidents", "incidents", "endpoint unavailable"),
  ];

  return {
    apiHealth: partialFailure || health.status !== "fulfilled" || !health.value.ok ? "watch" : "nominal",
    sourceStatuses,
    workItems: liveWork,
    evidenceBundles: liveEvidence,
    systems: liveSystems,
    toolAssets: liveTools,
    universe: liveUniverse,
    fleetBoard: apiFleetBoard.status === "fulfilled" ? normalizeFleetBoard(apiFleetBoard.value) : fleetBoard,
    agents: [],
    agentSessions: [],
    processObservations: [],
    incidents: [],
    controlPlane: apiControlPlane.status === "fulfilled" ? apiControlPlane.value : controlPlane,
    attentionPackets: liveAttention,
    voiceThreads: liveVoiceText,
    memoryLessons: liveMemory,
    replayEvents: liveReplay,
    approvalRequests: liveApprovals,
    ecosystemLive,
    ecosystemDegradedReason,
    loadedAt: new Date().toISOString().slice(11, 19) + "Z",
    usingFixtures: partialFailure,
  };
}

function sourceStatus(key: string, label: string, result: SettledSource): RuntimeSourceStatus {
  if (result.status === "fulfilled") {
    return { key, label, state: "live" };
  }
  return {
    key,
    label,
    state: "degraded",
    reason: result.reason instanceof Error ? result.reason.message : "endpoint unavailable",
  };
}

function degradedSourceStatus(key: string, label: string, reason: string): RuntimeSourceStatus {
  return { key, label, state: "degraded", reason };
}

function degradedSourceStatuses(reason: string): RuntimeSourceStatus[] {
  return runtimeSourceCatalog.map((source) => ({
    ...source,
    state: "degraded" as const,
    reason,
  }));
}

function normalizeFleetBoard(board: ApiFleetBoard): FleetBoardSnapshot {
  const raw = board as unknown as Record<string, unknown>;
  const repos = Array.isArray(raw.repos) ? raw.repos : [];
  return {
    generatedAtNote: String(raw.generatedAtNote ?? raw.generated_at_note ?? "live fleet board"),
    schema: String(raw.schema ?? "fleet-board.v1"),
    totals: normalizeFleetBoardTotals(raw.totals),
    errors: Array.isArray(raw.errors) ? raw.errors as FleetBoardSnapshot["errors"] : [],
    repos: repos.map(normalizeFleetBoardRepo),
  };
}

function normalizeFleetBoardTotals(value: unknown): FleetBoardSnapshot["totals"] {
  const totals = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return {
    repoCount: numberOr(totals.repoCount ?? totals.repo_count, 0),
    audited: numberOr(totals.audited, 0),
    failed: numberOr(totals.failed, 0),
    minScore: nullableNumber(totals.minScore ?? totals.min_score),
    maxScore: nullableNumber(totals.maxScore ?? totals.max_score),
    averageScore: nullableNumber(totals.averageScore ?? totals.average_score),
    totalHardFindings: numberOr(totals.totalHardFindings ?? totals.total_hard_findings, 0),
    belowThreshold: numberOr(totals.belowThreshold ?? totals.below_threshold, 0),
  };
}

function normalizeFleetBoardRepo(value: unknown): FleetBoardSnapshot["repos"][number] {
  const repo = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const artifact = typeof (repo.artifactState ?? repo.artifact_state) === "object" && (repo.artifactState ?? repo.artifact_state) !== null
    ? (repo.artifactState ?? repo.artifact_state) as Record<string, unknown>
    : {};
  return {
    name: String(repo.name ?? ""),
    path: String(repo.path ?? ""),
    branch: stringOrNull(repo.branch),
    host: stringOrNull(repo.host),
    dirty: nullableNumber(repo.dirty),
    dirtyFiles: nullableNumber(repo.dirtyFiles ?? repo.dirty_files),
    lastCommitSha: stringOrNull(repo.lastCommitSha ?? repo.last_commit_sha),
    headSha: stringOrNull(repo.headSha ?? repo.head_sha),
    lastCommitWhen: stringOrNull(repo.lastCommitWhen ?? repo.last_commit_when),
    lastCommitEpoch: nullableNumber(repo.lastCommitEpoch ?? repo.last_commit_epoch),
    lastBinaryEpoch: nullableNumber(repo.lastBinaryEpoch ?? repo.last_binary_epoch),
    lastTestsEpoch: nullableNumber(repo.lastTestsEpoch ?? repo.last_tests_epoch),
    version: stringOrNull(repo.version),
    ciConfigured: Boolean(repo.ciConfigured ?? repo.ci_configured ?? false),
    score: nullableNumber(repo.score),
    raw: nullableNumber(repo.raw),
    caps: stringArray(repo.caps),
    capsCount: nullableNumber(repo.capsCount ?? repo.caps_count),
    hardFindings: nullableNumber(repo.hardFindings ?? repo.hard_findings),
    hlLevel: stringOrNull(repo.hlLevel ?? repo.hl_level),
    scoreSource: stringOrNull(repo.scoreSource ?? repo.score_source),
    scoreFreshness: String(repo.scoreFreshness ?? repo.score_freshness ?? "fresh") as FleetBoardSnapshot["repos"][number]["scoreFreshness"],
    activeRunnerCount: numberOr(repo.activeRunnerCount ?? repo.active_runner_count, 0),
    runnerBusy: Boolean(repo.runnerBusy ?? repo.runner_busy ?? false),
    runnerHint: stringOrNull(repo.runnerHint ?? repo.runner_hint),
    mainCiAgeSeconds: nullableNumber(repo.mainCiAgeSeconds ?? repo.main_ci_age_seconds),
    jeryuGate: String(repo.jeryuGate ?? repo.jeryu_gate ?? "green"),
    artifactState: {
      local: String(artifact.local ?? "unknown"),
      devCanary: String(artifact.devCanary ?? artifact.dev_canary ?? "unknown"),
      prod: String(artifact.prod ?? "unknown"),
      release: String(artifact.release ?? "unknown"),
      promote: String(artifact.promote ?? "unknown"),
      latestSha: stringOrNull(artifact.latestSha ?? artifact.latest_sha),
    },
    topFindings: stringArray(repo.topFindings ?? repo.top_findings),
    topToolOpportunities: stringArray(repo.topToolOpportunities ?? repo.top_tool_opportunities),
  };
}

function numberOr(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function hasValidEventBatch(data: string): boolean {
  try {
    const payload: unknown = JSON.parse(data);
    return isEventBatch(payload);
  } catch {
    return false;
  }
}
