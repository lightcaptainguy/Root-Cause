// Wire types from SHARED_FRONTEND_CONTRACT.md
// These are the agreed interfaces between frontend and backend.

export type RequestState = 'idle' | 'loading' | 'success' | 'error';

export type SourceKind = 'dataset' | 'recorded' | 'live' | 'simulated' | 'user_supplied';

export interface Source {
  kind: SourceKind;
  name: string | null;
  reference: string | null;
}

export type ImageKind = 'aerial' | 'ground' | 'satellite' | 'unknown';

export type MeasurementQuality = 'valid' | 'stale' | 'missing' | 'invalid';

export interface Measurement {
  name: string;
  value: number | null;
  unit: string;
  measured_at: string | null;
  source: Source;
  quality: MeasurementQuality;
}

export interface ObservationMetadata {
  zone_id: string;
  captured_at: string | null;
  image_kind: ImageKind;
  crop_hint: string | null;
  source: Source;
  measurements: Measurement[];
  notes: string | null;
}

export type AssociationStatus = 'associated' | 'unassociated' | 'partial';

export interface Association {
  status: AssociationStatus;
  method: string | null;
  deltas_ms: Record<string, number>;
}

export interface ObservationImage {
  url: string;
  width: number;
  height: number;
}

export interface Observation extends ObservationMetadata {
  id: string;
  received_at: string;
  image: ObservationImage;
  association: Association;
  latest_result_id?: string | null;
}

export type MetricStatus = 'available' | 'unavailable' | 'invalid';

export interface Metric {
  name: string;
  value: number | null;
  unit: string;
  formula_id: string;
  formula_version: string;
  input_refs: string[];
  status: MetricStatus;
}

export interface Box {
  coordinates: [number, number, number, number];
  label: string;
  score: number | null;
  method: string;
}

export type SegmentationDenominator = 'leaf_area' | 'image_area' | null;

export interface Segmentation {
  mask_url: string | null;
  denominator: SegmentationDenominator;
  leaf_area_px: number | null;
  image_area_px: number | null;
}

export interface AnalysisResult {
  id: string;
  observation_id: string;
  created_at: string;
  classification: {
    label: string;
    score: number | null;
    method: string;
  } | null;
  metrics: Metric[];
  boxes: Box[];
  segmentation: Segmentation | null;
  notes: string | null;
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AnalysisJob {
  id: string;
  observation_id: string;
  status: JobStatus;
  result_id: string | null;
  error: ApiError | null;
}

export type AttentionStatus = 'attention' | 'no_flag' | 'unknown';

export interface AttentionItem {
  observation_id: string;
  zone_id: string;
  status: AttentionStatus;
  reasons: string[];
  rule_version: string | null;
}

export type HealthStatus = 'ok' | 'degraded';

export interface Health {
  status: HealthStatus;
  vision_ready: boolean;
  ollama_ready: boolean;
  capabilities: Record<string, boolean>;
}

export interface Zone {
  id: string;
  name: string;
  crop: string | null;
  area_ha: number | null;
}

export type EvidenceKind = 'observation' | 'result' | 'reference' | 'formula';

export interface EvidenceItem {
  kind: EvidenceKind;
  id: string;
  title: string;
  observation_id: string | null;
  result_id: string | null;
}

export interface ApiError {
  code: string;
  message: string;
  details: unknown;
}

export interface ChatRequest {
  message: string;
  zone_id?: string;
  observation_id?: string;
  conversation_id?: string;
}

export interface ChatResponse {
  conversation_id: string;
  answer: string;
  evidence: EvidenceItem[];
  limitations: string[];
}
