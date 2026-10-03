// Typed native-fetch client for all backend routes.
// Handles error envelopes, network/HTTP/invalid-response errors.

import type {
  AnalysisJob,
  AnalysisResult,
  AttentionItem,
  ChatRequest,
  ChatResponse,
  Health,
  Observation,
  ObservationMetadata,
  Zone,
} from '../types/contracts';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Timeouts
const DEFAULT_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS = 120_000;

export class ApiRequestError extends Error {
  code: string;
  status: number | null;
  details: unknown;

  constructor(code: string, message: string, status: number | null = null, details: unknown = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function isErrorEnvelope(data: unknown): data is ErrorEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as ErrorEnvelope).error === 'object' &&
    (data as ErrorEnvelope).error !== null &&
    'code' in (data as ErrorEnvelope).error &&
    'message' in (data as ErrorEnvelope).error
  );
}

async function parseErrorResponse(response: Response): Promise<ApiRequestError> {
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return new ApiRequestError(
      'INVALID_RESPONSE',
      `Server returned non-JSON response (HTTP ${response.status})`,
      response.status,
      text.slice(0, 500),
    );
  }

  if (isErrorEnvelope(data)) {
    return new ApiRequestError(
      data.error.code,
      data.error.message,
      response.status,
      data.error.details ?? null,
    );
  }

  return new ApiRequestError(
    'INVALID_RESPONSE',
    `Unexpected response shape (HTTP ${response.status})`,
    response.status,
    data,
  );
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiRequestError('TIMEOUT', 'Request timed out', null, null);
    }
    throw new ApiRequestError('NETWORK_ERROR', 'Network error — server unreachable', null, String(err));
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiRequestError('INVALID_RESPONSE', 'Response was not valid JSON', response.status, null);
  }

  return data as T;
}

// --- Route implementations ---

export async function fetchHealth(): Promise<Health> {
  return request<Health>('/health');
}

export async function fetchZones(): Promise<Zone[]> {
  return request<Zone[]>('/zones');
}

export async function fetchObservations(zoneId: string): Promise<Observation[]> {
  return request<Observation[]>(`/zones/${encodeURIComponent(zoneId)}/observations`);
}

export async function fetchAttention(zoneId: string): Promise<AttentionItem[]> {
  return request<AttentionItem[]>(`/zones/${encodeURIComponent(zoneId)}/attention`);
}

export async function importObservation(
  image: File,
  metadata: ObservationMetadata,
): Promise<Observation> {
  const formData = new FormData();
  formData.append('image', image);
  formData.append('metadata', JSON.stringify(metadata));

  return request<Observation>('/observations', {
    method: 'POST',
    body: formData,
  });
}

export async function analyzeObservation(observationId: string): Promise<AnalysisJob> {
  return request<AnalysisJob>(`/observations/${encodeURIComponent(observationId)}/analyze`, {
    method: 'POST',
  });
}

export async function fetchJob(jobId: string): Promise<AnalysisJob> {
  return request<AnalysisJob>(`/jobs/${encodeURIComponent(jobId)}`);
}

export async function fetchResult(resultId: string): Promise<AnalysisResult> {
  return request<AnalysisResult>(`/results/${encodeURIComponent(resultId)}`);
}

export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  }, CHAT_TIMEOUT_MS);
}

export function getAssetUrl(path: string): string {
  return `${API_BASE}/assets/${path}`;
}
