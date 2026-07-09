export interface MetricEffect {
  version: "4.0" | "3.1";
  metric: string;
  value: string;
  effect: "override" | "cap";
}

export interface Option {
  id: string;
  label: string;
  description?: string;
  effects: MetricEffect[];
}

export interface Question {
  id: string;
  order: number;
  question: string;
  whyWeAsk: string;
  finePrint?: string;
  options: Option[];
}

export interface Catalog {
  catalogVersion: string;
  questions: Question[];
}

export interface InterviewCompletion {
  "4.0": boolean;
  "3.1": boolean;
}

export interface Environment {
  id: number;
  name: string;
  description: string;
  catalogVersion: string;
  createdAt: string;
  updatedAt: string;
  interviewCompletion: InterviewCompletion;
}

export interface Answer {
  questionId: string;
  optionId: string;
}

export interface DerivedMetric {
  cvssVersion: "4.0" | "3.1";
  metric: string;
  value: string;
  effect: "override" | "cap";
}

export interface EnvironmentDetail extends Environment {
  answers: Answer[];
  metrics: DerivedMetric[];
}

export type Severity = "None" | "Low" | "Medium" | "High" | "Critical";

export interface BaseScoreResult {
  version: "4.0" | "3.1";
  vector: string;
  score: number;
  severity: Severity;
  note?: string;
  pastedVectorHasEnvironmentalMetrics: boolean;
}

export interface ScoreChange {
  metric: string;
  metricName: string;
  fromValue: string;
  fromValueName: string;
  toValue: string;
  toValueName: string;
  effect: "override" | "cap";
  impact: number;
  direction: "worse" | "better" | "neutral";
  questionId: string;
  optionId: string;
}

export interface AnsweredQuestionNote {
  questionId: string;
  question: string;
  optionId: string;
  optionLabel: string;
  status: "no-effect" | "capped-by-base" | "not-applicable-to-version";
  reason: string;
}

export interface ScoredEnvironment {
  id: number;
  name: string;
  hasProfile: true;
  score: number;
  severity: Severity;
  vector: string;
  delta: number;
  changes: ScoreChange[];
  notes: AnsweredQuestionNote[];
}

export interface UnscoredEnvironment {
  id: number;
  name: string;
  hasProfile: false;
}

export type EnvironmentScoreResult = ScoredEnvironment | UnscoredEnvironment;

export interface ScoreResponse {
  base: BaseScoreResult;
  environments: EnvironmentScoreResult[];
}

export interface ApiError {
  error: string;
}

export interface NvdVectorOption {
  source: string;
  type: string;
  version: "4.0" | "3.1" | "3.0";
  vector: string;
  baseScore: number;
  baseSeverity: string;
}

export interface CveResponse {
  cveId: string;
  cached: boolean;
  fetchedAt: string | null;
  primaryVector: string;
  primaryVersion: string;
  vectors: NvdVectorOption[];
}

export interface MajorCveEntry {
  cveId: string;
  vector: string;
  version: "4.0" | "3.1" | "3.0";
  baseScore: number;
  baseSeverity: string;
  published: string;
}

export interface MajorCvesResponse {
  cached: boolean;
  fetchedAt: string;
  cves: MajorCveEntry[];
}

export interface SavedVulnerability {
  id: number;
  label: string;
  description: string;
  source: "vector" | "nvd";
  cveId: string | null;
  vector: string;
  cvssVersion: string;
  baseScore: number;
  fetchedAt: string | null;
  createdAt: string;
}

export interface SavedVulnerabilityDetail extends SavedVulnerability {
  vectors: NvdVectorOption[];
}
