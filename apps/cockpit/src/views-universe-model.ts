import type { FleetBoardRepo, Health } from "./types";

export type UniverseCardModel = {
  repo: string;
  score: number;
  health: Health;
  coverage: number;
  toolCount: number;
  currentTask: string;
  branch: string;
  pool: string;
  placement: string;
  degradedReason?: string;
  board?: FleetBoardRepo;
};

function repoKey(value: string) {
  return value.trim().toLowerCase();
}

export function displayRepoLabel(value: string) {
  const lower = value.trim().toLowerCase();
  if (lower === "jmcp") {
    return "JMCP";
  }
  return lower.slice(0, 1).toUpperCase() + lower.slice(1);
}

function boardHealth(score?: number | null): Health {
  if (score === undefined || score === null) {
    return "blocked";
  }
  if (score >= 85) {
    return "nominal";
  }
  if (score >= 65) {
    return "watch";
  }
  if (score >= 35) {
    return "degraded";
  }
  return "blocked";
}

export function shortSha(value?: string | null) {
  return value ? value.slice(0, 12) : "unobserved";
}

export function formatEpoch(value?: number | null) {
  if (!value) {
    return "unobserved";
  }
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return "unobserved";
  }
  return date.toISOString().slice(0, 16) + "Z";
}

export function formatAgeSeconds(value?: number | null) {
  if (value === undefined || value === null) {
    return "unobserved";
  }
  if (value < 60) {
    return `${value}s`;
  }
  if (value < 60 * 60) {
    return `${Math.floor(value / 60)}m`;
  }
  if (value < 60 * 60 * 24) {
    return `${Math.floor(value / (60 * 60))}h`;
  }
  return `${Math.floor(value / (60 * 60 * 24))}d`;
}

export function artifactSummary(repo: FleetBoardRepo) {
  const state = repo.artifactState;
  return `local ${state.local}, canary ${state.devCanary}, prod ${state.prod}`;
}

export function capsLabel(repo: FleetBoardRepo) {
  if (repo.caps.length > 0) {
    return repo.caps.join(", ");
  }
  return `${repo.capsCount ?? 0}`;
}

export function mergeUniverseCards(
  repoScores: Array<{
    repo: string;
    toolCount: number;
    score: number;
    coverage: number;
    currentTask: string;
    branch: string;
    pool: string;
    placement: string;
    health: Health;
    degradedReason?: string;
  }>,
  boardRepos: FleetBoardRepo[],
): UniverseCardModel[] {
  const boardByRepo = new Map(boardRepos.map((repo) => [repoKey(repo.name), repo]));
  const used = new Set<string>();
  const liveCards = repoScores.map((repo) => {
    const board = boardByRepo.get(repoKey(repo.repo));
    if (board) {
      used.add(repoKey(board.name));
    }
    return {
      repo: repo.repo,
      score: repo.score,
      health: repo.health,
      coverage: repo.coverage,
      toolCount: repo.toolCount,
      currentTask: repo.currentTask,
      branch: repo.branch,
      pool: repo.pool,
      placement: repo.placement,
      degradedReason: repo.degradedReason,
      board,
    };
  });
  const boardOnlyCards = boardRepos
    .filter((repo) => !used.has(repoKey(repo.name)))
    .map((repo) => ({
      repo: repo.name,
      score: repo.score ?? 0,
      health: boardHealth(repo.score),
      coverage: repo.score ?? 0,
      toolCount: repo.ciConfigured ? 1 : 0,
      currentTask: repo.topFindings[0] ?? "fleet board ingest",
      branch: repo.branch ?? "unobserved",
      pool: repo.host ?? "unassigned",
      placement: repo.path,
      degradedReason: repo.scoreSource ?? repo.topFindings[0] ?? repo.topToolOpportunities[0] ?? "fleet board only",
      board: repo,
    }));
  return [...liveCards, ...boardOnlyCards];
}
