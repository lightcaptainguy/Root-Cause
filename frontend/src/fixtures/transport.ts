// Fixture transport layer — intercepts API calls when VITE_DATA_MODE=fixture.
// Fixture mode can never silently activate after a live API failure.

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
import {
  FIXTURE_ATTENTION,
  FIXTURE_HEALTH,
  FIXTURE_OBSERVATIONS,
  FIXTURE_RESULTS,
  FIXTURE_ZONES,
  advanceFixtureJob,
  createFixtureChatResponse,
  createFixtureJob,
  createFixtureObservation,
  createFixtureResult,
} from './data';

const IS_FIXTURE = import.meta.env.VITE_DATA_MODE === 'fixture';

// In-memory job store for fixture mode
const fixtureJobs = new Map<string, AnalysisJob>();

export function isFixtureMode(): boolean {
  return IS_FIXTURE;
}

// Simulated delay
function delay(ms: number = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fixtureFetchHealth(): Promise<Health> {
  await delay(50);
  return { ...FIXTURE_HEALTH };
}

export async function fixtureFetchZones(): Promise<Zone[]> {
  await delay(50);
  return [...FIXTURE_ZONES];
}

export async function fixtureFetchObservations(zoneId: string): Promise<Observation[]> {
  await delay(50);
  return [...(FIXTURE_OBSERVATIONS[zoneId] || [])];
}

export async function fixtureFetchAttention(zoneId: string): Promise<AttentionItem[]> {
  await delay(50);
  return [...(FIXTURE_ATTENTION[zoneId] || [])];
}

export async function fixtureImportObservation(
  _image: File,
  metadata: ObservationMetadata,
): Promise<Observation> {
  await delay(100);
  const obs = createFixtureObservation(metadata);
  const zoneObs = FIXTURE_OBSERVATIONS[metadata.zone_id] || [];
  zoneObs.push(obs);
  FIXTURE_OBSERVATIONS[metadata.zone_id] = zoneObs;
  return obs;
}

export async function fixtureAnalyzeObservation(observationId: string): Promise<AnalysisJob> {
  await delay(50);
  const job = createFixtureJob(observationId);
  fixtureJobs.set(job.id, job);
  return { ...job };
}

export async function fixtureFetchJob(jobId: string): Promise<AnalysisJob> {
  await delay(50);
  const job = fixtureJobs.get(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  const advanced = advanceFixtureJob(job);
  fixtureJobs.set(jobId, advanced);
  return { ...advanced };
}

export async function fixtureFetchResult(resultId: string): Promise<AnalysisResult> {
  await delay(50);
  const existing = FIXTURE_RESULTS[resultId];
  if (existing) {
    return { ...existing };
  }
  // Generate a new result for completed jobs
  const newResult = createFixtureResult('unknown');
  newResult.id = resultId;
  FIXTURE_RESULTS[resultId] = newResult;
  return newResult;
}

export async function fixtureSendChat(req: ChatRequest): Promise<ChatResponse> {
  await delay(200);
  return createFixtureChatResponse(
    req.message,
    req.zone_id ?? null,
    req.observation_id ?? null,
    req.conversation_id || `conv-${Date.now()}`,
  );
}
