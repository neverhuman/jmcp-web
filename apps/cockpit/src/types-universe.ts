import type { Health, ScoreFreshness } from "./types-core";

export interface SystemIncident {
  title: string;
  summary: string;
  quarantine: string;
  drilldown: string[];
}

export interface SystemNode {
  name: string;
  role: string;
  health: Health;
  jcp: string;
  latency: string;
  incident?: SystemIncident;
}

export interface ToolAsset {
  name: string;
  className: string;
  conformance: string;
  sideEffects: string;
  dataClasses: string[];
  repo?: string;
  provider?: string;
  health?: Health;
  dependsOn?: string[];
  queue?: number;
}

export interface UniverseSlice {
  name: string;
  live: boolean;
  coverage: number;
  degradedReason?: string;
}

export interface UniverseActiveRepo {
  repo: string;
  toolCount: number;
  score: number;
  health: Health;
}

export interface UniverseRepoScore {
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
}

export interface UniversePlacement {
  agent: string;
  repo: string;
  currentTask: string;
  branch: string;
  pool: string;
  placement: string;
  score: number;
  health: Health;
  degradedReason?: string;
}

export interface UniverseBootstrapTui {
  live: boolean;
  observedCoverage: number;
  activeRepos: UniverseActiveRepo[];
  repoScores: UniverseRepoScore[];
  placements: UniversePlacement[];
  degradedSlices: UniverseSlice[];
  degradedReason?: string;
}

export interface UniverseSnapshot {
  live: boolean;
  bootstrapTui: UniverseBootstrapTui;
  ecosystem: {
    tools: ToolAsset[];
    live: boolean;
    degradedReason?: string;
  };
}

export interface FleetBoardError {
  path: string;
  error: string;
}

export interface FleetBoardTotals {
  repoCount: number;
  audited: number;
  failed: number;
  minScore?: number | null;
  maxScore?: number | null;
  averageScore?: number | null;
  totalHardFindings: number;
  belowThreshold: number;
}

export interface FleetBoardRepo {
  name: string;
  path: string;
  branch?: string | null;
  host?: string | null;
  dirty?: number | null;
  dirtyFiles?: number | null;
  lastCommitSha?: string | null;
  headSha?: string | null;
  lastCommitWhen?: string | null;
  lastCommitEpoch?: number | null;
  lastBinaryEpoch?: number | null;
  lastTestsEpoch?: number | null;
  version?: string | null;
  ciConfigured: boolean;
  score?: number | null;
  raw?: number | null;
  caps: string[];
  capsCount?: number | null;
  hardFindings?: number | null;
  hlLevel?: string | null;
  scoreSource?: string | null;
  scoreFreshness: ScoreFreshness;
  activeRunnerCount: number;
  runnerBusy: boolean;
  runnerHint?: string | null;
  mainCiAgeSeconds?: number | null;
  jeryuGate: string;
  artifactState: {
    local: string;
    devCanary: string;
    prod: string;
    release: string;
    promote: string;
    latestSha?: string | null;
  };
  topFindings: string[];
  topToolOpportunities: string[];
}

export interface FleetBoardSnapshot {
  generatedAtNote: string;
  schema: string;
  repos: FleetBoardRepo[];
  totals: FleetBoardTotals;
  errors: FleetBoardError[];
}
