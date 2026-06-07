import type { RuntimeState } from "../runtime";
import type { AgentSessionSummary, ProcessObservationSummary, WorkItem } from "../types";
import type { NowIntent } from "./command-router";
import {
  card,
  isLive,
  isActiveSession,
  liveBadge,
  textMatches,
  type CardCandidate,
} from "./command-scene-helpers";

export function workerCards(runtime: RuntimeState, scope: NowIntent | "jeryu"): CardCandidate[] {
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

export function workQueueCards(runtime: RuntimeState): CardCandidate[] {
  if (!isLive(runtime, "work-orders")) {
    return [];
  }
  return runtime.workItems
    .filter((item) => item.state !== "completed" && item.state !== "cancelled")
    .map(workCard);
}

export function workCard(item: WorkItem): CardCandidate {
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

export function agentSessionCard(session: AgentSessionSummary): CardCandidate {
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

export function processCard(process: ProcessObservationSummary): CardCandidate {
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
