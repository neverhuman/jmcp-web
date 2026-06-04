import { Boxes, GitBranch, Network, ShieldAlert } from "lucide-react";
import type { RuntimeState } from "./runtime";
import { EmptyCard, EmptyRow, PanelHeader, classForHealth } from "./views-extra";
import {
  artifactSummary,
  capsLabel,
  displayRepoLabel,
  formatAgeSeconds,
  formatEpoch,
  mergeUniverseCards,
  shortSha,
} from "./views-universe-model";

export function UniverseView({ runtime }: { runtime: RuntimeState }) {
  const bootstrap = runtime.universe.bootstrapTui;
  const board = runtime.fleetBoard;
  const repoCards = mergeUniverseCards(bootstrap.repoScores, board.repos);
  const placements = bootstrap.placements;
  const activeRepos = bootstrap.activeRepos;
  const liveTools = runtime.universe.ecosystem.tools;
  const observedCoverage = bootstrap.observedCoverage;
  const ecosystemCoverage = runtime.universe.ecosystem.live ? 100 : 0;
  const degradedReason = bootstrap.degradedReason ?? runtime.universe.ecosystem.degradedReason ?? "All observed slices are live.";
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
