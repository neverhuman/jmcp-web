import { ChevronsDownUp, ChevronsUpDown, Crosshair, ListFilter } from "lucide-react";
import { useEffect, useState } from "react";
import { deckStore, useDeckSnapshot } from "../store";
import { AnswerCaptionStream } from "./AnswerCaptionStream";
import { DeckViewport } from "./DeckViewport";
import { TraceRibbon } from "./TraceRibbon";

export function NowCommandDeck() {
  const state = useDeckSnapshot();
  const [viewMode, setViewMode] = useState<"stack" | "fan">("stack");

  useEffect(() => {
    if (!state.active) {
      return () => {};
    }
    const stopLive = deckStore.startLiveQueueBlockers();
    const stopIdle = deckStore.startIdleMacroScan();
    return () => {
      stopIdle();
      stopLive();
    };
  }, [state.active]);

  return (
    <section className="command-deck" data-mobile-clearance="voice-bar" data-view-mode={viewMode} aria-label="AIUX Mission Deck">
      <div className="data-loom" aria-hidden="true" />
      <div className="command-deck-surface">
        <header className="command-deck-head">
          <div>
            <p className="eyebrow">AIUX Mission Deck</p>
            <h3>{state.title}</h3>
          </div>
          <div className="deck-toolbar" aria-label="Deck controls">
            <button aria-label="Fan panes" onClick={() => setViewMode("fan")} title="Fan panes" type="button">
              <ChevronsUpDown size={17} aria-hidden="true" />
            </button>
            <button aria-label="Collapse panes" onClick={() => setViewMode("stack")} title="Collapse panes" type="button">
              <ChevronsDownUp size={17} aria-hidden="true" />
            </button>
            <button aria-label="Tunnel focus" title="Tunnel focus" type="button">
              <Crosshair size={17} aria-hidden="true" />
            </button>
            <button aria-label="Rank filter" title="Rank filter" type="button">
              <ListFilter size={17} aria-hidden="true" />
            </button>
          </div>
        </header>
        <TraceRibbon trace={state.trace} />
        <DeckViewport state={state} />
        <InnerDialogue lines={state.dialogue} fallback={state.error ?? state.caption} />
        <AnswerCaptionStream caption={state.error ?? state.caption} />
      </div>
    </section>
  );
}

function InnerDialogue({ lines, fallback }: { lines: string[]; fallback: string }) {
  const visible = lines.length > 0 ? lines : [fallback].filter((line) => line.trim().length > 0);
  return (
    <section className="inner-dialogue-stream" aria-label="Inner dialogue" aria-live="polite">
      <div>
        {visible.map((line, index) => (
          <span key={`${line}:${index}`}>{line}</span>
        ))}
      </div>
    </section>
  );
}
