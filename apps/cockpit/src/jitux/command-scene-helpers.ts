import type { RuntimeState } from "../runtime";
import type {
  AgentSessionSummary,
  FleetBoardRepo,
  ProcessObservationSummary,
  RuntimeSourceStatus,
} from "../types";
import { reason } from "./queue-blocker-frames";
import type {
  DeckCardType,
  DeckRankReason,
  JituxFrame,
  PaneKind,
  PaneRisk,
  PaneVM,
  PreparedAction,
  PreparedTab,
  SourceBadge,
} from "./types";

export const emittedAt = "2026-06-03T15:00:00.000Z";

export type CardCandidate = Omit<PaneVM, "rank" | "lod" | "status"> & {
  priority: number;
  status?: PaneVM["status"];
  lod?: PaneVM["lod"];
  reason: DeckRankReason;
  evidence?: Extract<JituxFrame, { type: "evidence.attach" }>["evidence"];
  actions?: PreparedAction[];
};

export function card(input: {
  id: string;
  title: string;
  kind: PaneKind;
  cardType: DeckCardType;
  risk: PaneRisk;
  priority: number;
  headline: string;
  chips: string[];
  counters: PaneVM["preview"]["counters"];
  sourceBadges: SourceBadge[];
  reasonText: string;
  evidence?: Extract<JituxFrame, { type: "evidence.attach" }>["evidence"];
  actions?: PreparedAction[];
}): CardCandidate {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    risk: input.risk,
    priority: input.priority,
    cardType: input.cardType,
    confidence: input.sourceBadges.some((badge) => badge.status === "live") ? 0.9 : input.sourceBadges.some((badge) => badge.status === "draft") ? 0.72 : 0.54,
    sourceBadges: input.sourceBadges,
    preview: {
      headline: input.headline,
      chips: input.chips.filter((chip) => chip.trim().length > 0).slice(0, 8),
      counters: input.counters.slice(0, 5),
    },
    preparedTabs: preparedTabs(input.cardType, input.evidence, input.actions),
    reason: reasonFromPriority(input.priority, input.reasonText, input.risk),
    evidence: input.evidence,
    actions: input.actions,
  };
}

export function preparedTabs(cardType: DeckCardType, evidenceRefs?: unknown[], actions?: PreparedAction[]): PreparedTab[] {
  const tabs: PreparedTab[] = [];
  if (evidenceRefs && evidenceRefs.length > 0) tabs.push("evidence");
  if (cardType === "worker" || cardType === "terminal" || cardType === "repo" || cardType === "degradedSource" || cardType === "graph") tabs.push("systems");
  if (actions && actions.length > 0) tabs.push("actions");
  if (tabs.length === 0) tabs.push("raw");
  return tabs;
}

export function reasonFromPriority(priority: number, explanation: string, risk: PaneRisk): DeckRankReason {
  const riskValue = risk === "high" ? 1 : risk === "medium" ? 0.55 : 0.2;
  return reason(Math.min(1, priority / 1000), explanation, {
    risk: riskValue,
    blockedness: priority >= 900 ? 0.9 : 0.3,
    adapterDegradedWeight: explanation.includes("degraded") ? 0.9 : 0.2,
    evidenceGapWeight: explanation.includes("missing") || explanation.includes("unavailable") ? 0.8 : 0.25,
    userQueryRelevance: 1,
    downstreamBlastRadius: priority >= 900 ? 0.85 : 0.4,
  });
}

export function evidence(label: string, source: string, uri: string): Extract<JituxFrame, { type: "evidence.attach" }>["evidence"] {
  return [{ id: `evidence:${label}:${source}`, label, uri, capturedAt: emittedAt }];
}

export function repoNameFromPrompt(prompt: string): string | null {
  const match = prompt.match(/\b(?:repo|repository)\s+(?:called|named)?\s*([a-z0-9_.-]+)/i) ?? prompt.match(/\b(?:fresh|new)\s+repo\s+([a-z0-9_.-]+)/i);
  return match?.[1] ?? null;
}

export function sourceStatus(runtime: RuntimeState, key: string): RuntimeSourceStatus | undefined {
  return runtime.sourceStatuses.find((source) => source.key === key);
}

export function isLive(runtime: RuntimeState, key: string): boolean {
  return sourceStatus(runtime, key)?.state === "live";
}

export function liveBadge(source: string): SourceBadge {
  return { source, status: "live" };
}

export function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
}

export function repoHasCap(repo: FleetBoardRepo): boolean {
  return repo.caps.length > 0 || (repo.capsCount ?? 0) > 0;
}

export function repoHardFindings(repo: FleetBoardRepo): number {
  return repo.hardFindings ?? 0;
}

export function repoGateBad(repo: FleetBoardRepo): boolean {
  return repo.jeryuGate !== "green" && repo.jeryuGate !== "pass";
}

export function repoScoreIsStale(repo: FleetBoardRepo): boolean {
  return repo.scoreFreshness === "outdated" || repo.scoreFreshness === "unscored";
}

export function repoFailedRemote(repo: FleetBoardRepo): boolean {
  return repo.host?.toLowerCase() === "github" && (repoGateBad(repo) || repo.topFindings.some((finding) => /github|push|pr|ci|remote/i.test(finding)));
}

export function repoIssueLabels(repo: FleetBoardRepo): string[] {
  return [
    repoFailedRemote(repo) ? "github_remote_failure" : null,
    repoHasCap(repo) ? "jankurai_cap" : null,
    repoHardFindings(repo) > 0 ? "hard_findings" : null,
    repoGateBad(repo) ? `gate_${repo.jeryuGate}` : null,
    repoScoreIsStale(repo) ? repo.scoreFreshness : null,
    (repo.score ?? 100) < 65 ? "score_below_threshold" : null,
  ].filter((item): item is string => item !== null);
}

export function repoOpportunityText(repo: FleetBoardRepo): string {
  const finding = firstNonEmpty(repo.topFindings);
  if (finding) {
    return finding;
  }
  const cap = firstNonEmpty(repo.caps);
  if (cap) {
    return `Jankurai cap: ${cap}`;
  }
  const hardFindings = repoHardFindings(repo);
  if (hardFindings > 0) {
    return `${hardFindings} hard Jankurai finding${hardFindings === 1 ? "" : "s"}`;
  }
  if (repoGateBad(repo)) {
    return `Jeryu gate: ${repo.jeryuGate}`;
  }
  if (repoScoreIsStale(repo)) {
    return `refresh ${repo.scoreFreshness} Jankurai score`;
  }
  if ((repo.score ?? 100) < 65) {
    return `raise Jankurai score ${repo.score}`;
  }
  const toolOpportunity = firstNonEmpty(repo.topToolOpportunities);
  if (toolOpportunity) {
    return `tool opportunity: ${toolOpportunity}`;
  }
  return "";
}

export function repoOpportunityPriority(repo: FleetBoardRepo): number {
  if (repoFailedRemote(repo)) {
    return 945;
  }
  if (repoHasCap(repo) || repoHardFindings(repo) > 0) {
    return 905;
  }
  if (repoGateBad(repo)) {
    return 880;
  }
  if ((repo.score ?? 100) < 65 || repoScoreIsStale(repo)) {
    return 840;
  }
  return 700;
}

export function textMatches(value: string, token: string): boolean {
  return value.toLowerCase().includes(token.toLowerCase());
}

export function isActiveSession(session: AgentSessionSummary): boolean {
  return session.status === "running" || session.status === "waiting" || session.status === "failed";
}

export function jeryuAgentSessions(runtime: RuntimeState): AgentSessionSummary[] {
  return runtime.agentSessions.filter((session) => textMatches([session.provider, session.subject ?? "", session.sessionKey].join(" "), "jeryu") || textMatches(session.subject ?? "", "jankurai"));
}

export function jeryuProcessObservations(runtime: RuntimeState): ProcessObservationSummary[] {
  return runtime.processObservations.filter((process) => textMatches([process.processKey, process.command ?? "", process.diagnosticClass ?? ""].join(" "), "jeryu") || textMatches(process.command ?? "", "jankurai"));
}

export function hasJeryuSignal(pane: CardCandidate): boolean {
  const text = `${pane.id} ${pane.title} ${pane.preview.headline} ${pane.preview.chips.join(" ")}`.toLowerCase();
  return text.includes("jeryu") || text.includes("jankurai") || text.includes("fleet");
}
