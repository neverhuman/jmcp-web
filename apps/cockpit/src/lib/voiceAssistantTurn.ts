import {
  runMiniCpmChat,
  type MiniCpmContent,
  type MiniCpmMessage,
} from "./minicpmVoiceClient";
import type { PcmAudioChunk } from "./pcmStreamingPlayer";
import {
  JITUX_FIRST_FRAME_TIMEOUT_MS,
  openVoiceJituxSession,
  waitForUsefulVoiceDeckFrame,
  type VoiceJituxDeckReadiness,
  type VoiceJituxSessionStart,
} from "./voiceJituxSession";
import { executeVoiceTool } from "./voiceTools";

interface VoiceTurnOptions {
  turnId: string;
  command: string;
  history: MiniCpmMessage[];
  signal: AbortSignal;
  inputContent?: MiniCpmContent[];
  enqueueAudio: (audio: PcmAudioChunk, signal?: AbortSignal) => void;
  onDelta?: (delta: string) => void;
  setThinking: () => void;
  openDeckSession?: (prompt: string, signal: AbortSignal) => Promise<VoiceJituxSessionStart>;
  waitForDeckFrame?: (
    start: Promise<VoiceJituxSessionStart>,
    signal: AbortSignal,
    timeoutMs: number,
  ) => Promise<VoiceJituxDeckReadiness>;
  deckFrameTimeoutMs?: number;
}

type FastReadOnlyTool =
  | "jmcp_status"
  | "list_work_orders"
  | "microtask_queue"
  | "list_autonomous_actions"
  | "attention_inbox";

export type FastReadOnlyDecision =
  | { kind: "local_tool"; tool: FastReadOnlyTool }
  | { kind: "model"; reason: "empty_command" | "mutation_intent" | "requires_reasoning" };

export function detectFastReadOnlyTool(command: string): FastReadOnlyDecision {
  const text = command.trim().toLowerCase();
  const mutationIntent =
    /^(please\s+)?(start|submit|queue|run|launch|approve|deny|cancel)\b/.test(text) ||
    /\b(can|could|would)\s+you\s+(start|submit|queue|run|launch|approve|deny|cancel)\b/.test(text);
  if (text.length === 0) {
    return { kind: "model", reason: "empty_command" };
  }
  if (mutationIntent) {
    return { kind: "model", reason: "mutation_intent" };
  }
  if (/\b(status|health|healthy)\b/.test(text) || /\bhow\s+(is|are)\b.*\bjmcp\b/.test(text)) {
    return { kind: "local_tool", tool: "jmcp_status" };
  }
  if (/\battention\b/.test(text) || /\bneeds?\s+me\b/.test(text)) {
    return { kind: "local_tool", tool: "attention_inbox" };
  }
  if (/\bautonomous\b/.test(text) || /\bwhat\s+can\s+you\s+(safely\s+)?do\b/.test(text)) {
    return { kind: "local_tool", tool: "list_autonomous_actions" };
  }
  if (/\bwork\s+orders?\b/.test(text)) {
    return { kind: "local_tool", tool: "list_work_orders" };
  }
  if (
    /\bqueue\b/.test(text) ||
    /\b(blocked|blocking|blockers?|microtasks?)\b/.test(text)
  ) {
    return { kind: "local_tool", tool: "microtask_queue" };
  }
  return { kind: "model", reason: "requires_reasoning" };
}

export async function runVoiceTurn({
  turnId,
  command,
  history,
  signal,
  inputContent,
  enqueueAudio,
  onDelta = () => undefined,
  setThinking,
  openDeckSession = openVoiceJituxSession,
  waitForDeckFrame = waitForUsefulVoiceDeckFrame,
  deckFrameTimeoutMs = JITUX_FIRST_FRAME_TIMEOUT_MS,
}: VoiceTurnOptions): Promise<string> {
  const userContent = buildUserContent(command, inputContent);
  const deckPrompt = command.trim().length > 0 ? command : "voice turn";
  const deckSession = openDeckSession(deckPrompt, signal);
  void waitForDeckFrame(deckSession, signal, deckFrameTimeoutMs).catch(
    (error: unknown): VoiceJituxDeckReadiness => ({
      kind: "unavailable",
      reason: error instanceof Error ? error.message : "jitux_wait_error",
    }),
  );

  const fastDecision = detectFastReadOnlyTool(command);
  let coreContext = "";
  if (fastDecision.kind === "local_tool") {
    coreContext = await executeVoiceTool(fastDecision.tool, "{}", signal);
    setThinking();
  }

  const messages = [...history, { role: "user" as const, content: withCoreContext(userContent, coreContext) }];
  const result = await runMiniCpmChat({
    turnId,
    messages,
    signal,
    onDelta,
    onAudio: enqueueAudio,
  });
  history.push({ role: "user", content: historySafeUserContent(command, inputContent) });
  history.push({ role: "assistant", content: result.text });
  trimHistory(history);
  return result.text;
}

function buildUserContent(command: string, inputContent?: MiniCpmContent[]): string | MiniCpmContent[] {
  if (inputContent !== undefined && inputContent.length > 0) {
    const content = [...inputContent];
    if (!content.some((item) => item.type === "text")) {
      content.push({
        type: "text",
        text: "Answer the operator's spoken request. Keep the reply concise.",
      });
    }
    return content;
  }
  return command;
}

function withCoreContext(
  content: string | MiniCpmContent[],
  coreContext: string,
): string | MiniCpmContent[] {
  if (coreContext.trim().length === 0) {
    return content;
  }
  const context =
    `The operator asked: ${typeof content === "string" ? content : "a spoken request"}\n` +
    `Current JMCP core context: ${coreContext}\n` +
    "Answer the operator in one or two short spoken sentences.";
  if (typeof content === "string") {
    return context;
  }
  return [...content, { type: "text", text: context }];
}

function historySafeUserContent(command: string, inputContent?: MiniCpmContent[]): string {
  if (command.trim().length > 0) {
    return command;
  }
  return inputContent !== undefined ? "[voice audio turn]" : "";
}

function trimHistory(history: MiniCpmMessage[]): void {
  if (history.length <= 13) return;
  const trimmed = [history[0], ...history.slice(history.length - 12)];
  history.splice(0, history.length, ...trimmed);
}
