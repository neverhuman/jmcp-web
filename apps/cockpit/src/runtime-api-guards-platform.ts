import type { ApiControlPlane, ApiEcosystem, ApiFleetBoard, ApiUniverse } from "./runtime-api";
import type { Health, ScoreFreshness } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isHealth(value: unknown): value is Health {
  return value === "nominal" || value === "watch" || value === "blocked" || value === "degraded";
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isString(value);
}

function isScoreFreshness(value: unknown): value is ScoreFreshness {
  return value === "fresh" || value === "cached" || value === "unscored" || value === "outdated";
}

function isEcosystemValue(value: unknown): value is ApiEcosystem {
  return (
    isRecord(value) &&
    Array.isArray(value.tools) &&
    value.tools.every((tool) => isRecord(tool) && isString(tool.name) && isString(tool.className)) &&
    typeof value.live === "boolean" &&
    (value.degradedReason === undefined || value.degradedReason === null || isString(value.degradedReason))
  );
}

function isFleetBoardRepo(value: unknown): value is ApiFleetBoard["repos"][number] {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.path) &&
    (value.branch === undefined || value.branch === null || isString(value.branch)) &&
    (value.host === undefined || value.host === null || isString(value.host)) &&
    (value.dirty === undefined || value.dirty === null || isNumber(value.dirty)) &&
    (value.dirty_files === undefined || value.dirty_files === null || isNumber(value.dirty_files)) &&
    (value.last_commit_sha === undefined || value.last_commit_sha === null || isString(value.last_commit_sha)) &&
    (value.head_sha === undefined || value.head_sha === null || isString(value.head_sha)) &&
    (value.last_commit_when === undefined || value.last_commit_when === null || isString(value.last_commit_when)) &&
    (value.last_commit_epoch === undefined || value.last_commit_epoch === null || isNumber(value.last_commit_epoch)) &&
    (value.last_binary_epoch === undefined || value.last_binary_epoch === null || isNumber(value.last_binary_epoch)) &&
    (value.last_tests_epoch === undefined || value.last_tests_epoch === null || isNumber(value.last_tests_epoch)) &&
    (value.version === undefined || value.version === null || isString(value.version)) &&
    typeof value.ci_configured === "boolean" &&
    (value.score === undefined || value.score === null || isNumber(value.score)) &&
    (value.raw === undefined || value.raw === null || isNumber(value.raw)) &&
    (value.caps === undefined || isStringArray(value.caps)) &&
    (value.caps_count === undefined || value.caps_count === null || isNumber(value.caps_count)) &&
    (value.hard_findings === undefined || value.hard_findings === null || isNumber(value.hard_findings)) &&
    (value.hl_level === undefined || value.hl_level === null || isString(value.hl_level)) &&
    (value.score_source === undefined || value.score_source === null || isString(value.score_source)) &&
    isScoreFreshness(value.score_freshness) &&
    isNumber(value.active_runner_count) &&
    typeof value.runner_busy === "boolean" &&
    (value.runner_hint === undefined || value.runner_hint === null || isString(value.runner_hint)) &&
    (value.main_ci_age_seconds === undefined || value.main_ci_age_seconds === null || isNumber(value.main_ci_age_seconds)) &&
    isString(value.jeryu_gate) &&
    isFleetBoardArtifactState(value.artifact_state) &&
    (value.top_findings === undefined || isStringArray(value.top_findings)) &&
    (value.top_tool_opportunities === undefined || isStringArray(value.top_tool_opportunities))
  );
}

function isFleetBoardArtifactState(value: unknown): value is ApiFleetBoard["repos"][number]["artifact_state"] {
  return (
    isRecord(value) &&
    isString(value.local) &&
    isString(value.dev_canary) &&
    isString(value.prod) &&
    isString(value.release) &&
    isString(value.promote) &&
    (value.latest_sha === undefined || value.latest_sha === null || isString(value.latest_sha))
  );
}

function isFleetBoardValue(value: unknown): value is ApiFleetBoard {
  return (
    isRecord(value) &&
    isString(value.generated_at_note) &&
    isString(value.schema) &&
    Array.isArray(value.repos) &&
    value.repos.every(isFleetBoardRepo) &&
    isRecord(value.totals) &&
    isNumber(value.totals.repo_count) &&
    isNumber(value.totals.audited) &&
    isNumber(value.totals.failed) &&
    (value.totals.min_score === undefined || value.totals.min_score === null || isNumber(value.totals.min_score)) &&
    (value.totals.max_score === undefined || value.totals.max_score === null || isNumber(value.totals.max_score)) &&
    (value.totals.average_score === undefined || value.totals.average_score === null || isNumber(value.totals.average_score)) &&
    isNumber(value.totals.total_hard_findings) &&
    isNumber(value.totals.below_threshold) &&
    (value.errors === undefined ||
      (Array.isArray(value.errors) &&
        value.errors.every((error) => isRecord(error) && isString(error.path) && isString(error.error))))
  );
}

function isUniverseValue(value: unknown): value is ApiUniverse {
  return (
    isRecord(value) &&
    typeof value.live === "boolean" &&
    isRecord(value.bootstrapTui) &&
    typeof value.bootstrapTui.live === "boolean" &&
    isNumber(value.bootstrapTui.observedCoverage) &&
    Array.isArray(value.bootstrapTui.activeRepos) &&
    value.bootstrapTui.activeRepos.every(
      (repo) =>
        isRecord(repo) &&
        isString(repo.repo) &&
        isNumber(repo.toolCount) &&
        isNumber(repo.score) &&
        isHealth(repo.health),
    ) &&
    Array.isArray(value.bootstrapTui.repoScores) &&
    value.bootstrapTui.repoScores.every(
      (repo) =>
        isRecord(repo) &&
        isString(repo.repo) &&
        isNumber(repo.toolCount) &&
        isNumber(repo.score) &&
        isNumber(repo.coverage) &&
        isString(repo.currentTask) &&
        isString(repo.branch) &&
        isString(repo.pool) &&
        isString(repo.placement) &&
        isHealth(repo.health) &&
        (repo.degradedReason === undefined || repo.degradedReason === null || isString(repo.degradedReason)),
    ) &&
    Array.isArray(value.bootstrapTui.placements) &&
    value.bootstrapTui.placements.every(
      (placement) =>
        isRecord(placement) &&
        isString(placement.agent) &&
        isString(placement.repo) &&
        isString(placement.currentTask) &&
        isString(placement.branch) &&
        isString(placement.pool) &&
        isString(placement.placement) &&
        isNumber(placement.score) &&
        isHealth(placement.health) &&
        (placement.degradedReason === undefined || placement.degradedReason === null || isString(placement.degradedReason)),
    ) &&
    Array.isArray(value.bootstrapTui.degradedSlices) &&
    value.bootstrapTui.degradedSlices.every(
      (slice) =>
        isRecord(slice) &&
        isString(slice.name) &&
        typeof slice.live === "boolean" &&
        isNumber(slice.coverage) &&
        (slice.degradedReason === undefined || slice.degradedReason === null || isString(slice.degradedReason)),
    ) &&
    (value.bootstrapTui.degradedReason === undefined || value.bootstrapTui.degradedReason === null || isString(value.bootstrapTui.degradedReason)) &&
    isEcosystemValue(value.ecosystem)
  );
}

function isControlPlaneRepo(value: unknown): value is ApiControlPlane["repos"][number] {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isHealth(value.health) &&
    isString(value.currentVersion) &&
    isNullableString(value.lastSuccessfulMainCi) &&
    isNullableString(value.lastBinary) &&
    isNullableString(value.lastTests) &&
    isStringArray(value.latestChangedFiles) &&
    isNumber(value.activeWorkcells) &&
    typeof value.overdueActivity === "boolean" &&
    typeof value.stuckActivity === "boolean" &&
    typeof value.failingAudit === "boolean" &&
    isNullableString(value.auditReason) &&
    isString(value.rerunCommand)
  );
}

function isControlPlaneWorkcell(value: unknown): value is ApiControlPlane["activeWorkcells"][number] {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.repo) &&
    isString(value.agent) &&
    isString(value.task) &&
    isString(value.status) &&
    isStringArray(value.allowedSlice) &&
    isString(value.persistence) &&
    isString(value.pty) &&
    isString(value.updatedAt) &&
    typeof value.overdue === "boolean" &&
    typeof value.stuck === "boolean" &&
    isString(value.rerunCommand)
  );
}

function isControlPlaneAuditLane(value: unknown): value is ApiControlPlane["auditLanes"][number] {
  return (
    isRecord(value) &&
    isString(value.repo) &&
    isString(value.lane) &&
    isHealth(value.health) &&
    isString(value.reason) &&
    isNullableString(value.latestEvidence) &&
    isString(value.rerunCommand)
  );
}

function isControlPlaneStream(value: unknown): value is ApiControlPlane["streams"][number] {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.url) &&
    typeof value.stdoutStderr === "boolean" &&
    typeof value.ptyInput === "boolean" &&
    typeof value.interactiveOnly === "boolean"
  );
}

function isControlPlaneValue(value: unknown): value is ApiControlPlane {
  return (
    isRecord(value) &&
    isString(value.generatedAt) &&
    isNumber(value.eventWatermark) &&
    isRecord(value.eventBus) &&
    typeof value.eventBus.appendOnly === "boolean" &&
    isString(value.eventBus.streamUrl) &&
    isStringArray(value.eventBus.sources) &&
    Array.isArray(value.repos) &&
    value.repos.every(isControlPlaneRepo) &&
    Array.isArray(value.activeWorkcells) &&
    value.activeWorkcells.every(isControlPlaneWorkcell) &&
    Array.isArray(value.auditLanes) &&
    value.auditLanes.every(isControlPlaneAuditLane) &&
    isRecord(value.policy) &&
    typeof value.policy.sandboxRequired === "boolean" &&
    typeof value.policy.directPersistenceAllowed === "boolean" &&
    typeof value.policy.prExportRequired === "boolean" &&
    isString(value.policy.ptyDefault) &&
    isNumber(value.policy.findingCount) &&
    isRecord(value.versioning) &&
    isString(value.versioning.current) &&
    isString(value.versioning.recommended) &&
    isString(value.versioning.impact) &&
    isString(value.versioning.reason) &&
    typeof value.versioning.releaseCompatible === "boolean" &&
    typeof value.versioning.rollbackCompatible === "boolean" &&
    Array.isArray(value.streams) &&
    value.streams.every(isControlPlaneStream)
  );
}

export function isEcosystem(value: unknown): value is ApiEcosystem {
  return isEcosystemValue(value);
}

export function isFleetBoard(value: unknown): value is ApiFleetBoard {
  return isFleetBoardValue(value);
}

export function isUniverse(value: unknown): value is ApiUniverse {
  return isUniverseValue(value);
}

export function isControlPlane(value: unknown): value is ApiControlPlane {
  return isControlPlaneValue(value);
}
