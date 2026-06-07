import { card, emittedAt, repoNameFromPrompt, type CardCandidate } from "./command-scene-helpers";
import type { DeckCardType, PreparedAction } from "./types";

export function taskIntakeCards(prompt: string): CardCandidate[] {
  const clean = prompt.trim() || "new task";
  return [
    draftCard("task:intake", "Task intake draft", "taskDraft", clean, "Clarify repository, desired outcome, allowed mutation level, and proof lane before any work starts.", [
      "Which repo or codebase owns this task?",
      "What result should count as done?",
      "Should this stay read-only until explicit approval?",
    ]),
  ];
}

export function bugAuditCards(prompt: string): CardCandidate[] {
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

export function jailgunFrontendCards(prompt: string): CardCandidate[] {
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

export function repoCreateCards(prompt: string): CardCandidate[] {
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
