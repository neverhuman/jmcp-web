import type { ApiAdapters, ApiEvidence, ApiReplay, ApiVoiceThread, ApiWorkOrder } from "./runtime-api";
import type { EvidenceBundle, ReplayEvent, ToolAsset, VoiceTextThread, WorkItem } from "./types";
import { formatAge, formatAgeOrLiteral, titleCase } from "./runtime-mappers-time";

const BRANCH_PAYLOAD_KEYS = ["branch", "repo_branch", "repoBranch", "git_branch", "gitBranch"] as const;
const REPO_PAYLOAD_KEYS = ["repo", "repository", "provider"] as const;

type RuntimeStringCandidate =
  | { state: "present"; value: string }
  | { state: "absent"; reason: "payload_not_record" | "missing_string" | "subject_unrecognized" };

export function mapWorkOrder(workOrder: ApiWorkOrder): WorkItem {
  const owner = workOrder.subject.split("/")[1] ?? "jmcp";
  const state = workOrder.status.toLowerCase();
  const repo = repoCandidateForWorkOrder(workOrder);
  const branch = stringCandidateFromPayload(workOrder.task.payload, BRANCH_PAYLOAD_KEYS);
  return {
    id: workOrder.id,
    title: workOrder.task.kind,
    owner,
    state,
    risk: state === "failed" ? "high" : state === "awaitingapproval" ? "medium" : "low",
    lease: state === "submitted" ? "lease required" : "lease active",
    updated: formatAge(workOrder.updated_at),
    evidence: workOrder.evidence.length,
    ...optionalWorkField("repo", repo),
    ...optionalWorkField("branch", branch),
  };
}

export function mapEvidence(evidence: ApiEvidence): EvidenceBundle {
  return {
    id: evidence.uri.slice(0, 12),
    subject: evidence.kind,
    source: "jmcpd",
    status: "accepted",
    hash: evidence.uri,
    age: formatAge(evidence.captured_at),
  };
}

export function mapReplay(replay: ApiReplay): ReplayEvent[] {
  if (replay.events === 0 && replay.checkpoints.length === 0) {
    return [];
  }
  const checkpoints =
    replay.checkpoints.length > 0
      ? replay.checkpoints
      : [
          {
            id: "live-events",
            last_event_id: replay.events,
            created_at: new Date().toISOString(),
          },
        ];
  return checkpoints.map((checkpoint) => ({
    sequence: checkpoint.last_event_id,
    subject: checkpoint.id,
    family: "ReplayCheckpoint",
    timestamp: new Date(checkpoint.created_at).toISOString().slice(11, 19) + "Z",
    producer: "jmcpd",
  }));
}

export function mapVoiceThread(thread: ApiVoiceThread): VoiceTextThread {
  return {
    id: thread.interaction_id,
    channel: thread.channel,
    speaker: thread.speaker_id,
    title: thread.title,
    state: thread.voice_state ?? "draft",
    confidence: thread.confidence ?? 0,
    transcript: thread.transcript ?? thread.message ?? "",
    intent: thread.intent,
    confirmationPhrase: thread.confirmation_phrase ?? undefined,
    requiresResponse: thread.requires_response,
    decisionOptions: thread.decision_options ?? [],
    updated: formatAgeOrLiteral(thread.updated_at),
    sourceRef: thread.source_ref,
  };
}

export function mapAdapters(adapters: ApiAdapters): ToolAsset[] {
  const healthByName = new Map(adapters.health.map((item) => [item.name, item]));
  return adapters.service_cards.flatMap((card) => {
    const health = healthByName.get(card.name);
    return card.capabilities.map((capability) => ({
      name: `${card.name}.${capability}`,
      className: card.subjects.join(", "),
      conformance: card.name === "jmcpd" ? "C2 native" : "C1 governed",
      sideEffects: capability.includes("health") || capability.includes("status") ? "none" : "lease gated",
      dataClasses: [card.name, capability],
      repo: card.name === "jmcpd" ? "JMCP" : titleCase(card.name),
      provider: card.name,
      health: health?.health ?? "degraded",
      dependsOn: card.name === "jeryu" ? ["jmcpd.work-orders", "jankurai.proof"] : ["jmcpd.leases"],
      queue: health?.health === "nominal" ? 0 : 1,
    }));
  });
}

function repoCandidateForWorkOrder(workOrder: ApiWorkOrder): RuntimeStringCandidate {
  const fromPayload = stringCandidateFromPayload(workOrder.task.payload, REPO_PAYLOAD_KEYS);
  if (fromPayload.state === "present") {
    return fromPayload;
  }
  return repoCandidateFromSubject(workOrder.subject);
}

function stringCandidateFromPayload(
  payload: unknown,
  keys: readonly string[],
): RuntimeStringCandidate {
  if (!isRecord(payload)) {
    return { state: "absent", reason: "payload_not_record" };
  }
  for (const key of keys) {
    const value = payload[key];
    if (isString(value) && value.trim().length > 0) {
      return { state: "present", value };
    }
  }
  return { state: "absent", reason: "missing_string" };
}

function repoCandidateFromSubject(subject: string): RuntimeStringCandidate {
  const parts = subject.split("/");
  if (parts.length > 1 && parts[1]) {
    return { state: "present", value: titleCase(parts[1]) };
  }
  return { state: "absent", reason: "subject_unrecognized" };
}

function optionalWorkField(
  key: "repo" | "branch",
  candidate: RuntimeStringCandidate,
): Partial<Pick<WorkItem, "repo" | "branch">> {
  if (candidate.state === "present") {
    return { [key]: candidate.value };
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
