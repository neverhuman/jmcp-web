import type { RuntimeState } from "./runtime";
import { EmptyRow, classForHealth } from "./views-extra";

export { UniverseView } from "./views-universe";

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
