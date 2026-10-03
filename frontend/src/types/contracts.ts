// Wire shapes match backend/contracts.py and docs/openapi.json.
export type RequestState = 'idle' | 'loading' | 'success' | 'error';
export type SourceKind = 'dataset' | 'recorded' | 'live' | 'simulated' | 'user_supplied';
export interface Source { kind: SourceKind; name: string | null; reference: string | null }
export type ImageKind = 'closeup_leaf' | 'aerial' | 'other';
export interface Measurement {
  name: string; value: number | null; unit: string; measured_at: string | null;
  source: Source; quality: 'valid' | 'stale' | 'missing' | 'invalid';
}
export interface ObservationMetadata {
  zone_id: string; captured_at: string | null; image_kind: ImageKind; crop_hint: string | null;
  source: Source; measurements: Measurement[]; notes: string | null;
}
export interface Observation extends ObservationMetadata {
  id: string; received_at: string; image: { url: string; width: number; height: number };
  association: { status: 'associated' | 'unassociated' | 'partial'; method: string | null; deltas_ms: Record<string, number> };
  latest_result_id: string | null;
}
export type CapabilityStatus = 'available' | 'unavailable' | 'unsupported' | 'failed';
export interface Box { coordinates: [number, number, number, number]; label: string; score: number | null; method: string }
export interface Metric {
  name: string; value: number | null; unit: string; formula_id: string; formula_version: string;
  input_refs: string[]; status: 'available' | 'unavailable' | 'invalid';
}
export interface Segmentation {
  status: CapabilityStatus; method: string | null; mask_url: string | null;
  affected_fraction: number | null; denominator: 'leaf_area' | 'image_area' | null;
}
export interface AnalysisResult {
  id: string; observation_id: string; created_at: string;
  status: 'completed' | 'partial' | 'unsupported' | 'failed';
  classification: { status: CapabilityStatus; crop: string | null; label: string | null; score: number | null; model_id: string | null };
  localization: { status: CapabilityStatus; method: string | null; boxes: Box[] };
  segmentation: Segmentation; metrics: Metric[]; attention: Attention; limitations: string[];
  timings_ms: { queue: number; inference: number; total: number };
}
export interface ApiError { code: string; message: string; details: unknown }
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
export interface AnalysisJob { id: string; observation_id: string; status: JobStatus; result_id: string | null; error: ApiError | null }
export interface AnalyzeAccepted { job_id: string; observation_id: string; status: 'queued' | 'running' }
export interface Attention { status: 'attention' | 'no_flag' | 'unknown'; reasons: string[]; rule_version: string | null }
export interface AttentionItem extends Attention { observation_id: string; zone_id: string }
export interface Health { status: 'ok' | 'degraded'; vision_ready: boolean; ollama_ready: boolean; capabilities: Record<string, boolean> }
export interface Zone { id: string; name: string }
export interface EvidenceItem {
  kind: 'observation' | 'result' | 'reference' | 'formula'; id: string; title: string;
  observation_id: string | null; result_id: string | null;
}
export interface ChatRequest { message: string; zone_id?: string; observation_id?: string; conversation_id?: string }
export interface ChatResponse { conversation_id: string; answer: string; evidence: EvidenceItem[]; limitations: string[] }
