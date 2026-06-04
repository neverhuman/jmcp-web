import type { Risk } from "./types-core";

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
