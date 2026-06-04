import { Boxes, GitBranch, Network, ShieldAlert } from "lucide-react";
import type { FleetBoardRepo, Health, Risk } from "./types";
import type { RuntimeState } from "./runtime";
import {
  EmptyCard,
  EmptyRow,
  PanelHeader,
  classForHealth,
  riskRank,
} from "./views-extra";

type UniverseCardModel = {
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

function displayRepoLabel(value: string) {
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

function shortSha(value?: string | null) {
  return value ? value.slice(0, 12) : "unobserved";
}

function formatEpoch(value?: number | null) {
  if (!value) {
    return "unobserved";
  }
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return "unobserved";
  }
  return date.toISOString().slice(0, 16) + "Z";
}

function formatAgeSeconds(value?: number | null) {
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

function artifactSummary(repo: FleetBoardRepo) {
  const state = repo.artifactState;
  return `local ${state.local}, canary ${state.devCanary}, prod ${state.prod}`;
}

function capsLabel(repo: FleetBoardRepo) {
  if (repo.caps.length > 0) {
    return repo.caps.join(", ");
  }
  return `${repo.capsCount ?? 0}`;
}

function mergeUniverseCards(
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
      degradedReason:
        repo.scoreSource ?? repo.topFindings[0] ?? repo.topToolOpportunities[0] ?? "fleet board only",
      board: repo,
    }));
  return [...liveCards, ...boardOnlyCards];
}

export function ControlPlanePanel({ runtime }: { runtime: RuntimeState }) {
  const summary = runtime.controlPlane;
  const failingRepos = summary.repos.filter((repo) => repo.failingAudit).length;
  const overdueWorkcells = summary.activeWorkcells.filter((workcell) => workcell.overdue).length;
  const stuckWorkcells = summary.activeWorkcells.filter((workcell) => workcell.stuck).length;
  const visibleRepos = summary.repos.slice(0, 5);
  const visibleWorkcells = summary.activeWorkcells.slice(0, 3);

  return (
    <section className="control-plane-panel" aria-label="JMCP control plane">
      <div className="control-plane-head">
        <div>
          <p className="eyebrow">Control Plane</p>
          <h3>
            {summary.repos.length} repos, {summary.activeWorkcells.length} active workcells, {summary.eventWatermark} events.
          </h3>
          <p>
            Sandboxed workcells persist through PR export only. PTY input stays disabled unless a session is explicitly interactive.
          </p>
        </div>
        <div className="control-plane-version">
          <span>Version</span>
          <strong>
            {summary.versioning.current}
            {" -> "}
            {summary.versioning.recommended}
          </strong>
          <small>{summary.versioning.impact}</small>
        </div>
      </div>

      <div className="control-plane-metrics">
        <span>
          <strong>{failingRepos}</strong>
          failing audits
        </span>
        <span>
          <strong>{overdueWorkcells}</strong>
          overdue
        </span>
        <span>
          <strong>{stuckWorkcells}</strong>
          stuck
        </span>
        <span>
          <strong>{summary.policy.findingCount}</strong>
          findings
        </span>
      </div>

      <div className="control-plane-grid">
        <div className="control-plane-repos">
          {visibleRepos.map((repo) => (
            <article className="control-plane-repo" key={repo.name}>
              <div>
                <strong>{repo.name}</strong>
                <span>{repo.auditReason ?? repo.lastTests ?? "audit evidence pending"}</span>
              </div>
              <span className={classForHealth(repo.health)}>{repo.health}</span>
            </article>
          ))}
        </div>

        <div className="control-plane-workcells">
          {visibleWorkcells.length === 0 && <EmptyRow label="No active workcells" />}
          {visibleWorkcells.map((workcell) => (
            <article className="control-plane-workcell" key={workcell.id}>
              <div>
                <strong>{workcell.repo}</strong>
                <span>{workcell.task}</span>
              </div>
              <code>{workcell.persistence}</code>
              <span>{workcell.pty}</span>
            </article>
          ))}
        </div>

        <div className="control-plane-streams">
          {summary.streams.map((stream) => (
            <span className="chip" key={stream.name}>
              <strong>{stream.name}</strong>
              <small>{stream.ptyInput ? "PTY input / interactive only" : stream.stdoutStderr ? "stdout/stderr stream" : "event stream"}</small>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function UniverseView({ runtime }: { runtime: RuntimeState }) {
  const bootstrap = runtime.universe.bootstrapTui;
  const board = runtime.fleetBoard;
  const repoCards = mergeUniverseCards(bootstrap.repoScores, board.repos);
  const placements = bootstrap.placements;
  const activeRepos = bootstrap.activeRepos;
  const liveTools = runtime.universe.ecosystem.tools;
  const observedCoverage = bootstrap.observedCoverage;
  const ecosystemCoverage = runtime.universe.ecosystem.live ? 100 : 0;
  const degradedReason =
    bootstrap.degradedReason ??
    runtime.universe.ecosystem.degradedReason ??
    "All observed slices are live.";
  const boardRows = board.repos.length;

  return (
    <div className="universe-board">
      <section className="universe-hero">
        <div>
          <p className="eyebrow">Universe</p>
          <h3>
            {observedCoverage}% observed coverage, {activeRepos.length} active repos, {boardRows} board rows, {liveTools.length} graph nodes.
          </h3>
          <p>{degradedReason}</p>
          <p>{board.generatedAtNote}</p>
          <div className="chip-list">
            {activeRepos.length === 0 && <span className="chip">No active repos observed</span>}
            {activeRepos.map((repo) => (
              <span className="chip" key={repo.repo}>
                <strong>{displayRepoLabel(repo.repo)}</strong>
                <small>
                  {repo.score}% observed score, {repo.toolCount} tools
                </small>
              </span>
            ))}
            {board.repos.length > 0 && (
              <>
                <span className="chip">
                  <strong>{board.totals.totalHardFindings}</strong>
                  <small>hard findings</small>
                </span>
                <span className="chip">
                  <strong>{board.totals.belowThreshold}</strong>
                  <small>below threshold</small>
                </span>
                <span className="chip">
                  <strong>{board.schema}</strong>
                  <small>board schema</small>
                </span>
              </>
            )}
          </div>
        </div>
        <div className="universe-dial" aria-label={`${observedCoverage}% observed coverage and ${ecosystemCoverage}% ecosystem coverage`}>
          <strong>{observedCoverage}</strong>
          <span>observed</span>
        </div>
      </section>

      <section className="card-grid universe-scorecards">
        {repoCards.length === 0 && <EmptyCard label="No repo scores observed" />}
        {repoCards.map((repo) => (
          <article className={`universe-card universe-card-${repo.health}`} key={repo.repo.toLowerCase()}>
            <div className="system-card-head">
              <strong>{displayRepoLabel(repo.repo)}</strong>
              <span className={classForHealth(repo.health)}>{repo.health}</span>
            </div>
            <h3>{repo.score}% observed score</h3>
            <p>{repo.degradedReason ?? "All bootstrap fields observed."}</p>
            <dl className="universe-meta">
              <div>
                <dt>Coverage</dt>
                <dd>{repo.coverage}%</dd>
              </div>
              <div>
                <dt>Tools</dt>
                <dd>{repo.toolCount}</dd>
              </div>
              <div>
                <dt>Task</dt>
                <dd>{repo.currentTask}</dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>{repo.branch}</dd>
              </div>
            </dl>
            <div className="meter" aria-label={`${repo.coverage}% coverage`}>
              <span style={{ width: `${repo.coverage}%` }} />
            </div>
            {repo.board && (
              <>
                <span className="eyebrow">Fleet board</span>
                <div className="chip-list">
                  <span className="chip">
                    <strong>{repo.board.path}</strong>
                    <small>path</small>
                  </span>
                  <span className="chip">
                    <strong>{repo.board.branch ?? "unobserved"}</strong>
                    <small>branch</small>
                  </span>
                  <span className="chip">
                    <strong>{repo.board.host ?? "unassigned"}</strong>
                    <small>host</small>
                  </span>
                  <span className="chip">
                    <strong>{repo.board.dirtyFiles ?? repo.board.dirty ?? 0}</strong>
                    <small>dirty</small>
                  </span>
                  <span className="chip">
                    <strong>{shortSha(repo.board.headSha ?? repo.board.lastCommitSha)}</strong>
                    <small>head</small>
                  </span>
                  <span className="chip">
                    <strong>{repo.board.version ?? "n/a"}</strong>
                    <small>version</small>
                  </span>
                  <span className="chip">
                    <strong>{repo.board.scoreFreshness === "outdated" ? "outdated score" : repo.board.scoreFreshness}</strong>
                    <small>score freshness</small>
                  </span>
                  <span className="chip">
                    <strong>
                      {repo.board.activeRunnerCount}
                      {repo.board.runnerBusy ? " busy" : " idle"}
                    </strong>
                    <small>{repo.board.runnerHint ?? "runner activity"}</small>
                  </span>
                  <span className="chip">
                    <strong>{repo.board.hlLevel ?? "n/a"}</strong>
                    <small>HL</small>
                  </span>
                  <span className="chip">
                    <strong>{capsLabel(repo.board)}</strong>
                    <small>caps</small>
                  </span>
                  <span className="chip">
                    <strong>{repo.board.hardFindings ?? 0}</strong>
                    <small>hard</small>
                  </span>
                  <span className="chip">
                    <strong>{repo.board.jeryuGate}</strong>
                    <small>Jeryu gate</small>
                  </span>
                  <span className="chip">
                    <strong>{artifactSummary(repo.board)}</strong>
                    <small>artifact receipts</small>
                  </span>
                  <span className="chip">
                    <strong>
                      release {repo.board.artifactState.release}, promote {repo.board.artifactState.promote}
                    </strong>
                    <small>promotion</small>
                  </span>
                  <span className="chip">
                    <strong>{formatAgeSeconds(repo.board.mainCiAgeSeconds)}</strong>
                    <small>main CI age</small>
                  </span>
                  <span className="chip">
                    <strong>{formatEpoch(repo.board.lastTestsEpoch)}</strong>
                    <small>tests</small>
                  </span>
                  <span className="chip">
                    <strong>{formatEpoch(repo.board.lastBinaryEpoch)}</strong>
                    <small>binary</small>
                  </span>
                </div>
                {repo.board.topFindings.length > 0 && (
                  <>
                    <span className="eyebrow">Top findings</span>
                    <div className="chip-list">
                      {repo.board.topFindings.map((finding) => (
                        <span className="chip" key={finding}>
                          {finding}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {repo.board.topToolOpportunities.length > 0 && (
                  <>
                    <span className="eyebrow">Tool opportunities</span>
                    <div className="chip-list">
                      {repo.board.topToolOpportunities.map((opportunity) => (
                        <span className="chip" key={opportunity}>
                          {opportunity}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </article>
        ))}
      </section>

      <section className="universe-grid">
        <section className="tool-map universe-graph">
          <PanelHeader icon={Network} title="Live Graph" meta={`${liveTools.length} tools across ${new Set(liveTools.map((tool) => tool.repo ?? "local")).size} repos`} />
          <div className="tool-stack">
            {liveTools.length === 0 && <EmptyCard label="No ecosystem tools reported" />}
            {liveTools.map((tool, index) => (
              <article className={`tool-node tool-node-${tool.health ?? "nominal"}`} key={tool.name}>
                <div>
                  <Boxes size={18} aria-hidden="true" />
                  <strong>{tool.name}</strong>
                </div>
                <span>
                  {tool.repo ?? "local"} / {tool.provider ?? "jmcp"}
                </span>
                <small>{tool.dependsOn?.join(" -> ") ?? "direct"}</small>
                <i style={{ width: `${Math.max(18, 94 - index * 9)}%` }} />
              </article>
            ))}
          </div>
        </section>

        <section className="attention-panel universe-slices">
          <PanelHeader icon={ShieldAlert} title="Degraded Slices" meta={`${bootstrap.degradedSlices.filter((slice) => !slice.live).length} degraded`} />
          <div className="attention-list">
            {bootstrap.degradedSlices.length === 0 && <EmptyRow label="No degraded slices" />}
            {bootstrap.degradedSlices.map((slice) => (
              <article className="attention-row universe-slice-row" key={slice.name}>
                <Network size={16} aria-hidden="true" />
                <div>
                  <strong>{slice.name}</strong>
                  <span>{slice.degradedReason ?? "slice live"}</span>
                </div>
                <span className={classForHealth(slice.live ? "nominal" : "degraded")}>{slice.coverage}%</span>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="list-panel">
        <PanelHeader icon={GitBranch} title="Placement Rows" meta="current task, branch, pool, and score" />
        <div className="rows universe-placement-rows">
          {placements.length === 0 && <EmptyRow label="No placements observed" />}
          {placements.map((placement) => (
            <article className="row universe-placement-row" key={placement.repo}>
              <div>
                <strong>{placement.agent}</strong>
                <span>{placement.placement}</span>
              </div>
              <span className={classForHealth(placement.health)}>{placement.health}</span>
              <span>{placement.currentTask}</span>
              <span>{placement.branch}</span>
              <span>{placement.pool}</span>
              <span>{placement.score}%</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
