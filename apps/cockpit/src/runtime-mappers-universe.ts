import type { ApiFleetBoard, ApiUniverse } from "./runtime-api";
import type { FleetBoardError, FleetBoardRepo, FleetBoardSnapshot, UniverseSnapshot } from "./types";

export function mapUniverse(universe: ApiUniverse): UniverseSnapshot {
  return {
    live: universe.live,
    bootstrapTui: {
      live: universe.bootstrapTui.live,
      observedCoverage: universe.bootstrapTui.observedCoverage,
      activeRepos: universe.bootstrapTui.activeRepos,
      repoScores: universe.bootstrapTui.repoScores,
      placements: universe.bootstrapTui.placements,
      degradedSlices: universe.bootstrapTui.degradedSlices,
      degradedReason: universe.bootstrapTui.degradedReason,
    },
    ecosystem: universe.ecosystem,
  };
}

export function mapFleetBoard(board: ApiFleetBoard): FleetBoardSnapshot {
  return {
    generatedAtNote: board.generated_at_note,
    schema: board.schema,
    repos: board.repos.map(mapFleetBoardRepo),
    totals: {
      repoCount: board.totals.repo_count,
      audited: board.totals.audited,
      failed: board.totals.failed,
      minScore: board.totals.min_score ?? undefined,
      maxScore: board.totals.max_score ?? undefined,
      averageScore: board.totals.average_score ?? undefined,
      totalHardFindings: board.totals.total_hard_findings,
      belowThreshold: board.totals.below_threshold,
    },
    errors: (board.errors ?? []).map(mapFleetBoardError),
  };
}

function mapFleetBoardRepo(repo: ApiFleetBoard["repos"][number]): FleetBoardRepo {
  return {
    name: repo.name,
    path: repo.path,
    branch: repo.branch ?? undefined,
    host: repo.host ?? undefined,
    dirty: repo.dirty ?? undefined,
    dirtyFiles: repo.dirty_files ?? repo.dirty ?? undefined,
    lastCommitSha: repo.last_commit_sha ?? undefined,
    headSha: repo.head_sha ?? repo.last_commit_sha ?? undefined,
    lastCommitWhen: repo.last_commit_when ?? undefined,
    lastCommitEpoch: repo.last_commit_epoch ?? undefined,
    lastBinaryEpoch: repo.last_binary_epoch ?? undefined,
    lastTestsEpoch: repo.last_tests_epoch ?? undefined,
    version: repo.version ?? undefined,
    ciConfigured: repo.ci_configured,
    score: repo.score ?? null,
    raw: repo.raw ?? null,
    caps: repo.caps ?? [],
    capsCount: repo.caps_count ?? repo.caps?.length ?? null,
    hardFindings: repo.hard_findings ?? null,
    hlLevel: repo.hl_level ?? null,
    scoreSource: repo.score_source ?? null,
    scoreFreshness: repo.score_freshness,
    activeRunnerCount: repo.active_runner_count,
    runnerBusy: repo.runner_busy,
    runnerHint: repo.runner_hint ?? undefined,
    mainCiAgeSeconds: repo.main_ci_age_seconds ?? undefined,
    jeryuGate: repo.jeryu_gate,
    artifactState: {
      local: repo.artifact_state.local,
      devCanary: repo.artifact_state.dev_canary,
      prod: repo.artifact_state.prod,
      release: repo.artifact_state.release,
      promote: repo.artifact_state.promote,
      latestSha: repo.artifact_state.latest_sha ?? undefined,
    },
    topFindings: repo.top_findings ?? [],
    topToolOpportunities: repo.top_tool_opportunities ?? [],
  };
}

function mapFleetBoardError(error: NonNullable<ApiFleetBoard["errors"]>[number]): FleetBoardError {
  return {
    path: error.path,
    error: error.error,
  };
}
