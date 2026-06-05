import type { RuntimeState } from "../runtime";
import type {
  AgentSessionSummary,
  FleetBoardRepo,
  ProcessObservationSummary,
  RuntimeIncident,
  RuntimeSourceStatus,
  WorkItem,
} from "../types";
import { routeNowCommand, type NowIntent, type RoutedNowCommand } from "./command-router";
import { reason, seqFrame } from "./queue-blocker-frames";
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

type CardCandidate = Omit<PaneVM, "rank" | "lod" | "status"> & {
  priority: number;
  status?: PaneVM["status"];
  lod?: PaneVM["lod"];
  reason: DeckRankReason;
  evidence?: Extract<JituxFrame, { type: "evidence.attach" }>["evidence"];
  actions?: PreparedAction[];
};

const emittedAt = "2026-06-03T15:00:00.000Z";

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

function repoIssueCards(repo: FleetBoardRepo): CardCandidate[] {
  const cards: CardCandidate[] = [];
  const hasCap = repoHasCap(repo);
  const hardFindings = repoHardFindings(repo);
  const gateBad = repoGateBad(repo);
  const stale = repoScoreIsStale(repo);
  const failedRemote = repoFailedRemote(repo);
  if (!(hasCap || hardFindings > 0 || gateBad || stale || failedRemote || (repo.score ?? 100) < 65)) {
    return cards;
  }
  const headline = firstNonEmpty(repo.topFindings) ?? repoOpportunityText(repo) ?? `${repo.name} needs attention: ${repoIssueLabels(repo).join(", ")}.`;
  const issueLabels = [
    failedRemote ? "github_remote_failure" : null,
    hasCap ? "jankurai_cap" : null,
    hardFindings > 0 ? "hard_findings" : null,
    gateBad ? `gate_${repo.jeryuGate}` : null,
    stale ? repo.scoreFreshness : null,
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
      : "Jankurai caps, hard findings, stale scores, and broken Jeryu gates are high-priority repo signals.",
  }));
  return cards;
}

function resourceOpportunityCards(runtime: RuntimeState): CardCandidate[] {
  if (!isLive(runtime, "fleet-board")) {
    return [];
  }

  return runtime.fleetBoard.repos
    .map((repo) => ({ repo, task: repoOpportunityText(repo) }))
    .filter((item): item is { repo: FleetBoardRepo; task: string } => (
      item.task !== null &&
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

function fleetGraphCards(runtime: RuntimeState): CardCandidate[] {
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

function repoCard(repo: FleetBoardRepo): CardCandidate {
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

function workerCards(runtime: RuntimeState, scope: NowIntent | "jeryu"): CardCandidate[] {
  const cards: CardCandidate[] = [];
  if (isLive(runtime, "agent-sessions")) {
    for (const session of runtime.agentSessions.filter((item) => isActiveSession(item))) {
      if (scope === "jeryu" && !textMatches([session.provider, session.subject ?? "", session.sessionKey].join(" "), "jeryu") && !textMatches(session.subject ?? "", "jankurai")) {
        continue;
      }
      cards.push(agentSessionCard(session));
    }
  }
  if (isLive(runtime, "process-observations")) {
    for (const process of runtime.processObservations.filter((item) => item.stuck || item.status === "running" || item.status === "failed")) {
      if (scope === "jeryu" && !textMatches([process.processKey, process.command ?? "", process.diagnosticClass ?? ""].join(" "), "jeryu") && !textMatches(process.command ?? "", "jankurai")) {
        continue;
      }
      cards.push(processCard(process));
    }
  }
  if (isLive(runtime, "control-plane")) {
    for (const cell of runtime.controlPlane.activeWorkcells) {
      if (scope === "jeryu" && !textMatches([cell.repo, cell.task, cell.agent].join(" "), "jeryu") && !textMatches(cell.task, "jankurai")) {
        continue;
      }
      cards.push(card({
        id: `worker:workcell:${cell.id}`,
        title: `${cell.agent} workcell`,
        kind: "jeryu",
        cardType: "worker",
        risk: cell.stuck ? "high" : cell.overdue ? "medium" : "low",
        priority: cell.stuck ? 940 : cell.overdue ? 780 : 650,
        headline: `${cell.task} on ${cell.repo}; status ${cell.status}; pty ${cell.pty}.`,
        chips: [cell.repo, cell.status, cell.persistence, cell.pty],
        counters: [
          { label: "slice", value: cell.allowedSlice.length },
          { label: "stuck", value: cell.stuck ? "yes" : "no" },
          { label: "rerun", value: cell.rerunCommand },
        ],
        sourceBadges: [liveBadge("control-plane")],
        reasonText: "Active workcells rank by stuck and overdue state from the control-plane source.",
      }));
    }
  }
  return cards;
}

function workQueueCards(runtime: RuntimeState): CardCandidate[] {
  if (!isLive(runtime, "work-orders")) {
    return [];
  }
  return runtime.workItems
    .filter((item) => item.state !== "completed" && item.state !== "cancelled")
    .map(workCard);
}

function approvalCards(runtime: RuntimeState): CardCandidate[] {
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

function evidenceCards(runtime: RuntimeState): CardCandidate[] {
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

function taskIntakeCards(prompt: string): CardCandidate[] {
  const clean = prompt.trim() || "new task";
  return [
    draftCard("task:intake", "Task intake draft", "taskDraft", clean, "Clarify repository, desired outcome, allowed mutation level, and proof lane before any work starts.", [
      "Which repo or codebase owns this task?",
      "What result should count as done?",
      "Should this stay read-only until explicit approval?",
    ]),
  ];
}

function bugAuditCards(prompt: string): CardCandidate[] {
  return [
    draftCard("task:bug-audit", "Repo bank bug scan draft", "taskDraft", prompt, "Maps to the existing repo-bank-bug-scan governed action and waits for approval before submission.", [
      "Confirm the repo scope for the bug audit.",
      "Confirm whether this should stay evidence-only.",
      "Confirm the approval actor.",
    ], [{
      id: "draft.repo-bank-bug-scan",
      label: "Prepare repo-bank-bug-scan",
      command: "jmcp.autonomous-actions.prepare repo-bank-bug-scan",
      safety: "approval_required",
      ready: false,
      requiresApproval: true,
      reason: "The existing action is governed and must be approved before start.",
      previewRef: "jmcp://autonomous-actions/repo-bank-bug-scan",
    }]),
  ];
}

function jailgunFrontendCards(prompt: string): CardCandidate[] {
  return [
    draftCard("task:jailgun-frontend", "Jailgun JMCP frontend improvement draft", "approval", prompt, "Governed ZYAL/Jailgun improvement draft with deterministic branch naming and approval required before execution.", [
      "Confirm the JMCP frontend scope.",
      "Confirm the improvement objective.",
      "Confirm branch name: jeryu/jailgun-improve-jmcp-frontend.",
    ], [{
      id: "draft.jailgun-frontend-improvement",
      label: "Prepare Jailgun frontend approval",
      command: "jmcp.autonomous-actions.prepare jailgun-improve-jmcp-frontend",
      safety: "approval_required",
      ready: false,
      requiresApproval: true,
      reason: "Jailgun-backed improvement work can mutate local branches and must be approved first.",
      previewRef: "jmcp://autonomous-actions/jailgun-improve-jmcp-frontend",
    }]),
  ];
}

function repoCreateCards(prompt: string): CardCandidate[] {
  const name = repoNameFromPrompt(prompt);
  return [
    draftCard("repo:create", name ? `Create ${name}` : "Fresh repo name needed", "repoCreateDraft", prompt, name ? `Draft creation request for Jeryu repo ${name}.` : "No repo name was captured; ask for the repo name before any creation step.", [
      name ? `Confirm repo name: ${name}.` : "What should the new repo be named?",
      "Should Jeryu be the only repo target?",
      "Which initial visibility and proof lane should apply?",
    ], [{
      id: "draft.repo-create",
      label: "Prepare repo creation",
      command: name ? `jmcp.jeryu.repo-create.prepare ${name}` : "jmcp.jeryu.repo-create.prepare",
      safety: "approval_required",
      ready: false,
      requiresApproval: true,
      reason: "Repo creation is a durable mutation and must remain a draft until confirmed.",
      previewRef: "jmcp://repo-create/draft",
    }]),
  ];
}

function draftCard(id: string, title: string, cardType: DeckCardType, prompt: string, headline: string, questions: string[], actions: PreparedAction[] = []): CardCandidate {
  return card({
    id,
    title,
    kind: "task",
    cardType,
    risk: actions.length > 0 ? "medium" : "low",
    priority: 900,
    headline,
    chips: ["draft", "clarifying_questions", "approval_first"],
    counters: [
      { label: "questions", value: questions.length },
      { label: "actions", value: actions.length },
      { label: "prompt", value: prompt.trim().length > 0 ? "captured" : "missing" },
    ],
    sourceBadges: [{ source: "user prompt", status: "draft", reason: prompt.trim() || "new task request" }],
    reasonText: "Task-starting prompts create draft cards first so governed work does not start without clarification and approval.",
    evidence: questions.map((question, index) => ({
      id: `${id}:question:${index + 1}`,
      label: question,
      uri: `jmcp://task-draft/${encodeURIComponent(id)}/question/${index + 1}`,
      capturedAt: emittedAt,
    })),
    actions,
  });
}

function workCard(item: WorkItem): CardCandidate {
  return card({
    id: `work:${item.id}`,
    title: item.title,
    kind: "queue",
    cardType: "taskDraft",
    risk: item.risk,
    priority: item.state === "failed" || item.state === "blocked" ? 900 : item.state === "awaitingapproval" ? 760 : 540,
    headline: `${item.id} is ${item.state}; owner ${item.owner}; lease ${item.lease}.`,
    chips: [item.state, item.owner, item.repo ?? "repo_unobserved"],
    counters: [
      { label: "evidence", value: item.evidence },
      { label: "updated", value: item.updated },
      { label: "branch", value: item.branch ?? "n/a" },
    ],
    sourceBadges: [liveBadge("work-orders")],
    reasonText: "Work cards are emitted only from live work-order records and rank failed or blocked work first.",
  });
}

function agentSessionCard(session: AgentSessionSummary): CardCandidate {
  return card({
    id: `worker:session:${session.id}`,
    title: session.subject ?? session.sessionKey,
    kind: "jeryu",
    cardType: "worker",
    risk: session.status === "failed" ? "high" : session.status === "waiting" ? "medium" : "low",
    priority: session.status === "failed" ? 920 : session.status === "running" ? 760 : 620,
    headline: `${session.provider} session ${session.status}; stream ${session.streamUri ?? "unobserved"}.`,
    chips: [session.provider, session.status, session.processKey ?? "process_unobserved"],
    counters: [
      { label: "started", value: session.startedAt },
      { label: "updated", value: session.updatedAt },
    ],
    sourceBadges: [liveBadge("agent-sessions")],
    reasonText: "Agent session cards are emitted only from live agent-session records.",
  });
}

function processCard(process: ProcessObservationSummary): CardCandidate {
  return card({
    id: `terminal:process:${process.id}`,
    title: process.processKey,
    kind: "jeryu",
    cardType: "terminal",
    risk: process.stuck || process.status === "failed" ? "high" : "low",
    priority: process.stuck || process.status === "failed" ? 950 : 700,
    headline: `${process.status}${process.stuck ? " and stuck" : ""}; ${process.command ?? "command not captured"}.`,
    chips: [process.status, process.pty ?? "pty_unobserved", process.diagnosticClass ?? "diagnostic_unobserved"],
    counters: [
      { label: "stuck", value: process.stuck ? "yes" : "no" },
      { label: "updated", value: process.updatedAt },
    ],
    sourceBadges: [liveBadge("process-observations")],
    reasonText: "Process cards rank high when live process observations report stuck or failed state.",
  });
}

function incidentCard(incident: RuntimeIncident): CardCandidate {
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

function degradedCards(runtime: RuntimeState, keys: string[]): CardCandidate[] {
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
      reasonText: "Degraded-source cards are explicit placeholders for unavailable sources and never stand in for live data.",
    }));
}

function card(input: {
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

function preparedTabs(cardType: DeckCardType, evidenceRefs?: unknown[], actions?: PreparedAction[]): PreparedTab[] {
  const tabs: PreparedTab[] = [];
  if (evidenceRefs && evidenceRefs.length > 0) tabs.push("evidence");
  if (cardType === "worker" || cardType === "terminal" || cardType === "repo" || cardType === "degradedSource" || cardType === "graph") tabs.push("systems");
  if (actions && actions.length > 0) tabs.push("actions");
  if (tabs.length === 0) tabs.push("raw");
  return tabs;
}

function reasonFromPriority(priority: number, explanation: string, risk: PaneRisk): DeckRankReason {
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

function evidence(label: string, source: string, uri: string): Extract<JituxFrame, { type: "evidence.attach" }>["evidence"] {
  return [{ id: `evidence:${label}:${source}`, label, uri, capturedAt: emittedAt }];
}

function repoNameFromPrompt(prompt: string): string | null {
  const match = prompt.match(/\b(?:repo|repository)\s+(?:called|named)?\s*([a-z0-9_.-]+)/i) ?? prompt.match(/\b(?:fresh|new)\s+repo\s+([a-z0-9_.-]+)/i);
  return match?.[1] ?? null;
}

function sourceStatus(runtime: RuntimeState, key: string): RuntimeSourceStatus | undefined {
  return runtime.sourceStatuses.find((source) => source.key === key);
}

function isLive(runtime: RuntimeState, key: string): boolean {
  return sourceStatus(runtime, key)?.state === "live";
}

function liveBadge(source: string): SourceBadge {
  return { source, status: "live" };
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
}

function repoHasCap(repo: FleetBoardRepo): boolean {
  return repo.caps.length > 0 || (repo.capsCount ?? 0) > 0;
}

function repoHardFindings(repo: FleetBoardRepo): number {
  return repo.hardFindings ?? 0;
}

function repoGateBad(repo: FleetBoardRepo): boolean {
  return repo.jeryuGate !== "green" && repo.jeryuGate !== "pass";
}

function repoScoreIsStale(repo: FleetBoardRepo): boolean {
  return repo.scoreFreshness === "outdated" || repo.scoreFreshness === "unscored";
}

function repoFailedRemote(repo: FleetBoardRepo): boolean {
  return repo.host?.toLowerCase() === "github" && (repoGateBad(repo) || repo.topFindings.some((finding) => /github|push|pr|ci|remote/i.test(finding)));
}

function repoIssueLabels(repo: FleetBoardRepo): string[] {
  return [
    repoFailedRemote(repo) ? "github_remote_failure" : null,
    repoHasCap(repo) ? "jankurai_cap" : null,
    repoHardFindings(repo) > 0 ? "hard_findings" : null,
    repoGateBad(repo) ? `gate_${repo.jeryuGate}` : null,
    repoScoreIsStale(repo) ? repo.scoreFreshness : null,
    (repo.score ?? 100) < 65 ? "score_below_threshold" : null,
  ].filter((item): item is string => item !== null);
}

function repoOpportunityText(repo: FleetBoardRepo): string | null {
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
  return null;
}

function repoOpportunityPriority(repo: FleetBoardRepo): number {
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

function textMatches(value: string, token: string): boolean {
  return value.toLowerCase().includes(token.toLowerCase());
}

function isActiveSession(session: AgentSessionSummary): boolean {
  return session.status === "running" || session.status === "waiting" || session.status === "failed";
}

function jeryuAgentSessions(runtime: RuntimeState): AgentSessionSummary[] {
  return runtime.agentSessions.filter((session) => textMatches([session.provider, session.subject ?? "", session.sessionKey].join(" "), "jeryu") || textMatches(session.subject ?? "", "jankurai"));
}

function jeryuProcessObservations(runtime: RuntimeState): ProcessObservationSummary[] {
  return runtime.processObservations.filter((process) => textMatches([process.processKey, process.command ?? "", process.diagnosticClass ?? ""].join(" "), "jeryu") || textMatches(process.command ?? "", "jankurai"));
}

function hasJeryuSignal(pane: CardCandidate): boolean {
  const text = `${pane.id} ${pane.title} ${pane.preview.headline} ${pane.preview.chips.join(" ")}`.toLowerCase();
  return text.includes("jeryu") || text.includes("jankurai") || text.includes("fleet");
}
