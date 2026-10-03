export type ImageKind = "closeup_leaf" | "aerial" | "other";
export type JobState = "queued" | "running" | "completed" | "failed";
export type Source = string; // default "user_supplied"; never auto "plantvillage"

export interface Zone {
  id: string;
  name: string;
  area?: string;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Geometry {
  width: number;
  height: number;
  box?: Box;
  boxMethod?: string;
  maskUrl?: string;
  maskMethod?: string;
}

export interface Measurement {
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
  source: string;
  measuredAt: string | null;
  quality: string;
}

export interface FormulaOutput {
  name: string;
  formula: string | null;
  version: string | null;
  value: number | null;
  unit: string | null;
}

export interface Metric {
  label: string;
  value: string;
}

export interface AnalysisResult {
  crop: string | null;
  predictedLabel: string | null;
  score: number | null; // model score 0..1; null => Unavailable
  modelId: string | null;
  capturedAt: string | null;
  receivedAt: string;
  measurements: Measurement[];
  formulaOutputs: FormulaOutput[];
  metrics: Metric[];
  affectedFraction: { value: number; denominator: "leaf_area" | "image_area" } | null;
  limitations: string[];
  evidence: {
    modelId: string | null;
    modelVersion: string | null;
    localizationMethod: string;
    segmentationMethod: string | null;
    notes: string;
  };
}

export interface Observation {
  id: string;
  zoneId: string;
  source: Source;
  imageKind: ImageKind;
  crop: string | null;
  capturedAt: string | null;
  receivedAt: string;
  notes: string;
  imageUrl: string;
  geometry: Geometry | null;
  job: JobState | null;
  error: string | null;
  result: AnalysisResult | null;
}

export type AttentionStatus = "flagged" | "no_flag" | "unknown";

export interface AttentionReason {
  id: string;
  zoneId: string;
  observationId: string | null;
  status: AttentionStatus;
  title: string;
  detail: string;
}

export interface AttentionReport {
  ruleVersion: string;
  generatedAt: string;
  reasons: AttentionReason[];
}

export interface ImportInput {
  file: File;
  zoneId: string;
  imageKind: ImageKind;
  crop: string;
  capturedAt: string; // "" when not provided; never auto-filled
  source: string;
  notes: string;
  metadataJson: string; // optional raw JSON
}

export class ApiError extends Error {
  constructor(
    public kind:
      | "backend_offline"
      | "queue_full"
      | "upload_failure"
      | "metadata_invalid"
      | "failed_inference"
      | "unsupported_aerial"
      | "not_found",
    message: string,
    public details?: string[],
  ) {
    super(message);
  }
}
