// useCropApp — main application state hook.
// Implements the exact interface from SHARED_FRONTEND_CONTRACT.md.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnalysisJob,
  AnalysisResult,
  ApiError,
  AttentionItem,
  Health,
  Observation,
  ObservationMetadata,
  RequestState,
  Zone,
} from '../types/contracts';
import {
  ApiRequestError,
  fetchHealth,
  fetchZones,
  fetchObservations,
  fetchAttention,
  importObservation,
  analyzeObservation,
  fetchJob,
  fetchResult,
} from '../api';
import {
  isFixtureMode,
  fixtureFetchHealth,
  fixtureFetchZones,
  fixtureFetchObservations,
  fixtureFetchAttention,
  fixtureImportObservation,
  fixtureAnalyzeObservation,
  fixtureFetchJob,
  fixtureFetchResult,
} from '../fixtures';

const POLL_INTERVAL_MS = 1000;
const MAX_CONSECUTIVE_FAILURES = 3;

export interface CropAppState {
  mode: 'live' | 'fixture';
  health: Health | null;
  zones: Zone[];
  selectedZoneId: string | null;
  observations: Observation[];
  selectedObservation: Observation | null;
  result: AnalysisResult | null;
  job: AnalysisJob | null;
  attention: AttentionItem[];
  loadState: RequestState;
  uploadState: RequestState;
  error: ApiError | null;
  selectZone: (id: string) => void;
  selectObservation: (id: string) => Promise<void>;
  importObservation: (image: File, metadata: ObservationMetadata) => Promise<Observation>;
  analyzeObservation: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

// Cache job/result IDs per observation during this browser session
const jobCache = new Map<string, string>();
const resultCache = new Map<string, string>();

export function useCropApp(): CropAppState {
  const mode: 'live' | 'fixture' = isFixtureMode() ? 'fixture' : 'live';

  const [health, setHealth] = useState<Health | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [loadState, setLoadState] = useState<RequestState>('idle');
  const [uploadState, setUploadState] = useState<RequestState>('idle');
  const [error, setError] = useState<ApiError | null>(null);

  // Refs for race protection and cancellation
  const zoneRequestIdRef = useRef(0);
  const observationRequestIdRef = useRef(0);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const isPollingRef = useRef(false);
  const activeJobIdRef = useRef<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Fetch health and zones on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      try {
        const [healthData, zonesData] = await Promise.all([
          mode === 'fixture' ? fixtureFetchHealth() : fetchHealth(),
          mode === 'fixture' ? fixtureFetchZones() : fetchZones(),
        ]);
        if (cancelled) return;
        setHealth(healthData);
        setZones(zonesData);
        setLoadState('success');
        consecutiveFailuresRef.current = 0;
      } catch (err: unknown) {
        if (cancelled) return;
        setLoadState('error');
        if (err instanceof ApiRequestError) {
          setError({ code: err.code, message: err.message, details: err.details });
        } else {
          setError({ code: 'UNKNOWN', message: String(err), details: null });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Fetch observations and attention when zone changes
  useEffect(() => {
    if (!selectedZoneId) {
      setObservations([]);
      setAttention([]);
      return;
    }

    const zoneId = selectedZoneId;
    const requestId = ++zoneRequestIdRef.current;
    let cancelled = false;

    async function loadZoneData() {
      setLoadState('loading');
      try {
        const [obsData, attData] = await Promise.all([
          mode === 'fixture' ? fixtureFetchObservations(zoneId) : fetchObservations(zoneId),
          mode === 'fixture' ? fixtureFetchAttention(zoneId) : fetchAttention(zoneId),
        ]);
        if (cancelled || requestId !== zoneRequestIdRef.current) return;
        setObservations(obsData);
        setAttention(attData);
        setLoadState('success');
        consecutiveFailuresRef.current = 0;
      } catch (err: unknown) {
        if (cancelled || requestId !== zoneRequestIdRef.current) return;
        setLoadState('error');
        if (err instanceof ApiRequestError) {
          setError({ code: err.code, message: err.message, details: err.details });
        } else {
          setError({ code: 'UNKNOWN', message: String(err), details: null });
        }
      }
    }

    loadZoneData();
    return () => {
      cancelled = true;
    };
  }, [selectedZoneId, mode]);

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }
    isPollingRef.current = false;
    activeJobIdRef.current = null;
  }, []);

  // Poll job status
  const pollJob = useCallback(
    async (jobId: string) => {
      if (isPollingRef.current) return; // Serialize polls
      isPollingRef.current = true;
      activeJobIdRef.current = jobId;

      const poll = async () => {
        try {
          const jobData = mode === 'fixture' ? await fixtureFetchJob(jobId) : await fetchJob(jobId);
          if (activeJobIdRef.current !== jobId) return; // Stale poll

          setJob(jobData);
          consecutiveFailuresRef.current = 0;

          if (jobData.status === 'completed' && jobData.result_id) {
            stopPolling();
            // Fetch result
            const resultData = mode === 'fixture' ? await fixtureFetchResult(jobData.result_id) : await fetchResult(jobData.result_id);
            if (activeJobIdRef.current !== jobId) return;
            setResult(resultData);
            // Refresh observation/attention lists
            if (selectedZoneId) {
              const [obsData, attData] = await Promise.all([
                mode === 'fixture' ? fixtureFetchObservations(selectedZoneId) : fetchObservations(selectedZoneId),
                mode === 'fixture' ? fixtureFetchAttention(selectedZoneId) : fetchAttention(selectedZoneId),
              ]);
              if (activeJobIdRef.current !== jobId) return;
              setObservations(obsData);
              setAttention(attData);
            }
            return;
          }

          if (jobData.status === 'failed') {
            stopPolling();
            if (jobData.error) {
              setError(jobData.error);
            }
            return;
          }

          // Still queued/running — schedule next poll
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } catch (err: unknown) {
          if (activeJobIdRef.current !== jobId) return;
          consecutiveFailuresRef.current++;
          if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
            stopPolling();
            if (err instanceof ApiRequestError) {
              setError({ code: err.code, message: err.message, details: err.details });
            } else {
              setError({ code: 'UNKNOWN', message: String(err), details: null });
            }
            return;
          }
          // Retry after interval
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      poll();
    },
    [mode, selectedZoneId, stopPolling],
  );

  // Select zone
  const selectZone = useCallback(
    (id: string) => {
      stopPolling();
      setSelectedZoneId(id);
      setSelectedObservation(null);
      setResult(null);
      setJob(null);
    },
    [stopPolling],
  );

  // Select observation
  const selectObservation = useCallback(
    async (id: string) => {
      const requestId = ++observationRequestIdRef.current;
      stopPolling();

      // Find in current observations
      const obs = observations.find((o) => o.id === id);
      if (!obs) return;

      setSelectedObservation(obs);
      setResult(null);
      setJob(null);

      // Check result cache first
      const cachedResultId = resultCache.get(id);
      if (cachedResultId) {
        try {
          const resultData = mode === 'fixture' ? await fixtureFetchResult(cachedResultId) : await fetchResult(cachedResultId);
          if (requestId !== observationRequestIdRef.current) return;
          setResult(resultData);
          return;
        } catch {
          // Cache miss — fall through to latest_result_id
        }
      }

      // Use latest_result_id if present
      if (obs.latest_result_id) {
        try {
          const resultData = mode === 'fixture' ? await fixtureFetchResult(obs.latest_result_id) : await fetchResult(obs.latest_result_id);
          if (requestId !== observationRequestIdRef.current) return;
          setResult(resultData);
          resultCache.set(id, obs.latest_result_id);
        } catch (err: unknown) {
          if (requestId !== observationRequestIdRef.current) return;
          if (err instanceof ApiRequestError) {
            setError({ code: err.code, message: err.message, details: err.details });
          }
        }
      }
    },
    [observations, mode, stopPolling],
  );

  // Import observation
  const importObservationFn = useCallback(
    async (image: File, metadata: ObservationMetadata): Promise<Observation> => {
      setUploadState('loading');
      try {
        const obs = mode === 'fixture' ? await fixtureImportObservation(image, metadata) : await importObservation(image, metadata);
        setUploadState('success');
        // Select newly imported observation
        await selectObservation(obs.id);
        return obs;
      } catch (err: unknown) {
        setUploadState('error');
        if (err instanceof ApiRequestError) {
          setError({ code: err.code, message: err.message, details: err.details });
        } else {
          setError({ code: 'UNKNOWN', message: String(err), details: null });
        }
        throw err;
      }
    },
    [mode, selectObservation],
  );

  // Analyze observation
  const analyzeObservationFn = useCallback(
    async (id: string) => {
      // Check job cache — don't duplicate POSTs
      const cachedJobId = jobCache.get(id);
      if (cachedJobId) {
        // Resume polling existing job
        setJob({ id: cachedJobId, observation_id: id, status: 'queued', result_id: null, error: null });
        await pollJob(cachedJobId);
        return;
      }

      setUploadState('loading');
      try {
        const newJob = mode === 'fixture' ? await fixtureAnalyzeObservation(id) : await analyzeObservation(id);
        jobCache.set(id, newJob.id);
        setJob(newJob);
        setUploadState('success');
        await pollJob(newJob.id);
      } catch (err: unknown) {
        setUploadState('error');
        if (err instanceof ApiRequestError) {
          setError({ code: err.code, message: err.message, details: err.details });
        } else {
          setError({ code: 'UNKNOWN', message: String(err), details: null });
        }
        throw err;
      }
    },
    [mode, pollJob],
  );

  // Refresh current zone data
  const refresh = useCallback(async () => {
    if (!selectedZoneId) return;
    const requestId = ++zoneRequestIdRef.current;
    try {
      const [obsData, attData] = await Promise.all([
        mode === 'fixture' ? fixtureFetchObservations(selectedZoneId) : fetchObservations(selectedZoneId),
        mode === 'fixture' ? fixtureFetchAttention(selectedZoneId) : fetchAttention(selectedZoneId),
      ]);
      if (requestId !== zoneRequestIdRef.current) return;
      setObservations(obsData);
      setAttention(attData);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        setError({ code: err.code, message: err.message, details: err.details });
      } else {
        setError({ code: 'UNKNOWN', message: String(err), details: null });
      }
    }
  }, [selectedZoneId, mode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    mode,
    health,
    zones,
    selectedZoneId,
    observations,
    selectedObservation,
    result,
    job,
    attention,
    loadState,
    uploadState,
    error,
    selectZone,
    selectObservation,
    importObservation: importObservationFn,
    analyzeObservation: analyzeObservationFn,
    refresh,
    clearError,
  };
}
