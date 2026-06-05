import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { geometryRuntimeReceipt, requiredProofStates } from "../src/geometry-runtime";

const artifactDir = path.resolve(process.cwd(), "../../target/jankurai/ux-qa");
const apiOrigin = "http://127.0.0.1:18877";
const fixedNow = "2026-06-04T12:34:56Z";
const states = requiredProofStates.map((state) => ({
  ...state,
  fileName: state.id,
}));

type RuntimePayloads = Record<string, unknown>;

function runtimePayloads(workKind = "live.mock"): RuntimePayloads {
  const timestamp = "2026-06-04T12:00:00Z";
  const tool = {
    name: "jeryu.mock.query",
    className: "codegraph",
    conformance: "C1 governed",
    sideEffects: "none",
    dataClasses: ["repo"],
    repo: "Jeryu",
    provider: "jeryu",
    health: "nominal",
    dependsOn: ["jmcpd.work-orders"],
    queue: 0,
  };
  return {
    "/health": { ok: true },
    "/work-orders": [
      {
        id: "WO-live",
        subject: "tenant/jeryu/entity",
        status: "Submitted",
        task: { kind: workKind, payload: { repo: "Jeryu", branch: "mock/runtime" } },
        evidence: [{}],
        updated_at: timestamp,
      },
    ],
    "/evidence": [{ kind: "mock.evidence", uri: "sha256:liveproof", captured_at: timestamp }],
    "/systems": [{ name: "jmcpd", role: "runtime", health: "nominal", jcp: "1.0.0", latency: "1ms" }],
    "/attention": [
      {
        attention_packet_id: "AP-live",
        work_order_id: "WO-live",
        attention_level: "decision",
        modality: "api",
        user_visible_summary: "Mock approval visible",
        recommendation: "Approve the mocked proof",
        decision_needed: true,
        options: [{ option_id: "approve", label: "Approve", effect: "allows proof", risk: "low" }],
        risk_delta: { from: "medium", to: "low", note: "mocked" },
        drilldown_refs: [],
        created_at: timestamp,
        expires_at: "2026-06-04T13:00:00Z",
      },
    ],
    "/voice-text": [
      {
        interaction_id: "VT-live",
        channel: "text",
        speaker_id: "telegram:user:42",
        title: "Mock approval transcript",
        voice_state: "confirmed",
        transcript: "approve mock proof",
        intent: "approval",
        confidence: 1,
        confirmation_phrase: "mock",
        requires_response: true,
        decision_options: ["approve", "deny"],
        updated_at: timestamp,
        source_ref: "voice.mock",
      },
    ],
    "/memory": [
      {
        memory_id: "ML-live",
        scope: "mock coverage",
        claim: "Runtime mocks preserve cockpit rendering.",
        lesson_state: "promoted",
        confidence: 99,
        retention: "project",
        expiry: "never",
        promotion: { status: "promoted", gate: "mock proof", reviewed_by: "codex", promoted_at: timestamp },
        counterexamples: [],
        source: "mock.runtime",
        rollback: "revert mock fixture",
      },
    ],
    "/replay": { events: 7, checkpoints: [{ id: "checkpoint-live", last_event_id: 7, created_at: timestamp }] },
    "/approvals": [{ work_order_id: "WO-live", approver: "telegram:user:42", expires_at: "2026-06-04T13:00:00Z", decision: null }],
    "/approval-challenges": [
      {
        id: "challenge-live",
        work_order_id: "WO-live",
        approver: "telegram:user:42",
        channel: "telegram",
        token_hash: "sha256:live",
        target_user_id: 42,
        target_chat_id: 99,
        expires_at: "2026-06-04T13:00:00Z",
        state: "pending",
      },
    ],
    "/adapters": {
      service_cards: [{ name: "jeryu", capabilities: ["mock.query"], subjects: ["repo"] }],
      health: [{ name: "jeryu", health: "nominal", endpoint: "mock://jeryu", detail: "mocked" }],
    },
    "/ecosystem": { tools: [tool], live: true },
    "/fleet-board": {
      generated_at_note: "mocked",
      schema: "fleet-board.v1",
      repos: [
        {
          name: "JMCP",
          path: "/home/ubuntu/jmcp",
          branch: "mock/runtime",
          ci_configured: true,
          score: 96,
          raw: 96,
          caps: [],
          caps_count: 0,
          hard_findings: 0,
          score_freshness: "fresh",
          active_runner_count: 0,
          runner_busy: false,
          jeryu_gate: "pass",
          artifact_state: { local: "present", dev_canary: "present", prod: "present", release: "present", promote: "present" },
        },
      ],
      totals: { repo_count: 1, audited: 1, failed: 0, min_score: 96, max_score: 96, average_score: 96, total_hard_findings: 0, below_threshold: 0 },
    },
    "/universe": {
      live: true,
      bootstrapTui: {
        live: true,
        observedCoverage: 100,
        activeRepos: [{ repo: "Jeryu", toolCount: 1, score: 96, health: "nominal" }],
        repoScores: [{ repo: "Jeryu", toolCount: 1, score: 96, coverage: 100, currentTask: workKind, branch: "mock/runtime", pool: "local", placement: "jmcpd", health: "nominal" }],
        placements: [{ agent: "Jeryu", repo: "Jeryu", currentTask: workKind, branch: "mock/runtime", pool: "local", placement: "jmcpd", score: 96, health: "nominal" }],
        degradedSlices: [],
      },
      ecosystem: { tools: [tool], live: true },
    },
    "/control-plane": {
      generatedAt: timestamp,
      eventWatermark: 7,
      eventBus: { appendOnly: true, streamUrl: "/events", sources: ["mock"] },
      repos: [
        {
          name: "JMCP",
          health: "nominal",
          currentVersion: "0.1.0",
          lastSuccessfulMainCi: timestamp,
          lastBinary: timestamp,
          lastTests: timestamp,
          latestChangedFiles: ["apps/web/tests/rendered-ux.spec.ts"],
          activeWorkcells: 1,
          overdueActivity: false,
          stuckActivity: false,
          failingAudit: false,
          auditReason: null,
          rerunCommand: "just coverage-proof",
        },
      ],
      activeWorkcells: [
        {
          id: "wc-live",
          repo: "JMCP",
          agent: "Codex",
          task: "Mock cockpit runtime",
          status: "running",
          allowedSlice: ["apps/web"],
          persistence: "pr_export_only",
          pty: "pty_disabled",
          updatedAt: timestamp,
          overdue: false,
          stuck: false,
          rerunCommand: "just coverage-proof",
        },
      ],
      auditLanes: [{ repo: "JMCP", lane: "coverage-proof", health: "nominal", reason: "mocked", latestEvidence: "target/jankurai/coverage/mock-coverage.json", rerunCommand: "just coverage-proof" }],
      policy: { sandboxRequired: true, directPersistenceAllowed: false, prExportRequired: true, ptyDefault: "pty_disabled", findingCount: 0 },
      versioning: { current: "0.1.0", recommended: "0.1.0", impact: "none", reason: "mocked", releaseCompatible: true, rollbackCompatible: true },
      streams: [{ name: "events", url: "/events", stdoutStderr: false, ptyInput: false, interactiveOnly: false }],
    },
  };
}

async function freezeTimeAndMockEventSource(page: Page) {
  await page.addInitScript((now) => {
    const fixed = new Date(now).valueOf();
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        super(...(args.length === 0 ? [fixed] : args));
      }
      static now() {
        return fixed;
      }
    }
    Object.setPrototypeOf(FixedDate, NativeDate);
    window.Date = FixedDate as DateConstructor;

    class MockEventSource {
      url: string;
      closed = false;
      listeners: Record<string, Array<(event: MessageEvent<string>) => void>> = {};
      constructor(url: string) {
        this.url = url;
        ((window as any).__jmcpEventSources ??= []).push(this);
      }
      addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        (this.listeners[type] ??= []).push(listener);
      }
      close() {
        this.closed = true;
      }
      emit(type: string, payload: unknown) {
        for (const listener of this.listeners[type] ?? []) {
          listener({ data: JSON.stringify(payload) } as MessageEvent<string>);
        }
      }
    }
    (window as any).EventSource = MockEventSource;
  }, fixedNow);
}

async function mockRuntimeRoutes(page: Page, payloads: RuntimePayloads, rejectedPaths = new Set<string>()) {
  await page.route(`${apiOrigin}/**`, async (route) => {
    const pathName = new URL(route.request().url()).pathname;
    if (rejectedPaths.has(pathName)) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: `mock failure ${pathName}` }),
      });
      return;
    }
    if (!(pathName in payloads)) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: `unmocked ${pathName}` }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payloads[pathName]),
    });
  });
}

async function assertNoAxeViolations(page: Page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
}

test("renders every required proof state with accessibility checks", async ({ page }) => {
  await fs.mkdir(artifactDir, { recursive: true });
  await freezeTimeAndMockEventSource(page);
  await mockRuntimeRoutes(page, runtimePayloads(), new Set(Object.keys(runtimePayloads())));
  await page.goto("/");
  const geometryEvidence: Array<{
    state: string;
    viewport: { width: number; height: number } | null;
    proofShell: { x: number; y: number; width: number; height: number } | null;
  }> = [];

  for (const state of states) {
    await page.getByRole("button", { name: new RegExp(`^${state.label}$`) }).click();
    await expect(page.locator(".proof-shell")).toHaveAttribute("data-proof-state", state.id);
    await expect(page.getByRole("heading", { name: state.label })).toBeVisible();
    const stateCard = page.locator(".proof-stage .state-card");
    await expect(stateCard).toMatchAriaSnapshot({
      name: `${state.fileName}.aria.yml`,
    });
    await expect(stateCard).toHaveScreenshot(`${state.fileName}.png`, {
      animations: "disabled",
    });

    await assertNoAxeViolations(page);
    geometryEvidence.push({
      state: state.id,
      viewport: page.viewportSize(),
      proofShell: await page.locator(".proof-shell").boundingBox(),
    });

    await page.screenshot({
      path: path.join(artifactDir, `apps-web-${state.fileName}.png`),
      fullPage: true,
    });
  }

  await fs.writeFile(
    path.resolve(process.cwd(), "../../", geometryRuntimeReceipt),
    `${JSON.stringify(geometryEvidence, null, 2)}\n`,
  );

  await expect(page.getByRole("heading", { name: "Now", level: 1 })).toBeVisible();
});

test("renders cockpit fixture fallback without a live backend", async ({ page }) => {
  await freezeTimeAndMockEventSource(page);
  await mockRuntimeRoutes(page, runtimePayloads(), new Set(Object.keys(runtimePayloads())));
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Now", level: 1 })).toBeVisible();
  await expect(page.getByText("JPCM stream degraded")).toBeVisible();
  await page.getByRole("button", { name: "Work" }).click();
  await expect(page.getByText("Promote JCP schema bindings into the SDK crate")).toBeVisible();
  await assertNoAxeViolations(page);
  await page.screenshot({
    path: path.join(artifactDir, "apps-web-cockpit-fixture-fallback.png"),
    fullPage: true,
  });
});

test("renders fully mocked healthy cockpit runtime with approvals replay and event refresh", async ({ page }) => {
  const payloads = runtimePayloads("live.mock");
  await freezeTimeAndMockEventSource(page);
  await mockRuntimeRoutes(page, payloads);
  await page.goto("/");

  await expect(page.getByText("JPCM stream healthy")).toBeVisible();
  await page.getByRole("button", { name: "Work" }).click();
  await expect(page.getByText("live.mock")).toBeVisible();
  await page.getByRole("button", { name: "Approvals" }).click();
  await expect(page.getByText("sha256:live")).toBeVisible();
  await expect(page.getByText("challenge.challenge-live")).toBeVisible();
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(page.getByText("checkpoint-live")).toBeVisible();

  Object.assign(payloads, runtimePayloads("live.refreshed"));
  await page.evaluate(() => {
    const sources = (window as any).__jmcpEventSources;
    sources[sources.length - 1].emit("jmcp.events", [{ id: 2, event_type: "work.updated" }]);
  });
  await page.getByRole("button", { name: "Work" }).click();
  await expect(page.getByText("live.refreshed")).toBeVisible();
  await assertNoAxeViolations(page);
  await page.screenshot({
    path: path.join(artifactDir, "apps-web-cockpit-healthy-mocked.png"),
    fullPage: true,
  });
});

test("renders partial degraded cockpit runtime with live work fallback slices", async ({ page }) => {
  await freezeTimeAndMockEventSource(page);
  await mockRuntimeRoutes(page, runtimePayloads("partial.live"), new Set(["/ecosystem", "/universe", "/fleet-board"]));
  await page.goto("/");

  await expect(page.getByText("JPCM stream degraded")).toBeVisible();
  await page.getByRole("button", { name: "Work" }).click();
  await expect(page.getByText("partial.live")).toBeVisible();
  await page.getByRole("button", { name: "Universe" }).click();
  await expect(page.getByText(/Jeryu ecosystem unavailable/i).first()).toBeVisible();
  await assertNoAxeViolations(page);
  await page.screenshot({
    path: path.join(artifactDir, "apps-web-cockpit-partial-degraded.png"),
    fullPage: true,
  });
});
