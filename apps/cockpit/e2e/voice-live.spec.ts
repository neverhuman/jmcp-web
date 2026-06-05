import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type VoiceLiveMode = "local" | "model" | "typed";

type BrowserEventCategory = "asr" | "tts" | "llm" | "jitux" | "jmcp" | "play" | "fetch";

interface BrowserFetchEvent {
  type: "fetch";
  category: BrowserEventCategory;
  at: number;
  endAt: number;
  durationMs: number;
  method: string;
  path: string;
  status: number | null;
  ok: boolean | null;
  stream: boolean | null;
  hasTools: boolean | null;
  source: string;
  error: string;
}

interface BrowserPlayEvent {
  type: "play";
  category: "play";
  at: number;
}

type BrowserMetricEvent = BrowserFetchEvent | BrowserPlayEvent;

interface BrowserStateEvent {
  state: string;
  at: number;
}

interface BrowserMetricStore {
  events: BrowserMetricEvent[];
  states: BrowserStateEvent[];
  markers: Record<string, number>;
}

interface BrowserMetricWindow {
  __jmcpVoiceMetrics?: BrowserMetricStore;
}

interface RunTimings {
  asrFetchMs: number | null;
  ttsFirstFetchMs: number | null;
  ttsMedianFetchMs: number | null;
  llmFirstFetchMs: number | null;
  firstAudioFromRunStartMs: number | null;
  firstAudioFromAsrResponseMs: number | null;
  firstAudioFromTranscriptVisibleMs: number | null;
  transcriptVisibleFromRunStartMs: number | null;
  replyVisibleFromRunStartMs: number | null;
  jituxSessionOpenFromRunStartMs: number | null;
  maxThinkingMs: number;
}

interface RunMetrics {
  runId: string;
  mode: VoiceLiveMode;
  iteration: number;
  startedAt: string;
  completedAt: string;
  passed: boolean;
  reasons: string[];
  transcript: string;
  reply: string;
  counts: {
    asrFetches: number;
    ttsFetches: number;
    llmFetches: number;
    llmStreamFetches: number;
    jituxFetches: number;
    jituxSessionPosts: number;
    playCalls: number;
  };
  timingsMs: RunTimings;
  fetches: Array<{
    category: BrowserEventCategory;
    method: string;
    path: string;
    status: number | null;
    startFromRunMs: number;
    durationMs: number;
    stream: boolean | null;
    hasTools: boolean | null;
    source: string;
    error: string;
  }>;
}

interface ReceiptSummaryMode {
  runs: number;
  passed: number;
  mediansMs: Record<string, number | null>;
  maxMs: Record<string, number | null>;
}

interface VoiceLiveReceipt {
  schemaVersion: 1;
  generatedAt: string;
  updatedAt: string;
  serviceChecks?: unknown;
  runs: RunMetrics[];
  summary: {
    passed: boolean;
    totalRuns: number;
    failedRuns: number;
    byMode: Partial<Record<VoiceLiveMode, ReceiptSummaryMode>>;
    failures: Array<{ runId: string; mode: VoiceLiveMode; reasons: string[] }>;
  };
}

const liveBaseURL = process.env.JMCP_VOICE_LIVE_BASE_URL;
const fakeMicWav = process.env.JMCP_VOICE_LIVE_WAV;
const metricsPath = process.env.JMCP_VOICE_LIVE_METRICS;
const mode = parseMode(process.env.JMCP_VOICE_LIVE_MODE ?? "local");
const iteration = Number.parseInt(process.env.JMCP_VOICE_LIVE_ITERATION ?? "1", 10);
const runId = process.env.JMCP_VOICE_LIVE_RUN_ID ?? `${mode}-${iteration}`;

const LOCAL_COMMAND = "how is JMCP doing";
const MODEL_COMMAND = "explain the current mission in one short sentence";
const MAX_LOCAL_FIRST_AUDIO_MS = 1500;
const MAX_MODEL_FIRST_AUDIO_MS = 3000;
const MAX_THINKING_MS = 5000;

test.skip(liveBaseURL === undefined, "voice-live lane is not active");
test.skip((mode === "local" || mode === "model") && fakeMicWav === undefined, "fake microphone WAV is required");

const launchArgs = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  ...(fakeMicWav === undefined ? [] : [`--use-file-for-fake-audio-capture=${fakeMicWav}`]),
];

test.use({
  launchOptions: {
    args: launchArgs,
  },
});

test.describe.configure({ mode: "serial" });

test(`voice-live ${mode} run ${iteration}`, async ({ page }) => {
  await installBrowserMetrics(page);
  const startedAt = new Date().toISOString();
  const failureReasons: string[] = [];
  let thrown: unknown;
  let transcript = "";
  let reply = "";

  try {
    if (mode === "typed") {
      ({ transcript, reply } = await runTypedModelPath(page));
    } else if (mode === "local") {
      ({ transcript, reply } = await runSpeechPath(page, mode));
      const cleanReply = stripMetricLabel(reply);
      expect(cleanReply).toMatch(/^JMCP is healthy\b/i);
      expect(cleanReply).toMatch(/\bsystems?\s+connected\b/i);
      expect(isGenericReply(cleanReply)).toBe(false);
    } else {
      ({ transcript, reply } = await runSpeechPath(page, mode));
      const cleanReply = stripMetricLabel(reply);
      expect(cleanReply).toMatch(/\b(JMCP|mission|operator|local|control plane|JCP|JPCM|runtime)\b/i);
      expect(isGenericReply(cleanReply)).toBe(false);
    }
  } catch (error) {
    thrown = error;
    failureReasons.push(errorMessage(error));
  }

  const store = await collectBrowserMetrics(page);
  const thresholdFailures = evaluateRun(mode, store, reply);
  failureReasons.push(...thresholdFailures);
  const run = buildRunMetrics({
    store,
    startedAt,
    completedAt: new Date().toISOString(),
    transcript,
    reply,
    reasons: failureReasons,
  });
  writeReceipt(run);

  if (thrown !== undefined) {
    throw thrown;
  }
  expect(thresholdFailures).toEqual([]);
});

function parseMode(value: string): VoiceLiveMode {
  if (value === "local" || value === "model" || value === "typed") {
    return value;
  }
  throw new Error(`invalid JMCP_VOICE_LIVE_MODE: ${value}`);
}

async function installBrowserMetrics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type MetricStore = {
      events: Array<Record<string, unknown>>;
      states: Array<{ state: string; at: number }>;
      markers: Record<string, number>;
    };

    const target = window as typeof window & { __jmcpVoiceMetrics?: MetricStore };
    target.__jmcpVoiceMetrics = { events: [], states: [], markers: {} };
    const store = target.__jmcpVoiceMetrics;

    const safePath = (input: unknown): string => {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.toString()
              : String(input);
      try {
        const parsed = new URL(raw, window.location.href);
        return parsed.pathname;
      } catch {
        return raw;
      }
    };

    const classify = (pathName: string): string => {
      if (pathName.includes("/transcribe")) return "asr";
      if (pathName.includes("/synthesize")) return "tts";
      if (pathName.includes("/v1/chat/completions")) return "llm";
      if (pathName.includes("/jitux/sessions")) return "jitux";
      if (pathName.includes("/health") || pathName.includes("/work-orders")) return "jmcp";
      return "fetch";
    };

    const requestMethod = (input: unknown, init?: RequestInit): string => {
      if (typeof init?.method === "string") return init.method.toUpperCase();
      if (input instanceof Request) return input.method.toUpperCase();
      return "GET";
    };

    const requestBody = (input: unknown, init?: RequestInit): string => {
      if (typeof init?.body === "string") return init.body;
      if (input instanceof Request && typeof input.body === "string") return input.body;
      return "";
    };

    const llmDetails = (category: string, body: string): { stream: boolean | null; hasTools: boolean | null } => {
      if (category !== "llm" || body.length === 0) return { stream: null, hasTools: null };
      try {
        const parsed: unknown = JSON.parse(body);
        if (parsed !== null && typeof parsed === "object") {
          const record = parsed as Record<string, unknown>;
          return {
            stream: record.stream === true,
            hasTools: Array.isArray(record.tools) && record.tools.length > 0,
          };
        }
      } catch {
        return { stream: null, hasTools: null };
      }
      return { stream: null, hasTools: null };
    };

    const requestSource = (category: string, body: string): string => {
      if (category !== "jitux" || body.length === 0) return "";
      try {
        const parsed: unknown = JSON.parse(body);
        if (parsed !== null && typeof parsed === "object") {
          const source = (parsed as Record<string, unknown>).source;
          return typeof source === "string" ? source : "";
        }
      } catch {
        return "";
      }
      return "";
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const at = performance.now();
      const pathName = safePath(input);
      const category = classify(pathName);
      const method = requestMethod(input, init);
      const body = requestBody(input, init);
      const details = llmDetails(category, body);
      try {
        const response = await originalFetch(input, init);
        const endAt = performance.now();
        store.events.push({
          type: "fetch",
          category,
          at,
          endAt,
          durationMs: endAt - at,
          method,
          path: pathName,
          status: response.status,
          ok: response.ok,
          stream: details.stream,
          hasTools: details.hasTools,
          source: requestSource(category, body),
          error: "",
        });
        return response;
      } catch (error) {
        const endAt = performance.now();
        store.events.push({
          type: "fetch",
          category,
          at,
          endAt,
          durationMs: endAt - at,
          method,
          path: pathName,
          status: null,
          ok: null,
          stream: details.stream,
          hasTools: details.hasTools,
          source: requestSource(category, body),
          error: error instanceof Error ? error.message : "fetch_error",
        });
        throw error;
      }
    };

    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function patchedPlay(): Promise<void> {
      store.events.push({ type: "play", category: "play", at: performance.now() });
      return originalPlay.call(this);
    };

    const markState = () => {
      const element = document.querySelector(".voice-assistant");
      if (!(element instanceof HTMLElement)) return;
      const state = element.getAttribute("data-voice-state") ?? "";
      const last = store.states[store.states.length - 1];
      if (last === undefined || last.state !== state) {
        store.states.push({ state, at: performance.now() });
      }
    };

    const observer = new MutationObserver(markState);
    const observe = () => {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-voice-state"],
        childList: true,
        subtree: true,
      });
      markState();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", observe, { once: true });
    } else {
      observe();
    }
  });
}

async function runSpeechPath(page: Page, runMode: "local" | "model"): Promise<{ transcript: string; reply: string }> {
  const expectedTranscript =
    runMode === "local" ? /jmcp|j m c p|doing|status|healthy/i : /explain|current mission|mission|short sentence/i;
  await page.goto("/");
  await mark(page, "runStart");
  await page.getByRole("button", { name: "Start voice assistant" }).click();
  const transcript = await waitForText(page, ".voice-heard", expectedTranscript, 90000);
  await mark(page, "transcriptVisible");
  const reply = await waitForFreshReply(page, "", 120000);
  await mark(page, "replyVisible");
  await waitForFirstPlayback(page, 120000);
  await expect(page.locator(".voice-assistant")).not.toHaveAttribute("data-voice-state", "thinking", {
    timeout: 5000,
  });
  return { transcript, reply };
}

async function runTypedModelPath(page: Page): Promise<{ transcript: string; reply: string }> {
  await page.goto("/");
  const input = page.getByLabel("Type a command for JMCP");
  const replyLocator = page.locator(".voice-reply");
  const priorReply = (await replyLocator.count()) > 0 ? ((await replyLocator.textContent()) ?? "").trim() : "";
  await input.fill(MODEL_COMMAND);
  await mark(page, "runStart");
  await page.getByRole("button", { name: "Send" }).click();
  const transcript = await waitForText(page, ".voice-heard", /explain the current mission/i, 30000);
  await mark(page, "transcriptVisible");
  const reply = await waitForFreshReply(page, priorReply, 120000);
  await mark(page, "replyVisible");
  const cleanReply = stripMetricLabel(reply);
  expect(cleanReply).toMatch(/\b(JMCP|mission|operator|local|control plane|JCP|JPCM|runtime)\b/i);
  expect(isGenericReply(cleanReply)).toBe(false);
  await expect(page.locator(".voice-assistant")).not.toHaveAttribute("data-voice-state", "thinking", {
    timeout: 5000,
  });
  return { transcript, reply };
}

async function waitForText(page: Page, selector: string, pattern: RegExp, timeout: number): Promise<string> {
  const locator = page.locator(selector);
  await expect(locator).toContainText(pattern, { timeout });
  return ((await locator.textContent()) ?? "").trim();
}

async function waitForFreshReply(page: Page, priorReply: string, timeout: number): Promise<string> {
  const reply = page.locator(".voice-reply");
  await expect
    .poll(
      async () => {
        if ((await reply.count()) === 0) return "";
        const text = ((await reply.textContent()) ?? "").trim();
        if (text.length === 0 || text === priorReply) return "";
        return text;
      },
      { timeout },
    )
    .not.toBe("");
  return ((await reply.textContent()) ?? "").trim();
}

async function waitForFirstPlayback(page: Page, timeout: number): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const target = window as unknown as BrowserMetricWindow;
          return target.__jmcpVoiceMetrics?.events.some((event) => event.type === "play") ?? false;
        }),
      { timeout },
    )
    .toBe(true);
}

async function mark(page: Page, marker: string): Promise<void> {
  await page.evaluate((name) => {
    const target = window as unknown as BrowserMetricWindow;
    if (target.__jmcpVoiceMetrics !== undefined) {
      target.__jmcpVoiceMetrics.markers[name] = performance.now();
    }
  }, marker);
}

async function collectBrowserMetrics(page: Page): Promise<BrowserMetricStore> {
  return page.evaluate(() => {
    const target = window as unknown as BrowserMetricWindow;
    if (target.__jmcpVoiceMetrics !== undefined) {
      target.__jmcpVoiceMetrics.markers.metricsCollected = performance.now();
    }
    return target.__jmcpVoiceMetrics ?? { events: [], states: [], markers: {} };
  });
}

function buildRunMetrics(input: {
  store: BrowserMetricStore;
  startedAt: string;
  completedAt: string;
  transcript: string;
  reply: string;
  reasons: string[];
}): RunMetrics {
  const runStart = input.store.markers.runStart ?? 0;
  const fetches = input.store.events
    .filter((event): event is BrowserFetchEvent => event.type === "fetch" && event.at >= runStart)
    .map((event) => ({
      category: event.category,
      method: event.method,
      path: event.path,
      status: event.status,
      startFromRunMs: round(event.at - runStart),
      durationMs: round(event.durationMs),
      stream: event.stream,
      hasTools: event.hasTools,
      source: event.source,
      error: event.error,
    }));
  const playCalls = input.store.events.filter((event) => event.type === "play" && event.at >= runStart).length;
  const llmFetches = fetches.filter((event) => event.category === "llm");
  const jituxFetches = fetches.filter((event) => event.category === "jitux");

  return {
    runId,
    mode,
    iteration,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    passed: input.reasons.length === 0,
    reasons: input.reasons,
    transcript: stripMetricLabel(input.transcript),
    reply: stripMetricLabel(input.reply),
    counts: {
      asrFetches: fetches.filter((event) => event.category === "asr").length,
      ttsFetches: fetches.filter((event) => event.category === "tts").length,
      llmFetches: llmFetches.length,
      llmStreamFetches: llmFetches.filter((event) => event.stream === true).length,
      jituxFetches: jituxFetches.length,
      jituxSessionPosts: jituxFetches.filter((event) => event.method === "POST").length,
      playCalls,
    },
    timingsMs: calculateTimings(input.store),
    fetches,
  };
}

function calculateTimings(store: BrowserMetricStore): RunTimings {
  const runStart = store.markers.runStart ?? 0;
  const events = store.events.filter((event) => event.at >= runStart);
  const fetches = events.filter((event): event is BrowserFetchEvent => event.type === "fetch");
  const firstAsr = fetches.find((event) => event.category === "asr");
  const ttsFetches = fetches.filter((event) => event.category === "tts");
  const firstTts = ttsFetches[0];
  const firstLlm = fetches.find((event) => event.category === "llm");
  const firstJituxPost = fetches.find((event) => event.category === "jitux" && event.method === "POST");
  const firstPlay = events.find((event): event is BrowserPlayEvent => event.type === "play");
  const transcriptVisibleAt = store.markers.transcriptVisible;
  const replyVisibleAt = store.markers.replyVisible;

  return {
    asrFetchMs: nullableRound(firstAsr?.durationMs),
    ttsFirstFetchMs: nullableRound(firstTts?.durationMs),
    ttsMedianFetchMs: median(ttsFetches.map((event) => event.durationMs)),
    llmFirstFetchMs: nullableRound(firstLlm?.durationMs),
    firstAudioFromRunStartMs: nullableRound(diff(firstPlay?.at, runStart)),
    firstAudioFromAsrResponseMs: nullableRound(diff(firstPlay?.at, firstAsr?.endAt)),
    firstAudioFromTranscriptVisibleMs: nullableRound(diff(firstPlay?.at, transcriptVisibleAt)),
    transcriptVisibleFromRunStartMs: nullableRound(diff(transcriptVisibleAt, runStart)),
    replyVisibleFromRunStartMs: nullableRound(diff(replyVisibleAt, runStart)),
    jituxSessionOpenFromRunStartMs: nullableRound(diff(firstJituxPost?.at, runStart)),
    maxThinkingMs: round(maxStateDuration(store, "thinking")),
  };
}

function evaluateRun(runMode: VoiceLiveMode, store: BrowserMetricStore, reply: string): string[] {
  const timings = calculateTimings(store);
  const runStart = store.markers.runStart ?? 0;
  const events = store.events.filter((event) => event.at >= runStart);
  const fetches = events.filter((event): event is BrowserFetchEvent => event.type === "fetch");
  const reasons: string[] = [];
  const asrFetches = fetches.filter((event) => event.category === "asr");
  const llmFetches = fetches.filter((event) => event.category === "llm");
  const jituxPosts = fetches.filter((event) => event.category === "jitux" && event.method === "POST");
  const firstAudio =
    runMode === "local" || runMode === "model"
      ? timings.firstAudioFromAsrResponseMs
      : timings.firstAudioFromRunStartMs;

  if (timings.maxThinkingMs > MAX_THINKING_MS) {
    reasons.push(`thinking state lasted ${timings.maxThinkingMs}ms, above ${MAX_THINKING_MS}ms`);
  }
  if (runMode === "local") {
    if (asrFetches.length === 0) {
      reasons.push("local speech run did not call ASR");
    }
    if (firstAudio === null || firstAudio > MAX_LOCAL_FIRST_AUDIO_MS) {
      reasons.push(`local first audio after ASR was ${formatMs(firstAudio)}, above ${MAX_LOCAL_FIRST_AUDIO_MS}ms`);
    }
    if (llmFetches.length > 0) {
      reasons.push("local-tool status run unexpectedly called the LLM path");
    }
    if (!/^JMCP is healthy\b/i.test(stripMetricLabel(reply))) {
      reasons.push("local-tool reply was not JMCP-specific status text");
    }
  }
  if (runMode === "model") {
    if (asrFetches.length === 0) {
      reasons.push("model speech run did not call ASR");
    }
    if (firstAudio === null || firstAudio > MAX_MODEL_FIRST_AUDIO_MS) {
      reasons.push(`model first audio after ASR was ${formatMs(firstAudio)}, above ${MAX_MODEL_FIRST_AUDIO_MS}ms`);
    }
    if (jituxPosts.length === 0) {
      reasons.push("model speech run did not open a JITUX session");
    }
    if (llmFetches.length === 0 || !llmFetches.some((event) => event.stream === true)) {
      reasons.push("model speech run did not use streamed LLM reasoning");
    }
  }
  if (runMode === "typed") {
    if (llmFetches.length === 0 || !llmFetches.some((event) => event.stream === true)) {
      reasons.push("typed fallback did not use streamed LLM reasoning");
    }
    if (stripMetricLabel(reply).length === 0) {
      reasons.push("typed fallback did not produce a reply");
    }
  }
  return reasons;
}

function writeReceipt(run: RunMetrics): void {
  if (metricsPath === undefined || metricsPath.length === 0) {
    return;
  }
  const dir = path.dirname(metricsPath);
  fs.mkdirSync(dir, { recursive: true });
  const existing = readReceipt(metricsPath);
  const runs = [...existing.runs.filter((candidate) => candidate.runId !== run.runId), run].sort((a, b) =>
    a.runId.localeCompare(b.runId),
  );
  const receipt: VoiceLiveReceipt = {
    schemaVersion: 1,
    generatedAt: existing.generatedAt,
    updatedAt: new Date().toISOString(),
    serviceChecks: existing.serviceChecks,
    runs,
    summary: summarizeRuns(runs),
  };
  fs.writeFileSync(metricsPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

function readReceipt(filePath: string): VoiceLiveReceipt {
  if (!fs.existsSync(filePath)) {
    return emptyReceipt();
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (parsed !== null && typeof parsed === "object") {
      const record = parsed as Partial<VoiceLiveReceipt>;
      return {
        schemaVersion: 1,
        generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : new Date().toISOString(),
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
        serviceChecks: record.serviceChecks,
        runs: Array.isArray(record.runs) ? record.runs : [],
        summary: record.summary ?? emptyReceipt().summary,
      };
    }
  } catch {
    return emptyReceipt();
  }
  return emptyReceipt();
}

function emptyReceipt(): VoiceLiveReceipt {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    runs: [],
    summary: { passed: false, totalRuns: 0, failedRuns: 0, byMode: {}, failures: [] },
  };
}

function summarizeRuns(runs: RunMetrics[]): VoiceLiveReceipt["summary"] {
  const byMode: Partial<Record<VoiceLiveMode, ReceiptSummaryMode>> = {};
  for (const currentMode of ["local", "model", "typed"] satisfies VoiceLiveMode[]) {
    const modeRuns = runs.filter((run) => run.mode === currentMode);
    if (modeRuns.length === 0) continue;
    byMode[currentMode] = {
      runs: modeRuns.length,
      passed: modeRuns.filter((run) => run.passed).length,
      mediansMs: {
        asrFetchMs: median(modeRuns.map((run) => run.timingsMs.asrFetchMs)),
        ttsFirstFetchMs: median(modeRuns.map((run) => run.timingsMs.ttsFirstFetchMs)),
        firstAudioFromAsrResponseMs: median(modeRuns.map((run) => run.timingsMs.firstAudioFromAsrResponseMs)),
        firstAudioFromRunStartMs: median(modeRuns.map((run) => run.timingsMs.firstAudioFromRunStartMs)),
        replyVisibleFromRunStartMs: median(modeRuns.map((run) => run.timingsMs.replyVisibleFromRunStartMs)),
        maxThinkingMs: median(modeRuns.map((run) => run.timingsMs.maxThinkingMs)),
      },
      maxMs: {
        asrFetchMs: maxNullable(modeRuns.map((run) => run.timingsMs.asrFetchMs)),
        ttsFirstFetchMs: maxNullable(modeRuns.map((run) => run.timingsMs.ttsFirstFetchMs)),
        firstAudioFromAsrResponseMs: maxNullable(modeRuns.map((run) => run.timingsMs.firstAudioFromAsrResponseMs)),
        firstAudioFromRunStartMs: maxNullable(modeRuns.map((run) => run.timingsMs.firstAudioFromRunStartMs)),
        replyVisibleFromRunStartMs: maxNullable(modeRuns.map((run) => run.timingsMs.replyVisibleFromRunStartMs)),
        maxThinkingMs: maxNullable(modeRuns.map((run) => run.timingsMs.maxThinkingMs)),
      },
    };
  }
  const failures = runs
    .filter((run) => !run.passed)
    .map((run) => ({ runId: run.runId, mode: run.mode, reasons: run.reasons }));
  return {
    passed: runs.length > 0 && failures.length === 0,
    totalRuns: runs.length,
    failedRuns: failures.length,
    byMode,
    failures,
  };
}

function isGenericReply(text: string): boolean {
  const clean = stripMetricLabel(text).toLowerCase();
  if (clean.length < 16) return true;
  return (
    /^(working on it|ready|ok|okay|sure|i can help)\b/.test(clean) ||
    /\bas an ai\b/.test(clean) ||
    clean === "working on it."
  );
}

function stripMetricLabel(text: string): string {
  return text.replace(/^\s*(heard|JMCP)\s+/i, "").trim();
}

function maxStateDuration(store: BrowserMetricStore, state: string): number {
  const runStart = store.markers.runStart ?? 0;
  const end = performanceSafeEnd(store);
  const states = store.states.filter((entry) => entry.at >= runStart || entry.state === state);
  let maxDuration = 0;
  for (let index = 0; index < states.length; index += 1) {
    const entry = states[index];
    if (entry.state !== state) continue;
    const nextAt = states[index + 1]?.at ?? end;
    maxDuration = Math.max(maxDuration, nextAt - Math.max(entry.at, runStart));
  }
  return maxDuration;
}

function performanceSafeEnd(store: BrowserMetricStore): number {
  const markerValues = Object.values(store.markers);
  const eventValues = store.events.flatMap((event) => {
    if (event.type === "fetch") return [event.at, event.endAt];
    return [event.at];
  });
  const stateValues = store.states.map((entry) => entry.at);
  return Math.max(0, ...markerValues, ...eventValues, ...stateValues);
}

function median(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) return null;
  const sorted = [...numeric].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return round(sorted[middle]);
  return round((sorted[middle - 1] + sorted[middle]) / 2);
}

function maxNullable(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numeric.length === 0 ? null : round(Math.max(...numeric));
}

function diff(later: number | undefined, earlier: number | undefined): number | undefined {
  if (typeof later !== "number" || typeof earlier !== "number") return undefined;
  return later - earlier;
}

function nullableRound(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? round(value) : null;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatMs(value: number | null): string {
  return value === null ? "missing" : `${value}ms`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
