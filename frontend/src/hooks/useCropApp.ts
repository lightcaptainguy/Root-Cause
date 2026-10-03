import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisJob, AnalysisResult, ApiError, AttentionItem, Health, Observation, ObservationMetadata, RequestState, Zone } from '../types/contracts';
import * as api from '../api';
import * as fixture from '../fixtures';

export interface CropAppState {
  mode: 'live' | 'fixture'; health: Health | null; zones: Zone[]; selectedZoneId: string | null;
  observations: Observation[]; selectedObservation: Observation | null; result: AnalysisResult | null;
  job: AnalysisJob | null; attention: AttentionItem[]; loadState: RequestState; uploadState: RequestState;
  error: ApiError | null; selectZone(id: string): void; selectObservation(id: string): Promise<void>;
  importObservation(image: File, metadata: ObservationMetadata): Promise<Observation>;
  analyzeObservation(id: string): Promise<void>; refresh(): Promise<void>; clearError(): void;
}
export function useCropApp(): CropAppState {
  const mode = fixture.isFixtureMode() ? 'fixture' : 'live';
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
  const alive = useRef(true);
  const zoneRef = useRef<string | null>(null);
  const epoch = useRef(0);
  const viewController = useRef<AbortController | null>(null);
  const pollController = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobCache = useRef(new Map<string, string>());
  const submitting = useRef(new Set<string>());

  const report = useCallback((err: unknown) => {
    if (!alive.current || (err instanceof api.ApiRequestError && err.code === 'CANCELLED')) return;
    setError(err instanceof api.ApiRequestError
      ? { code: err.code, message: err.message, details: err.details }
      : { code: 'UNKNOWN', message: err instanceof Error ? err.message : String(err), details: null });
  }, []);
  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
    pollController.current?.abort(); pollController.current = null;
  }, []);
  const invalidateView = useCallback(() => {
    epoch.current++;
    viewController.current?.abort(); viewController.current = null;
    stopPolling();
  }, [stopPolling]);
  const selectZone = useCallback((id: string) => {
    if (zoneRef.current === id) return;
    invalidateView(); zoneRef.current = id; setSelectedZoneId(id);
    setSelectedObservation(null); setResult(null); setJob(null);
    setObservations([]); setAttention([]); setError(null);
  }, [invalidateView]);

  const reloadZone = useCallback(async (zone: string, signal?: AbortSignal) => {
    const [obs, att] = await Promise.all([
      mode === 'fixture' ? fixture.fixtureFetchObservations(zone) : api.fetchObservations(zone, signal),
      mode === 'fixture' ? fixture.fixtureFetchAttention(zone) : api.fetchAttention(zone, signal),
    ]);
    if (!alive.current || signal?.aborted || zoneRef.current !== zone) return;
    setObservations(obs); setAttention(att);
  }, [mode]);

  const refresh = useCallback(async () => {
    setLoadState('loading'); setError(null);
    try {
      const [h, z] = await Promise.all([
        mode === 'fixture' ? fixture.fixtureFetchHealth() : api.fetchHealth(),
        mode === 'fixture' ? fixture.fixtureFetchZones() : api.fetchZones(),
      ]);
      if (!alive.current) return;
      setHealth(h); setZones(z);
      const chosen = z.find(item => item.id === zoneRef.current)?.id ?? z[0]?.id ?? null;
      if (!chosen) {
        invalidateView(); zoneRef.current = null; setSelectedZoneId(null);
        setObservations([]); setAttention([]); setSelectedObservation(null); setResult(null); setJob(null);
      } else if (zoneRef.current !== chosen) {
        selectZone(chosen);
      } else {
        await reloadZone(chosen);
      }
      if (alive.current) setLoadState('success');
    } catch (err) { report(err); if (alive.current) setLoadState('error'); }
  }, [mode, invalidateView, selectZone, reloadZone, report]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => { alive.current = false; invalidateView(); };
  }, [refresh, invalidateView]);

  useEffect(() => {
    if (!selectedZoneId) return;
    const controller = new AbortController();
    setLoadState('loading');
    void reloadZone(selectedZoneId, controller.signal)
      .then(() => { if (!controller.signal.aborted && alive.current) setLoadState('success'); })
      .catch(err => { if (!controller.signal.aborted) { report(err); setLoadState('error'); } });
    return () => controller.abort();
  }, [selectedZoneId, reloadZone, report]);

  const pollJob = useCallback((jobId: string, observationId: string, zone: string) => {
    stopPolling();
    const controller = new AbortController(); pollController.current = controller;
    const viewEpoch = epoch.current;
    let failures = 0;
    const current = () => alive.current && !controller.signal.aborted && epoch.current === viewEpoch;
    const poll = async () => {
      try {
        const state = mode === 'fixture' ? await fixture.fixtureFetchJob(jobId) : await api.fetchJob(jobId, controller.signal);
        if (!current()) return;
        setJob(state); failures = 0;
        if (state.status === 'failed') {
          jobCache.current.delete(observationId);
          if (state.error) setError(state.error);
          return;
        }
        if (state.status === 'completed' && state.result_id) {
          const nextResult = mode === 'fixture' ? await fixture.fixtureFetchResult(state.result_id) : await api.fetchResult(state.result_id, controller.signal);
          if (!current()) return;
          setResult(nextResult);
          jobCache.current.delete(observationId);
          const fresh = mode === 'fixture'
            ? (await fixture.fixtureFetchObservations(zone)).find(item => item.id === observationId)
            : await api.fetchObservation(observationId, controller.signal);
          if (!current()) return;
          if (fresh) setSelectedObservation(fresh);
          await reloadZone(zone, controller.signal);
          return;
        }
        pollTimer.current = setTimeout(() => void poll(), 1000);
      } catch (err) {
        if (!current()) return;
        failures++;
        if (failures >= 3) { report(err); return; }
        pollTimer.current = setTimeout(() => void poll(), 1000);
      }
    };
    void poll();
  }, [mode, stopPolling, reloadZone, report]);

  const selectObservation = useCallback(async (id: string) => {
    invalidateView();
    const requestEpoch = epoch.current;
    const controller = new AbortController(); viewController.current = controller;
    setResult(null); setJob(null); setError(null);
    const current = () => alive.current && !controller.signal.aborted && epoch.current === requestEpoch;
    try {
      const obs = mode === 'fixture'
        ? (await fixture.fixtureFetchObservations(zoneRef.current ?? '')).find(item => item.id === id)
        : await api.fetchObservation(id, controller.signal);
      if (!obs) throw new Error('Observation not found');
      if (!current()) return;
      if (zoneRef.current !== obs.zone_id) {
        zoneRef.current = obs.zone_id; setSelectedZoneId(obs.zone_id);
      }
      setSelectedObservation(obs);
      if (obs.latest_result_id) {
        const next = mode === 'fixture' ? await fixture.fixtureFetchResult(obs.latest_result_id) : await api.fetchResult(obs.latest_result_id, controller.signal);
        if (!current()) return;
        setResult(next);
      }
      const pending = jobCache.current.get(id);
      if (pending && current()) pollJob(pending, id, obs.zone_id);
    } catch (err) { if (current()) report(err); }
  }, [mode, invalidateView, pollJob, report]);

  const importObservationFn = useCallback(async (image: File, metadata: ObservationMetadata) => {
    setUploadState('loading'); setError(null);
    try {
      const obs = mode === 'fixture' ? await fixture.fixtureImportObservation(image, metadata) : await api.importObservation(image, metadata);
      if (alive.current) {
        if (zoneRef.current !== obs.zone_id) selectZone(obs.zone_id);
        setObservations(items => [obs, ...items.filter(item => item.id !== obs.id)]);
        await selectObservation(obs.id);
        setUploadState('success');
      }
      return obs;
    } catch (err) { report(err); if (alive.current) setUploadState('error'); throw err; }
  }, [mode, selectZone, selectObservation, report]);

  const analyzeObservationFn = useCallback(async (id: string) => {
    if (submitting.current.has(id)) return;
    const zone = zoneRef.current;
    if (!zone) return;
    const existing = jobCache.current.get(id);
    if (existing) { pollJob(existing, id, zone); return; }
    submitting.current.add(id);
    const startEpoch = epoch.current;
    setError(null); setResult(null);
    setJob({ id: '', observation_id: id, status: 'queued', result_id: null, error: null });
    try {
      const accepted = mode === 'fixture'
        ? await fixture.fixtureAnalyzeObservation(id)
        : await api.analyzeObservation(id);
      const jobId = 'job_id' in accepted ? accepted.job_id : accepted.id;
      jobCache.current.set(id, jobId);
      if (!alive.current || epoch.current !== startEpoch) return;
      setJob({ id: jobId, observation_id: id, status: accepted.status, result_id: null, error: null });
      pollJob(jobId, id, zone);
    } catch (err) {
      if (alive.current && epoch.current === startEpoch) { setJob(null); report(err); }
      throw err;
    } finally { submitting.current.delete(id); }
  }, [mode, pollJob, report]);

  return { mode, health, zones, selectedZoneId, observations, selectedObservation, result, job, attention,
    loadState, uploadState, error, selectZone, selectObservation, importObservation: importObservationFn,
    analyzeObservation: analyzeObservationFn, refresh, clearError: () => setError(null) };
}
