import {
  attentionPackets,
  approvalRequests,
  controlPlane,
  fleetBoard,
  evidenceBundles,
  memoryLessons,
  replayEvents,
  systems,
  toolAssets,
  voiceTextThreads,
  workItems,
} from "./fixtures";
import {
  isAdapters,
  isAgentSessionArray,
  isAgentSummaryArray,
  isApprovalArray,
  isApprovalChallengeArray,
  isAttentionPacketArray,
  isControlPlane,
  isEcosystem,
  isEventBatch,
  isEvidenceArray,
  isFleetBoard,
  isHealthResponse,
  isIncidentArray,
  isMemoryProposalArray,
  isProcessObservationArray,
  isReplay,
  isSystemArray,
  isUniverse,
  isVoiceThreadArray,
  isWorkOrderArray,
  type ApiAgentSession,
  type ApiAgentSummary,
  type ApiAdapters,
  type ApiApproval,
  type ApiApprovalChallenge,
  type ApiAttentionPacket,
  type ApiControlPlane,
  type ApiEcosystem,
  type ApiEvidence,
  type ApiFleetBoard,
  type ApiIncident,
  type ApiMemoryProposal,
  type ApiProcessObservation,
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
  mapFleetBoard,
  mapMemoryProposal,
  mapReplay,
  mapUniverse,
  mapVoiceThread,
  mapWorkOrder,
} from "./runtime-mappers";
import type {
  ApprovalRequest,
  AttentionPacket,
  ControlPlaneSummary,
  EvidenceBundle,
  Health,
  MemoryProposal,
  ReplayEvent,
  SystemNode,
  FleetBoardSnapshot,
  UniverseActiveRepo,
  UniverseBootstrapTui,
  UniversePlacement,
  UniverseRepoScore,
  UniverseSlice,
  UniverseSnapshot,
  ToolAsset,
  VoiceTextThread,
  WorkItem,
  AgentSummary,
  AgentSessionSummary,
  ProcessObservationSummary,
  RuntimeIncident,
  RuntimeSourceStatus,
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
  { key: "fleet-board", label: "fleet board" },
  { key: "universe", label: "universe" },
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
  attentionPackets: AttentionPacket[];
  voiceThreads: VoiceTextThread[];
  memoryLessons: MemoryProposal[];
  replayEvents: ReplayEvent[];
  approvalRequests: ApprovalRequest[];
  controlPlane: ControlPlaneSummary;
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
    attentionPackets,
    voiceThreads: voiceTextThreads,
    memoryLessons,
    replayEvents,
    approvalRequests,
    controlPlane,
    ecosystemLive: false,
    ecosystemDegradedReason: "fixture data",
    loadedAt: "fixture",
    usingFixtures: true,
  };
}

function degradedSourceStatuses(reason: string): RuntimeSourceStatus[] {
  return runtimeSourceCatalog.map((source) => ({ ...source, state: "degraded", reason }));
}

function sourceStatus(key: string, label: string, result: SettledSource): RuntimeSourceStatus {
  if (result.status === "fulfilled") {
    return { key, label, state: "live" };
  }
  return {
    key,
    label,
    state: "degraded",
    reason: result.reason instanceof Error ? result.reason.message : "source unavailable",
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
    apiFleetBoard,
    apiUniverse,
    apiControlPlane,
    apiAgents,
    apiAgentSessions,
    apiProcessObservations,
    apiIncidents,
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
    getJson<ApiFleetBoard>("/fleet-board", isFleetBoard),
    getJson<ApiUniverse>("/universe", isUniverse),
    getJson<ApiControlPlane>("/control-plane", isControlPlane),
    getJson<ApiAgentSummary[]>("/agents", isAgentSummaryArray),
    getJson<ApiAgentSession[]>("/agent-sessions", isAgentSessionArray),
    getJson<ApiProcessObservation[]>("/process-observations", isProcessObservationArray),
    getJson<ApiIncident[]>("/incidents", isIncidentArray),
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
    apiFleetBoard,
    apiUniverse,
    apiControlPlane,
    apiAgents,
    apiAgentSessions,
    apiProcessObservations,
    apiIncidents,
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
  const liveFleetBoard =
    apiFleetBoard.status === "fulfilled"
      ? mapFleetBoard(apiFleetBoard.value)
      : fleetBoard;
  const liveAgents = apiAgents.status === "fulfilled" ? apiAgents.value : [];
  const liveAgentSessions = apiAgentSessions.status === "fulfilled" ? apiAgentSessions.value : [];
  const liveProcessObservations = apiProcessObservations.status === "fulfilled" ? apiProcessObservations.value : [];
  const liveIncidents = apiIncidents.status === "fulfilled" ? apiIncidents.value : [];
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
    apiFleetBoard,
    apiUniverse,
    apiControlPlane,
    apiAgents,
    apiAgentSessions,
    apiProcessObservations,
    apiIncidents,
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
    sourceStatus("fleet-board", "fleet board", apiFleetBoard),
    sourceStatus("universe", "universe", apiUniverse),
    sourceStatus("control-plane", "control plane", apiControlPlane),
    sourceStatus("agents", "agent bus", apiAgents),
    sourceStatus("agent-sessions", "agent sessions", apiAgentSessions),
    sourceStatus("process-observations", "process observations", apiProcessObservations),
    sourceStatus("incidents", "incidents", apiIncidents),
  ];

  return {
    apiHealth: partialFailure || health.status !== "fulfilled" || !health.value.ok ? "watch" : "nominal",
    sourceStatuses,
    workItems: liveWork,
    evidenceBundles: liveEvidence,
    systems: liveSystems,
    toolAssets: liveTools,
    universe: liveUniverse,
    agents: liveAgents,
    agentSessions: liveAgentSessions,
    processObservations: liveProcessObservations,
    incidents: liveIncidents,
    attentionPackets: liveAttention,
    voiceThreads: liveVoiceText,
    memoryLessons: liveMemory,
    replayEvents: liveReplay,
    approvalRequests: liveApprovals,
    controlPlane: apiControlPlane.status === "fulfilled" ? apiControlPlane.value : controlPlane,
    ecosystemLive,
    ecosystemDegradedReason,
    fleetBoard: liveFleetBoard,
    loadedAt: new Date().toISOString().slice(11, 19) + "Z",
    usingFixtures: partialFailure,
  };
}

export function hasValidEventBatch(data: string): boolean {
  try {
    const payload: unknown = JSON.parse(data);
    return isEventBatch(payload);
  } catch {
    return false;
  }
}
