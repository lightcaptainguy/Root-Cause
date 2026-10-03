import type {
  AnalysisJob, AnalysisResult, AnalyzeAccepted, AttentionItem, ChatRequest, ChatResponse,
  Health, Observation, ObservationMetadata, Zone,
} from '../types/contracts';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS = 120_000;

export class ApiRequestError extends Error {
  constructor(public code: string, message: string, public status: number | null = null, public details: unknown = null) {
    super(message); this.name = 'ApiRequestError';
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function request<T>(path: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const external = options.signal;
  const abort = () => controller.abort();
  if (external?.aborted) controller.abort();
  external?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(API_BASE + path, { ...options, signal: controller.signal });
    let data: unknown;
    try { data = await response.json(); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ApiRequestError('INVALID_RESPONSE', 'Server returned a non-JSON response', response.status);
    }
    if (!response.ok) {
      if (record(data) && record(data.error) && typeof data.error.code === 'string' && typeof data.error.message === 'string') {
        throw new ApiRequestError(data.error.code, data.error.message, response.status, data.error.details ?? null);
      }
      throw new ApiRequestError('INVALID_RESPONSE', 'Unexpected error response (HTTP ' + response.status + ')', response.status);
    }
    if (!record(data)) throw new ApiRequestError('INVALID_RESPONSE', 'Expected a JSON object', response.status);
    return data as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (controller.signal.aborted) {
      throw new ApiRequestError(external?.aborted ? 'CANCELLED' : 'TIMEOUT', external?.aborted ? 'Request cancelled' : 'Request timed out');
    }
    throw new ApiRequestError('NETWORK_ERROR', 'Backend unreachable. Check that the local server is running.');
  } finally {
    clearTimeout(timeout); external?.removeEventListener('abort', abort);
  }
}
function items<T>(data: { items: T[] }): T[] {
  if (!Array.isArray(data.items)) throw new ApiRequestError('INVALID_RESPONSE', 'Expected an items list');
  return data.items;
}
function observation(data: Observation): Observation {
  if (typeof data.id !== 'string' || typeof data.zone_id !== 'string' || !record(data.image) ||
      typeof data.image.url !== 'string' || !Array.isArray(data.measurements)) {
    throw new ApiRequestError('INVALID_RESPONSE', 'Observation does not match backend contract');
  }
  return data;
}
export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const data = await request<Health>('/health', { signal });
  if (typeof data.vision_ready !== 'boolean' || typeof data.ollama_ready !== 'boolean') throw new ApiRequestError('INVALID_RESPONSE', 'Invalid health response');
  return data;
}
export async function fetchZones(signal?: AbortSignal): Promise<Zone[]> {
  return items(await request<{ items: Zone[] }>('/zones', { signal }));
}
export async function createZone(zone: Zone, signal?: AbortSignal): Promise<Zone> {
  return request('/zones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(zone), signal });
}
export async function fetchObservations(zoneId: string, signal?: AbortSignal): Promise<Observation[]> {
  return items(await request<{ items: Observation[] }>('/observations?zone_id=' + encodeURIComponent(zoneId), { signal })).map(observation);
}
export async function fetchObservation(id: string, signal?: AbortSignal): Promise<Observation> {
  return observation(await request('/observations/' + encodeURIComponent(id), { signal }));
}
export async function fetchAttention(zoneId: string, signal?: AbortSignal): Promise<AttentionItem[]> {
  return items(await request<{ items: AttentionItem[] }>('/attention?zone_id=' + encodeURIComponent(zoneId), { signal }));
}
export async function importObservation(image: File, metadata: ObservationMetadata, signal?: AbortSignal): Promise<Observation> {
  const formData = new FormData();
  formData.append('image', image);
  formData.append('metadata', JSON.stringify(metadata));
  return observation(await request('/observations', { method: 'POST', body: formData, signal }));
}
export async function analyzeObservation(id: string, signal?: AbortSignal): Promise<AnalyzeAccepted> {
  const data = await request<AnalyzeAccepted>('/observations/' + encodeURIComponent(id) + '/analyze', { method: 'POST', signal });
  if (typeof data.job_id !== 'string') throw new ApiRequestError('INVALID_RESPONSE', 'Analysis acceptance has no job_id');
  return data;
}
export async function fetchJob(id: string, signal?: AbortSignal): Promise<AnalysisJob> {
  return request('/jobs/' + encodeURIComponent(id), { signal });
}
export async function fetchResult(id: string, signal?: AbortSignal): Promise<AnalysisResult> {
  const data = await request<AnalysisResult>('/results/' + encodeURIComponent(id), { signal });
  if (typeof data.id !== 'string' || !record(data.classification) || !record(data.localization) || !record(data.segmentation)) {
    throw new ApiRequestError('INVALID_RESPONSE', 'Analysis result does not match backend contract');
  }
  return data;
}
export async function sendChat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  return request('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req), signal }, CHAT_TIMEOUT_MS);
}
export function getAssetUrl(path: string): string {
  if (!path.startsWith('/api/assets/') || path.includes('..')) throw new ApiRequestError('INVALID_RESPONSE', 'Invalid backend asset URL');
  return API_BASE + path.slice('/api'.length);
}
