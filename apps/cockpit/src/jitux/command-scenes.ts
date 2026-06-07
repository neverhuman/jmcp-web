import type { RuntimeState } from "../runtime";
import { routeNowCommand, type NowIntent, type RoutedNowCommand } from "./command-router";
import { seqFrame } from "./queue-blocker-frames";
import {
  approvalCards,
  degradedCards,
  evidenceCards,
  fleetGraphCards,
  incidentCard,
  repoCard,
  repoIssueCards,
  resourceOpportunityCards,
} from "./command-scene-cards";
import { bugAuditCards, jailgunFrontendCards, repoCreateCards, taskIntakeCards } from "./command-scene-drafts";
import {
  card,
  firstNonEmpty,
  hasJeryuSignal,
  isLive,
  jeryuAgentSessions,
  jeryuProcessObservations,
  liveBadge,
  textMatches,
  type CardCandidate,
} from "./command-scene-helpers";
import { workerCards, workQueueCards } from "./command-scene-workers";
import type { JituxFrame } from "./types";

export function createNowCommandFrames(
  runtime: RuntimeState,
  prompt?: string,
  sessionId = "frontend.now-command",
): JituxFrame[] {
  const route = routeNowCommand(prompt);
  const candidates = cardsForRoute(route, runtime, prompt ?? "");
  const ranked = candidates
    .filter((card) => card.title.trim().length > 0 && card.preview.headline.trim().length > 0)
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .slice(0, 24)
    .map((card, index) => ({
      ...card,
      rank: index + 1,
      lod: index === 0 ? "focus" as const : card.lod ?? "preview" as const,
      status: index === 0 ? "active" as const : card.status ?? "warm" as const,
    }));

  let seq = 1;
  const frames: JituxFrame[] = [
    seqFrame("deck.patch", sessionId, seq++, {
      deck: { mode: "mission_deck", title: route.title, active: true },
    }),
  ];

  for (const card of ranked) {
    frames.push(seqFrame("pane.prepare", sessionId, seq++, { pane: card, reason: card.reason.explanation }));
    frames.push(seqFrame("card.ghost", sessionId, seq++, { pane: card }));
  }
  frames.push(
    seqFrame("deck.rank.changed", sessionId, seq++, {
      orderedPaneIds: ranked.map((card) => card.id),
      reasons: ranked.map((card) => ({ paneId: card.id, reason: card.reason })),
    }),
  );
  if (ranked.length > 0) {
    frames.push(seqFrame("focus.change", sessionId, seq++, { paneId: ranked[0].id, reason: ranked[0].reason }));
  }
  for (const card of ranked) {
    if (card.evidence && card.evidence.length > 0) {
      frames.push(seqFrame("evidence.attach", sessionId, seq++, {
        paneId: card.id,
        evidence: card.evidence,
        freshnessMs: card.freshnessMs,
        confidence: card.confidence,
      }));
    }
    for (const action of card.actions ?? []) {
      frames.push(seqFrame("action.ready", sessionId, seq++, { paneId: card.id, action }));
    }
    frames.push(seqFrame("card.hydrated", sessionId, seq++, { paneId: card.id, preparedTabs: card.preparedTabs }));
  }
  frames.push(seqFrame("session.done", sessionId, seq++, { summary: `${route.title} prepared from ${ranked.length} source-backed card${ranked.length === 1 ? "" : "s"}.` }));
  return frames;
}

export function dialogueForState(runtime: RuntimeState, prompt?: string): string[] {
  const route = routeNowCommand(prompt);
  const live = runtime.sourceStatuses.filter((source) => source.state === "live").length;
  const degraded = runtime.sourceStatuses.length - live;
  const base = [`route: ${route.intent}`, `${live} live sources`, `${degraded} degraded sources`];
  if (route.intent === "task_intake" || route.intent === "bug_audit" || route.intent === "jailgun_frontend_improvement" || route.intent === "repo_create") {
    return [...base, "draft cards only", "approval required before mutation"];
  }
  if (route.intent === "code_graph") {
    return [...base, "using cached graph-capable source cards only"];
  }
  return [...base, "ranking failures, caps, stuck workers, and missing evidence first"];
}

function cardsForRoute(route: RoutedNowCommand, runtime: RuntimeState, prompt: string): CardCandidate[] {
  switch (route.intent) {
    case "jeryu":
      return jeryuCards(runtime);
    case "live_agents":
      return [...workerCards(runtime, "live_agents"), ...degradedCards(runtime, ["agents", "agent-sessions", "process-observations"])];
    case "work_queue":
    case "queue_blockers":
      return [...workQueueCards(runtime), ...degradedCards(runtime, ["work-orders", "attention", "approvals"])];
    case "approvals":
      return [...approvalCards(runtime), ...degradedCards(runtime, ["approvals", "approval-challenges"])];
    case "task_intake":
      return taskIntakeCards(prompt);
    case "bug_audit":
      return bugAuditCards(prompt);
    case "jailgun_frontend_improvement":
      return jailgunFrontendCards(prompt);
    case "repo_create":
      return repoCreateCards(prompt);
    case "code_graph":
      return codeGraphCards(runtime);
    case "reporting":
    case "system_report":
      return systemReportCards(runtime, route.intent);
  }
}

function systemReportCards(runtime: RuntimeState, intent: NowIntent): CardCandidate[] {
  return [
    ...priorityIssueCards(runtime),
    ...resourceOpportunityCards(runtime),
    ...fleetGraphCards(runtime),
    ...workerCards(runtime, intent),
    ...workQueueCards(runtime),
    ...approvalCards(runtime),
    ...evidenceCards(runtime),
    ...degradedCards(runtime, [
      "fleet-board",
      "control-plane",
      "agents",
      "agent-sessions",
      "process-observations",
      "incidents",
      "work-orders",
      "ecosystem",
    ]),
  ];
}

function jeryuCards(runtime: RuntimeState): CardCandidate[] {
  const cards: CardCandidate[] = [];
  const liveSources = ["ecosystem", "fleet-board", "control-plane", "agent-sessions", "process-observations", "attention", "incidents"].filter((key) => isLive(runtime, key));
  if (liveSources.length > 0) {
    const repos = isLive(runtime, "fleet-board") ? runtime.fleetBoard.repos : [];
    const workcellWorkers = isLive(runtime, "control-plane")
      ? runtime.controlPlane.activeWorkcells.filter((cell) => textMatches(cell.repo, "jeryu") || textMatches(cell.task, "jeryu") || textMatches(cell.task, "jankurai")).length
      : 0;
    const workers = jeryuAgentSessions(runtime).length + jeryuProcessObservations(runtime).length + workcellWorkers;
    const issueCount = priorityIssueCards(runtime).filter((card) => textMatches(card.title, "jeryu") || textMatches(card.title, "jankurai") || card.sourceBadges?.some((badge) => badge.source === "fleet-board")).length;
    const worstScore = repos.map((repo) => repo.score).filter((score): score is number => typeof score === "number").sort((a, b) => a - b)[0];
    cards.push(card({
      id: "jeryu:overview",
      title: "Jeryu overview",
      kind: "jeryu",
      cardType: "cluster",
      risk: issueCount > 0 || runtime.ecosystemLive === false ? "high" : "medium",
      priority: 980,
      headline: `${runtime.ecosystemLive ? "Live" : "Degraded"} Jeryu sources: ${repos.length} repos, ${workers} active workers, ${issueCount} priority issues.`,
      chips: [runtime.ecosystemLive ? "live" : "degraded", "overview", ...liveSources.slice(0, 3)],
      counters: [
        { label: "repos", value: repos.length },
        { label: "workers", value: workers },
        { label: "worstScore", value: worstScore ?? "n/a" },
      ],
      sourceBadges: liveSources.map((source) => liveBadge(source)),
      reasonText: "Jeryu overview ranks first because it aggregates the live source coverage and priority issue count.",
    }));
  }

  cards.push(...workerCards(runtime, "jeryu").filter((pane) => hasJeryuSignal(pane)));
  if (isLive(runtime, "fleet-board")) {
    for (const repo of runtime.fleetBoard.repos) {
      cards.push(repoCard(repo));
      cards.push(...repoIssueCards(repo));
    }
  }
  cards.push(...priorityIssueCards(runtime).filter((pane) => hasJeryuSignal(pane)));
  cards.push(...resourceOpportunityCards(runtime));
  cards.push(...evidenceCards(runtime).filter((pane) => hasJeryuSignal(pane)));
  cards.push(...degradedCards(runtime, ["ecosystem", "fleet-board", "agent-sessions", "process-observations", "attention", "incidents"]));
  return cards;
}

function priorityIssueCards(runtime: RuntimeState): CardCandidate[] {
  const cards: CardCandidate[] = [];
  if (isLive(runtime, "fleet-board")) {
    for (const repo of runtime.fleetBoard.repos) {
      cards.push(...repoIssueCards(repo));
    }
  }
  if (isLive(runtime, "control-plane")) {
    for (const repo of runtime.controlPlane.repos) {
      if (repo.failingAudit || repo.stuckActivity || repo.overdueActivity || repo.health === "blocked" || repo.health === "degraded") {
        cards.push(card({
          id: `issue:control:${repo.name}`,
          title: `${repo.name} control-plane issue`,
          kind: "adapter_health",
          cardType: "issue",
          risk: repo.failingAudit || repo.stuckActivity ? "high" : "medium",
          priority: repo.failingAudit || repo.stuckActivity ? 930 : 760,
          headline: repo.auditReason ?? `${repo.name} reported ${repo.health} control-plane health.`,
          chips: [repo.health, repo.failingAudit ? "failing_audit" : "audit_visible", repo.stuckActivity ? "stuck" : "not_stuck"],
          counters: [
            { label: "workcells", value: repo.activeWorkcells },
            { label: "changed", value: repo.latestChangedFiles.length },
            { label: "rerun", value: repo.rerunCommand },
          ],
          sourceBadges: [liveBadge("control-plane")],
          reasonText: "Control-plane issues rank high when an audit is failing, activity is stuck, or a repo is degraded.",
        }));
      }
    }
  }
  if (isLive(runtime, "incidents")) {
    for (const incident of runtime.incidents.filter((item) => item.state !== "closed")) {
      cards.push(incidentCard(incident));
    }
  }
  return cards;
}

function codeGraphCards(runtime: RuntimeState): CardCandidate[] {
  const cards: CardCandidate[] = [];
  if (isLive(runtime, "fleet-board") && runtime.fleetBoard.repos.length > 0) {
    cards.push(...fleetGraphCards(runtime));
    for (const repo of runtime.fleetBoard.repos.slice(0, 8)) {
      cards.push(card({
        id: `graph:repo:${repo.name}`,
        title: `${repo.name} graph cache`,
        kind: "graph",
        cardType: "graph",
        risk: repo.topFindings.length > 0 || repo.caps.length > 0 ? "high" : "low",
        priority: repo.topFindings.length > 0 || repo.caps.length > 0 ? 850 : 560,
        headline: `${repo.name} cached graph source: ${firstNonEmpty(repo.topFindings) ?? firstNonEmpty(repo.topToolOpportunities) ?? "no findings in fleet-board record"}.`,
        chips: ["cached", repo.scoreFreshness, repo.jeryuGate],
        counters: [
          { label: "findings", value: repo.topFindings.length },
          { label: "opps", value: repo.topToolOpportunities.length },
          { label: "score", value: repo.score ?? "n/a" },
        ],
        sourceBadges: [liveBadge("fleet-board")],
        reasonText: "Code graph cards use cached fleet-board graph/finding records only.",
      }));
    }
  }
  if (isLive(runtime, "ecosystem") && runtime.toolAssets.length > 0) {
    const byRepo = new Map<string, number>();
    for (const tool of runtime.toolAssets) {
      byRepo.set(tool.repo ?? "unowned", (byRepo.get(tool.repo ?? "unowned") ?? 0) + 1);
    }
    for (const [repo, count] of byRepo) {
      cards.push(card({
        id: `graph:tools:${repo}`,
        title: `${repo} tool graph`,
        kind: "graph",
        cardType: "graph",
        risk: "low",
        priority: 540,
        headline: `${count} ecosystem tool nodes are cached for ${repo}.`,
        chips: ["ecosystem", "tool_nodes", "cached"],
        counters: [{ label: "tools", value: count }],
        sourceBadges: [liveBadge("ecosystem")],
        reasonText: "Tool graph cards use observed ecosystem tool records only.",
      }));
    }
  }
  cards.push(...degradedCards(runtime, ["fleet-board", "ecosystem"]));
  return cards;
}
