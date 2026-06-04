import type { ApiMemoryProposal } from "./runtime-api";
import type { MemoryIncident, MemoryProposal, MemoryPromotion } from "./types";
import { formatAgeOrLiteral, formatUntilOrLiteral } from "./runtime-mappers-time";

export function mapMemoryProposal(proposal: ApiMemoryProposal): MemoryProposal {
  return {
    id: proposal.memory_id,
    scope: proposal.scope,
    claim: proposal.claim,
    state: proposal.lesson_state,
    confidence: proposal.confidence,
    retention: proposal.retention,
    expiry: formatUntilOrLiteral(proposal.expiry),
    promotion: mapMemoryPromotion(proposal.promotion),
    counterexamples: proposal.counterexamples,
    source: proposal.source,
    rollback: proposal.rollback,
    incident: proposal.incident ? mapMemoryIncident(proposal.incident) : undefined,
  };
}

function mapMemoryPromotion(promotion: ApiMemoryProposal["promotion"]): MemoryPromotion {
  return {
    status: promotion.status,
    gate: promotion.gate,
    reviewedBy: promotion.reviewed_by ?? undefined,
    promotedAt: promotion.promoted_at ? formatAgeOrLiteral(promotion.promoted_at) : undefined,
  };
}

function mapMemoryIncident(incident: NonNullable<ApiMemoryProposal["incident"]>): MemoryIncident {
  return {
    title: incident.title,
    summary: incident.summary,
    quarantine: incident.quarantine,
    drilldown: incident.drilldown,
  };
}
