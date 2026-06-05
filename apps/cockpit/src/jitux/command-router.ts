export type NowIntent =
  | "system_report"
  | "jeryu"
  | "live_agents"
  | "work_queue"
  | "approvals"
  | "task_intake"
  | "bug_audit"
  | "jailgun_frontend_improvement"
  | "repo_create"
  | "code_graph"
  | "reporting"
  | "queue_blockers";

export type RoutedNowCommand = {
  intent: NowIntent;
  normalized: string;
  title: string;
};

const jeryuAliases = [
  "jeryu",
  "jeryu info",
  "show me info on jeryu",
  "show jeryu status",
  "show jeryu health",
  "show jeryu repos",
  "show jankurai scores",
  "jeryu status",
  "jeryu health",
];

export function routeNowCommand(prompt?: string): RoutedNowCommand {
  const normalized = normalizePrompt(prompt);
  if (normalized.length === 0) {
    return route("system_report", normalized, "System Status Card Deck");
  }
  if (jeryuAliases.includes(normalized)) {
    return route("jeryu", normalized, "Active Jeryu Drilldown");
  }
  if (/\b(show\s+me\s+what\s+you\s+can\s+do|what\s+can\s+you\s+do|update\s+me\s+on\s+the\s+system|system\s+update|status\s+report)\b/.test(normalized)) {
    return route("system_report", normalized, "System Status Card Deck");
  }
  if (/\b(reporting|report|briefing|summary)\b/.test(normalized)) {
    return route("reporting", normalized, "Reporting Card Deck");
  }
  if (/\b(graph|code\s+graph|codebase\s+graph|code\s+base\s+graph|dependency\s+graph|plot)\b/.test(normalized)) {
    return route("code_graph", normalized, "Cached Code Graph Cards");
  }
  if (/\b(live\s+agents?|workers?|agent\s+sessions?|terminals?|logs?)\b/.test(normalized)) {
    return route("live_agents", normalized, "Live Agent Card Deck");
  }
  if (/\b(work\s+queue|work\s+orders?|queue|blockers?|blocking)\b/.test(normalized)) {
    return route("work_queue", normalized, "Work Queue Card Deck");
  }
  if (/\b(approvals?|approve|deny|approval\s+gate)\b/.test(normalized)) {
    return route("approvals", normalized, "Approval Card Deck");
  }
  if (/\b(fresh\s+repo|new\s+repo|start\s+a\s+fresh\s+repo|create\s+(a\s+)?repo)\b/.test(normalized)) {
    return route("repo_create", normalized, "Fresh Repo Draft Cards");
  }
  if (/\bbug\s+audit\b/.test(normalized)) {
    return route("bug_audit", normalized, "Bug Audit Approval Draft");
  }
  if (/\bjailgun\b/.test(normalized) && /\b(frontend|cockpit|jmcp\s+frontend|improvement)\b/.test(normalized)) {
    return route("jailgun_frontend_improvement", normalized, "Jailgun Frontend Improvement Draft");
  }
  if (/^(please\s+)?(start|submit|queue|run|launch|do|create|plan|build)\b/.test(normalized) || /\b(new\s+task|ask\s+for\s+a\s+new\s+task|task\s+intake)\b/.test(normalized)) {
    return route("task_intake", normalized, "Task Intake Draft Cards");
  }
  return route("system_report", normalized, "System Status Card Deck");
}

export function isJeryuAlias(prompt: string): boolean {
  return routeNowCommand(prompt).intent === "jeryu";
}

function route(intent: NowIntent, normalized: string, title: string): RoutedNowCommand {
  return { intent, normalized, title };
}

function normalizePrompt(prompt?: string): string {
  return (prompt ?? "")
    .trim()
    .toLowerCase()
    .replace(/[?.!,;:]+/g, "")
    .replace(/\s+/g, " ");
}
