import type { ApiApproval, ApiApprovalChallenge } from "./runtime-api";
import type { ApprovalRequest, VoiceTextThread, WorkItem } from "./types";
import { formatUntil } from "./runtime-mappers-time";

export function mapApproval(approval: ApiApproval): ApprovalRequest {
  return {
    id: approval.work_order_id,
    challengeId: approval.work_order_id,
    workOrderId: approval.work_order_id,
    channel: "local",
    state: approval.decision ? approval.decision.toLowerCase() : "pending",
    decision: approval.decision ?? `Awaiting ${approval.approver}`,
    reason: "JMCP approval gate",
    risk: "medium",
    expires: formatUntil(approval.expires_at),
    approver: approval.approver,
    tokenHash: `sha256:${approval.work_order_id.slice(0, 12)}`,
    workOrderTitle: "Local approval",
    workOrderState: "pending",
    workOrderOwner: approval.approver,
    currentTask: "local approval",
    branch: "unobserved",
    pool: "local",
    placement: "jmcpd",
    lineage: [`approval.${approval.work_order_id}`],
  };
}

export function mapApprovalChallenge(
  challenge: ApiApprovalChallenge,
  context?: { workOrder?: WorkItem; approval?: ApiApproval; voiceThread?: VoiceTextThread },
): ApprovalRequest {
  const state = challenge.state.toLowerCase();
  const workOrder = context?.workOrder;
  const voiceThread = context?.voiceThread;
  return {
    id: challenge.id,
    challengeId: challenge.id,
    workOrderId: challenge.work_order_id,
    channel: challenge.channel,
    state,
    decision: challenge.decision ?? `Awaiting ${challenge.approver}`,
    reason: approvalChallengeReason(challenge),
    risk: riskForApprovalState(state),
    expires: formatUntil(challenge.expires_at),
    approver: challenge.approver,
    tokenHash: challenge.token_hash,
    targetUserId: challenge.target_user_id ?? undefined,
    targetChatId: challenge.target_chat_id ?? undefined,
    workOrderTitle: workOrder?.title ?? "unobserved",
    workOrderState: workOrder?.state ?? "unobserved",
    workOrderOwner: workOrder?.owner ?? "unobserved",
    currentTask: workOrder?.title ?? "unobserved",
    branch: workOrder?.branch ?? "unobserved",
    pool: workOrder?.owner ?? "unassigned",
    placement: workOrder?.owner ?? "unplaced",
    voiceThreadId: voiceThread?.id,
    voiceThreadState: voiceThread?.state,
    voiceTranscript: voiceThread?.transcript,
    voiceConfirmationPhrase: voiceThread?.confirmationPhrase,
    lineage: buildApprovalLineage(challenge, workOrder, voiceThread, context?.approval),
  };
}

function approvalChallengeReason(challenge: ApiApprovalChallenge) {
  if (challenge.channel === "telegram") {
    return `Telegram user ${challenge.target_user_id ?? "unknown"} in chat ${challenge.target_chat_id ?? "unknown"}`;
  }
  return "Local approval challenge";
}

function buildApprovalLineage(
  challenge: ApiApprovalChallenge,
  workOrder?: WorkItem,
  voiceThread?: VoiceTextThread,
  approval?: ApiApproval,
) {
  return [
    `challenge.${challenge.id}`,
    `work.${challenge.work_order_id}`,
    workOrder ? `task.${workOrder.title}` : "task.unobserved",
    approval?.decision ? `decision.${approval.decision.toLowerCase()}` : "decision.pending",
    voiceThread ? `voice.${voiceThread.id}` : "voice.unobserved",
  ];
}

function riskForApprovalState(state: string): "low" | "medium" | "high" {
  if (state === "approved") {
    return "low";
  }
  if (state === "rejected" || state === "expired") {
    return "high";
  }
  return "medium";
}
