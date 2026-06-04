import { FileCheck2, GitBranch } from "lucide-react";
import type {
  EvidenceBundle,
  MemoryProposal,
  Risk,
  SystemNode,
  WorkItem,
} from "./types";
import { useEffect } from "react";
import type { RuntimeState } from "./runtime";
import { NowCommandDeck } from "./jitux/components/NowCommandDeck";
import { deckStore, useDeckSnapshot } from "./jitux/store";
import {
  AttentionPacketCard,
  EmptyCard,
  EmptyRow,
  MemoryIncidentCard,
  MetricCard,
  PanelHeader,
  SystemIncidentCard,
  WorkRow,
  classForHealth,
  riskRank,
} from "./views-extra";
import { ControlPlanePanel, UniverseView } from "./views-panels";

export { ControlPlanePanel, UniverseView } from "./views-panels";

export function NowView({ runtime }: { runtime: RuntimeState }) {
  const deckActive = useDeckSnapshot((state) => state.active);
  useEffect(() => {
    if (!deckActive) {
      deckStore.startLiveQueueBlockers(runtime);
    }
    return () => {};
  }, [deckActive, runtime]);
  const blocked = runtime.workItems.filter((item) => item.state === "blocked").length;
  const decisionPackets = runtime.attentionPackets.filter((packet) => packet.decisionNeeded).length;
  const urgentPackets = runtime.attentionPackets.filter(
    (packet) => packet.attentionLevel === "urgent" || packet.attentionLevel === "incident",
  ).length;
  const voiceConfirmations = runtime.voiceThreads.filter((thread) => thread.requiresResponse).length;
  const activePromotions = runtime.memoryLessons.filter((lesson) => lesson.state === "promoted").length;
  const topRisk = runtime.attentionPackets.reduce((highest, packet) => (riskRank(packet.riskDelta.to) > riskRank(highest) ? packet.riskDelta.to : highest), "low" as Risk);
  const controlPlanePanel = <ControlPlanePanel runtime={runtime} />;

  if (deckActive) {
    return (
      <div className="now-stack">
        {controlPlanePanel}
        <NowCommandDeck />
      </div>
    );
  }

  return (
    <div className="dashboard-grid now-layout">
      {controlPlanePanel}
      <MetricCard label="Decision packets" value={runtime.attentionPackets.length.toString()} tone="green" detail={`${decisionPackets} packets need explicit decisions`} />
      <MetricCard label="Urgent" value={urgentPackets.toString()} tone="amber" detail={`${voiceConfirmations} voice/text confirmations are waiting`} />
      <MetricCard label="Blocked" value={blocked.toString()} tone="red" detail="adapter authority gap" />
      <MetricCard label="Memory promotions" value={activePromotions.toString()} tone="ink" detail={runtime.usingFixtures ? "fixture data" : "live API"} />

      <section className="attention-inbox wide">
        <div className="attention-inbox-hero">
          <div>
            <p className="eyebrow">Attention inbox</p>
            <h3>
              {runtime.attentionPackets.length} decision packets, {decisionPackets} explicit choices, {urgentPackets} urgent items.
            </h3>
            <p>
              Only decision-worthy packets surface here. Each card carries why-now, alternatives, risk delta, and drill-down links instead of a warning strip.
            </p>
          </div>
          <div className="inbox-dial" aria-label={`Highest risk ${topRisk}`}>
            <strong>{topRisk}</strong>
            <span>highest risk</span>
          </div>
        </div>

        <div className="attention-packet-grid">
          {runtime.attentionPackets.length === 0 && <EmptyCard label="No attention packets" />}
          {runtime.attentionPackets.map((packet) => (
            <AttentionPacketCard key={packet.id} packet={packet} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function WorkView({ workItems }: { workItems: WorkItem[] }) {
  return (
    <section className="list-panel">
      <PanelHeader icon={GitBranch} title="Work Orders" meta="Task state, risk, lease, proof count" />
      <div className="rows">
        {workItems.length === 0 && <EmptyRow label="No work orders" />}
        {workItems.map((item) => (
          <WorkRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export function EvidenceView({ evidenceBundles }: { evidenceBundles: EvidenceBundle[] }) {
  return (
    <section className="list-panel">
      <PanelHeader icon={FileCheck2} title="Evidence Bundles" meta="Proof bundles accepted before promotion" />
      <div className="rows">
        {evidenceBundles.length === 0 && <EmptyRow label="No evidence bundles" />}
        {evidenceBundles.map((bundle) => (
          <article className="row" key={bundle.id}>
            <div>
              <strong>{bundle.subject}</strong>
              <span>
                {bundle.id} from {bundle.source}
              </span>
            </div>
            <span className={`pill evidence-${bundle.status}`}>{bundle.status}</span>
            <code>{bundle.hash}</code>
            <span>{bundle.age}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

export function SystemsView({ systems }: { systems: SystemNode[] }) {
  return (
    <section className="card-grid system-grid">
      {systems.length === 0 && <EmptyCard label="No systems reported" />}
      {systems.map((system) => (
        <article className="system-card" key={system.name}>
          <div className="system-card-head">
            <strong>{system.name}</strong>
            <span className={classForHealth(system.health)}>{system.health}</span>
          </div>
          <p>{system.role}</p>
          <dl>
            <div>
              <dt>JCP</dt>
              <dd>{system.jcp}</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd>{system.latency}</dd>
            </div>
          </dl>
          {system.incident && <SystemIncidentCard incident={system.incident} />}
        </article>
      ))}
    </section>
  );
}

export const ToolsDataView = UniverseView;

export function MemoryView({ memoryLessons }: { memoryLessons: MemoryProposal[] }) {
  const promoted = memoryLessons.filter((lesson) => lesson.state === "promoted").length;
  const quarantined = memoryLessons.filter((lesson) => lesson.state === "quarantined").length;
  const shadowed = memoryLessons.filter((lesson) => lesson.state === "shadow" || lesson.state === "proposed").length;

  return (
    <div className="memory-board">
      <section className="memory-hero">
        <div>
          <p className="eyebrow">Memory</p>
          <h3>
            {memoryLessons.length} lessons, {promoted} promoted, {quarantined} quarantined.
          </h3>
          <p>
            Promotion stays visible with expiry, counterexamples, and rollback context attached to each lesson so the cockpit can keep the learning surface honest.
          </p>
        </div>
        <div className="memory-dial" aria-label={`${shadowed} lessons still in review`}>
          <strong>{shadowed}</strong>
          <span>in review</span>
        </div>
      </section>

      <section className="card-grid memory-grid">
        {memoryLessons.length === 0 && <EmptyCard label="No memory lessons" />}
        {memoryLessons.map((lesson) => (
          <article className={`memory-card memory-${lesson.state}`} key={lesson.id}>
            <div className="system-card-head">
              <strong>{lesson.id}</strong>
              <span className={`pill memory-${lesson.state}`}>{lesson.state}</span>
            </div>
            <h3>{lesson.claim}</h3>
            <p>{lesson.scope}</p>
            <dl className="memory-meta">
              <div>
                <dt>Retention</dt>
                <dd>{lesson.retention}</dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>{lesson.expiry}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{lesson.confidence}%</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{lesson.source}</dd>
              </div>
            </dl>
            <div className="meter" aria-label={`${lesson.confidence}% confidence`}>
              <span style={{ width: `${lesson.confidence}%` }} />
            </div>
            <section className="memory-promotion">
              <span className="eyebrow">Promotion</span>
              <strong>{lesson.promotion.status}</strong>
              <p>{lesson.promotion.gate}</p>
              <span>{lesson.promotion.reviewedBy ? `Reviewed by ${lesson.promotion.reviewedBy}` : "Awaiting reviewer"}</span>
              {lesson.promotion.promotedAt && <span>{lesson.promotion.promotedAt}</span>}
            </section>
            <section className="memory-counterexamples">
              <span className="eyebrow">Counterexamples</span>
              <div className="chip-list">
                {lesson.counterexamples.map((counterexample) => (
                  <span className="chip" key={counterexample}>
                    {counterexample}
                  </span>
                ))}
              </div>
            </section>
            <section className="memory-rollback">
              <span className="eyebrow">Rollback</span>
              <p>{lesson.rollback}</p>
            </section>
            {lesson.incident && <MemoryIncidentCard incident={lesson.incident} />}
          </article>
        ))}
      </section>
    </div>
  );
}

export { ApprovalsView, ReplayView, VoiceTextView } from "./views-extra";
