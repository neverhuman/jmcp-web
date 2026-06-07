import { useCallback, useEffect, useMemo, useState } from "react";
import { deckStore, getRankedPanes, type DeckState } from "../store";
import { deckTransformScheduler } from "../scheduler";
import { getDeckTransform } from "../layout/deck";
import { DeckCardView } from "./DeckCardView";

function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== "function") {
    return false;
  }
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof matchMedia !== "function") {
      return;
    }
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

export function DeckViewport({ state, compact = false }: { state: DeckState; compact?: boolean }) {
  const reducedMotion = useReducedMotion();
  const panes = useMemo(() => getRankedPanes(state), [state]);
  const setElement = useCallback((id: string, element: HTMLElement | null) => {
    deckTransformScheduler.register(id, element);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const transforms = Object.fromEntries(
      panes.map((pane, index) => [pane.id, getDeckTransform(index, pane.id === state.focusPaneId)]),
    );
    deckTransformScheduler.schedule(transforms);
  }, [panes, reducedMotion, state.focusPaneId]);

  useEffect(() => () => deckTransformScheduler.clear(), []);

  return (
    <section
      aria-label="Mission Deck viewport"
      className="deck-viewport"
      data-compact={compact ? "true" : "false"}
      data-motion={reducedMotion ? "reduced" : "depth"}
    >
      <div className="deck-stage" role="list" aria-label="Ranked Mission Deck">
        {panes.map((pane) => (
          <DeckCardView
            active={pane.id === state.focusPaneId}
            compact={compact}
            key={pane.id}
            onPromote={(paneId) => deckStore.promotePane(paneId, `${pane.title} was promoted by direct user focus.`)}
            pane={pane}
            rankReason={state.rankReasons[pane.id]}
            setElement={setElement}
          />
        ))}
        {compact && panes.length === 0 && <NowWarmupCards />}
      </div>
    </section>
  );
}

function NowWarmupCards() {
  const warmupCards = [
    { rank: 1, title: "Live cards", risk: "warming", headline: "Warming current mission state." },
    { rank: 2, title: "System pulse", risk: "draft", headline: "Waiting for the first ranked frame." },
    { rank: 3, title: "Operator context", risk: "draft", headline: "Ready for the next spoken turn." },
  ];
  return (
    <>
      {warmupCards.map((card) => (
        <li
          aria-label={`${card.rank}. ${card.title}`}
          className="deck-card deck-card-preview now-warmup-card"
          data-lod="preview"
          key={card.title}
        >
          <div className="deck-card-head">
            <span className="deck-risk deck-risk-medium">{card.risk}</span>
            <strong>{card.title}</strong>
            <span className="deck-rank">#{card.rank}</span>
          </div>
          <h3>{card.headline}</h3>
        </li>
      ))}
    </>
  );
}
