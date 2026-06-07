import type { RuntimeState } from "../runtime";
import type { FleetBoardRepo, RuntimeIncident, RuntimeSourceStatus } from "../types";
import {
  card,
  evidence,
  firstNonEmpty,
  isLive,
  liveBadge,
  repoFailedRemote,
  repoGateBad,
  repoHardFindings,
  repoHasCap,
  repoIssueLabels,
  repoOpportunityPriority,
  repoOpportunityText,
  repoScoreIsStale,
  sourceStatus,
  type CardCandidate,
} from "./command-scene-helpers";

export function repoIssueCards(repo: FleetBoardRepo): CardCandidate[] {
  const cards: CardCandidate[] = [];
  const hasCap = repoHasCap(repo);
  const hardFindings = repoHardFindings(repo);
  const gateBad = repoGateBad(repo);
  const outOfDate = repoScoreIsStale(repo);
  const failedRemote = repoFailedRemote(repo);
  if (!(hasCap || hardFindings > 0 || gateBad || outOfDate || failedRemote || (repo.score ?? 100) < 65)) {
    return cards;
  }
  const opportunity = repoOpportunityText(repo);
  const headline = firstNonEmpty(repo.topFindings) ?? (opportunity.length > 0 ? opportunity : `${repo.name} needs attention: ${repoIssueLabels(repo).join(", ")}.`);
  const issueLabels = [
    failedRemote ? "github_remote_failure" : null,
    hasCap ? "jankurai_cap" : null,
    hardFindings > 0 ? "hard_findings" : null,
    gateBad ? `gate_${repo.jeryuGate}` : null,
    outOfDate ? repo.scoreFreshness : null,
  ].filter((item): item is string => item !== null);
  cards.push(card({
    id: `issue:fleet:${repo.name}`,
    title: `${repo.name} priority issue`,
    kind: "jeryu",
    cardType: "issue",
    risk: failedRemote || hasCap || hardFindings > 0 || (repo.score ?? 100) < 65 ? "high" : "medium",
    priority: failedRemote ? 990 : hasCap || hardFindings > 0 ? 960 : 820,
    headline,
    chips: issueLabels,
    counters: [
      { label: "score", value: repo.score ?? "n/a" },
      { label: "caps", value: repo.capsCount ?? repo.caps.length },
      { label: "hard", value: hardFindings },
    ],
    sourceBadges: [liveBadge("fleet-board")],
    reasonText: failedRemote
      ? "Failed GitHub or remote-push signals rank first because external delivery is blocked."
      : "Jankurai caps, hard findings, low scores, and broken Jeryu gates are high-priority repo signals.",
  }));
  return cards;
}

export function resourceOpportunityCards(runtime: RuntimeState): CardCandidate[] {
  if (!isLive(runtime, "fleet-board")) {
    return [];
  }

  return runtime.fleetBoard.repos
    .map((repo) => ({ repo, task: repoOpportunityText(repo) }))
    .filter((item): item is { repo: FleetBoardRepo; task: string } => (
      item.task.length > 0 &&
      item.repo.activeRunnerCount > 0 &&
      !item.repo.runnerBusy
    ))
    .sort((left, right) => repoOpportunityPriority(right.repo) - repoOpportunityPriority(left.repo) || left.repo.name.localeCompare(right.repo.name))
    .slice(0, 8)
    .map(({ repo, task }) => card({
      id: `task:opportunity:${repo.name}`,
      title: `${repo.name} runner opportunity`,
      kind: "task",
      cardType: "taskDraft",
      risk: repoHasCap(repo) || repoHardFindings(repo) > 0 || (repo.score ?? 100) < 65 ? "high" : "medium",
      priority: repoOpportunityPriority(repo),
      headline: `${repo.runnerHint ?? `${repo.activeRunnerCount} local runners, idle`}; source-backed next task: ${task}.`,
      chips: ["runner_idle", repo.name, repo.jeryuGate, repo.scoreFreshness, firstNonEmpty(repo.caps) ?? "no_cap_label"].filter((chip) => chip !== "no_cap_label"),
      counters: [
        { label: "runners", value: repo.activeRunnerCount },
        { label: "score", value: repo.score ?? "n/a" },
        { label: "caps", value: repo.capsCount ?? repo.caps.length },
        { label: "hard", value: repoHardFindings(repo) },
      ],
      sourceBadges: [liveBadge("fleet-board")],
      reasonText: "Runner opportunity cards require live fleet-board idle capacity plus a repo issue, cap, gate, score, or tool opportunity from the same record.",
      evidence: evidence(repo.name, "fleet-board runner capacity", `jmcp://fleet-board/repos/${encodeURIComponent(repo.name)}/runner-opportunity`),
    }));
}

export function fleetGraphCards(runtime: RuntimeState): CardCandidate[] {
  if (!isLive(runtime, "fleet-board") || runtime.fleetBoard.repos.length === 0) {
    return [];
  }
  return [
    card({
      id: "graph:fleet-score",
      title: "Fleet score figure",
      kind: "graph",
      cardType: "graph",
      risk: runtime.fleetBoard.totals.belowThreshold > 0 ? "high" : "low",
      priority: 720,
      headline: `${runtime.fleetBoard.totals.audited}/${runtime.fleetBoard.totals.repoCount} repos audited; average score ${runtime.fleetBoard.totals.averageScore ?? "n/a"}.`,
      chips: ["cached_graph", runtime.fleetBoard.generatedAtNote, runtime.fleetBoard.schema],
      counters: [
        { label: "min", value: runtime.fleetBoard.totals.minScore ?? "n/a" },
        { label: "avg", value: runtime.fleetBoard.totals.averageScore?.toFixed(1) ?? "n/a" },
        { label: "below", value: runtime.fleetBoard.totals.belowThreshold },
      ],
      sourceBadges: [liveBadge("fleet-board")],
      reasonText: "Fleet score figure is built only from the live fleet-board payload.",
    }),
  ];
}

export function repoCard(repo: FleetBoardRepo): CardCandidate {
  const score = repo.score ?? null;
  return card({
    id: `repo:${repo.name}`,
    title: `${repo.name} repo`,
    kind: "jeryu",
    cardType: "repo",
    risk: score !== null && score < 65 ? "high" : repo.scoreFreshness === "outdated" ? "medium" : "low",
    priority: repo.runnerBusy || (repo.activeRunnerCount ?? 0) > 0 ? 740 : 620,
    headline: `${repo.path} on ${repo.branch ?? "unobserved branch"}; gate ${repo.jeryuGate}; score ${score ?? "n/a"}.`,
    chips: [repo.scoreFreshness, repo.jeryuGate, repo.host ?? "local", repo.runnerBusy ? "runner_busy" : "runner_idle"],
    counters: [
      { label: "score", value: score ?? "n/a" },
      { label: "runners", value: repo.activeRunnerCount },
      { label: "dirty", value: repo.dirtyFiles ?? repo.dirty ?? 0 },
    ],
    sourceBadges: [liveBadge("fleet-board")],
    reasonText: "Repo cards are emitted only from fleet-board repo records.",
    evidence: evidence(repo.name, "fleet-board repo", `jmcp://fleet-board/repos/${encodeURIComponent(repo.name)}`),
  });
}

export function approvalCards(runtime: RuntimeState): CardCandidate[] {
  if (!isLive(runtime, "approvals") && !isLive(runtime, "approval-challenges")) {
    return [];
  }
  return runtime.approvalRequests.map((approval) => card({
    id: `approval:${approval.id}`,
    title: approval.decision,
    kind: "approval",
    cardType: "approval",
    risk: approval.risk,
    priority: approval.state === "pending" ? 870 : 480,
    headline: `${approval.workOrderId} awaits ${approval.approver} through ${approval.channel}; expires ${approval.expires}.`,
    chips: [approval.state, approval.channel, approval.voiceThreadId ? "voice_confirm" : "local_confirm"],
    counters: [
      { label: "expires", value: approval.expires },
      { label: "lineage", value: approval.lineage.length },
      { label: "risk", value: approval.risk },
    ],
    sourceBadges: [isLive(runtime, "approval-challenges") ? liveBadge("approval-challenges") : liveBadge("approvals")],
    reasonText: "Pending approvals rank high because mutating work cannot proceed without explicit authority.",
    actions: [{
      id: `approval-preview:${approval.id}`,
      label: "Preview approval",
      command: `jmcp.approval.prepare ${approval.id}`,
      safety: "approval_required",
      ready: false,
      requiresApproval: true,
      reason: "This card is a preview; approval decisions still go through JMCP authority routes.",
      previewRef: `jmcp://approval/${approval.id}`,
    }],
  }));
}

export function evidenceCards(runtime: RuntimeState): CardCandidate[] {
  const cards: CardCandidate[] = [];
  if (isLive(runtime, "replay") && runtime.replayEvents.length > 0) {
    cards.push(card({
      id: "evidence:replay",
      title: "Replay evidence",
      kind: "evidence",
      cardType: "evidence",
      risk: "low",
      priority: 520,
      headline: `${runtime.replayEvents.length} replay checkpoints/events are visible.`,
      chips: runtime.replayEvents.slice(0, 3).map((event) => event.family),
      counters: [
        { label: "events", value: runtime.replayEvents.length },
        { label: "latest", value: runtime.replayEvents[0]?.timestamp ?? "n/a" },
      ],
      sourceBadges: [liveBadge("replay")],
      reasonText: "Replay evidence cards are emitted only when the replay endpoint returns events.",
    }));
  }
  if (isLive(runtime, "evidence") && runtime.evidenceBundles.length > 0) {
    cards.push(card({
      id: "evidence:bundles",
      title: "Evidence bundles",
      kind: "evidence",
      cardType: "evidence",
      risk: "low",
      priority: 500,
      headline: `${runtime.evidenceBundles.length} evidence bundle records are loaded.`,
      chips: runtime.evidenceBundles.slice(0, 3).map((bundle) => bundle.status),
      counters: [
        { label: "bundles", value: runtime.evidenceBundles.length },
        { label: "first", value: runtime.evidenceBundles[0]?.id ?? "n/a" },
      ],
      sourceBadges: [liveBadge("evidence")],
      reasonText: "Evidence bundle cards are emitted only from the evidence endpoint.",
    }));
  }
  return cards;
}

export function incidentCard(incident: RuntimeIncident): CardCandidate {
  return card({
    id: `issue:incident:${incident.id}`,
    title: incident.title,
    kind: "adapter_health",
    cardType: "issue",
    risk: incident.severity === "critical" || incident.severity === "major" ? "high" : "medium",
    priority: incident.severity === "critical" ? 970 : incident.severity === "major" ? 910 : 730,
    headline: `${incident.state}: ${incident.containment}`,
    chips: [incident.severity, incident.state, incident.quarantineScope],
    counters: [
      { label: "workOrders", value: incident.relatedWorkOrders.length },
      { label: "notes", value: incident.notes.length },
      { label: "updated", value: incident.updatedAt },
    ],
    sourceBadges: [liveBadge("incidents")],
    reasonText: "Open incidents are ranked by severity from the live incidents source.",
  });
}

export function degradedCards(runtime: RuntimeState, keys: string[]): CardCandidate[] {
  return keys
    .map((key) => sourceStatus(runtime, key))
    .filter((status): status is RuntimeSourceStatus => status !== undefined && status.state === "degraded")
    .map((status) => card({
      id: `degraded:${status.key}`,
      title: `${status.label} unavailable`,
      kind: "adapter_health",
      cardType: "degradedSource",
      risk: "medium",
      priority: 640,
      headline: `${status.label} did not provide live data: ${status.reason ?? "source unavailable"}.`,
      chips: ["degraded_source", status.key],
      counters: [{ label: "cards", value: 0 }],
      sourceBadges: [{ source: status.key, status: "degraded", reason: status.reason }],
      reasonText: "Degraded-source cards are explicit holding cards for unavailable sources and never stand in for live data.",
    }));
}
