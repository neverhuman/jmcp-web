import type { ApiAttentionPacket } from "./runtime-api";
import type { AttentionAlternative, AttentionIncident, AttentionPacket, DrilldownRef } from "./types";
import { formatUntil } from "./runtime-mappers-time";

export function mapAttentionPacket(packet: ApiAttentionPacket): AttentionPacket {
  return {
    id: packet.attention_packet_id,
    workOrderId: packet.work_order_id,
    attentionLevel: packet.attention_level,
    modality: packet.modality,
    summary: packet.user_visible_summary,
    whyNow: packet.why_now ?? packet.user_visible_summary,
    recommendation: packet.recommendation,
    decisionNeeded: packet.decision_needed,
    alternatives: (packet.options ?? packet.alternatives ?? []).map(mapAttentionAlternative),
    riskDelta: packet.risk_delta ?? {
      from: "medium",
      to: "medium",
      note: "No risk delta supplied.",
    },
    drilldown: (packet.drilldown_refs ?? []).map(mapDrilldownRef),
    expires: packet.expires_at ? formatUntil(packet.expires_at) : "open",
    incident: packet.incident ? mapAttentionIncident(packet.incident) : undefined,
  };
}

function mapAttentionAlternative(alternative: NonNullable<ApiAttentionPacket["alternatives"]>[number]): AttentionAlternative {
  return {
    id: alternative.option_id,
    label: alternative.label,
    effect: alternative.effect,
    risk: alternative.risk,
  };
}

function mapDrilldownRef(ref: NonNullable<ApiAttentionPacket["drilldown_refs"]>[number]): DrilldownRef {
  return {
    label: ref.label,
    target: ref.target,
    kind: ref.kind ?? undefined,
  };
}

function mapAttentionIncident(incident: NonNullable<ApiAttentionPacket["incident"]>): AttentionIncident {
  return {
    id: incident.incident_id,
    title: incident.title,
    severity: incident.severity,
    summary: incident.summary,
    quarantine: incident.quarantine,
    drilldown: incident.drilldown,
  };
}
