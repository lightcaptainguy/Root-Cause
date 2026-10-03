// Presentation adapters preserve the existing dashboard without changing wire semantics.
import type * as Wire from '../types/contracts';
import type { AttentionReport, ImportInput, Observation } from '../types';
import { getAssetUrl, ApiRequestError } from './client';

export function toObservationView(obs: Wire.Observation, result: Wire.AnalysisResult | null = null, job: Wire.AnalysisJob | null = null): Observation {
  const compatible = result?.observation_id === obs.id ? result : null;
  const box = compatible?.localization.status === 'available' ? compatible.localization.boxes[0] : undefined;
  const segmentation = compatible?.segmentation;
  return {
    id: obs.id, zoneId: obs.zone_id, source: obs.source.name ? obs.source.kind + ' · ' + obs.source.name : obs.source.kind,
    imageKind: obs.image_kind, crop: compatible?.classification.crop ?? obs.crop_hint,
    capturedAt: obs.captured_at, receivedAt: obs.received_at, notes: obs.notes ?? '',
    imageUrl: obs.image.url.startsWith('/api/assets/') ? getAssetUrl(obs.image.url) : obs.image.url,
    geometry: {
      width: obs.image.width, height: obs.image.height,
      box: box ? { x: box.coordinates[0], y: box.coordinates[1], width: box.coordinates[2] - box.coordinates[0], height: box.coordinates[3] - box.coordinates[1] } : undefined,
      boxMethod: compatible?.localization.method ?? undefined,
      maskUrl: segmentation?.status === 'available' && segmentation.mask_url
        ? (segmentation.mask_url.startsWith('/api/assets/') ? getAssetUrl(segmentation.mask_url) : segmentation.mask_url) : undefined,
      maskMethod: segmentation?.method ?? undefined,
    },
    job: job?.observation_id === obs.id ? job.status : compatible ? 'completed' : null,
    error: job?.observation_id === obs.id ? job.error?.message ?? null : null,
    result: compatible ? {
      crop: compatible.classification.crop, predictedLabel: compatible.classification.label, score: compatible.classification.score,
      modelId: compatible.classification.model_id, capturedAt: obs.captured_at, receivedAt: obs.received_at,
      measurements: obs.measurements.map((m, index) => ({ key: m.name + '-' + index, label: m.name, value: m.value,
        unit: m.unit, source: m.source.name ?? m.source.kind, measuredAt: m.measured_at, quality: m.quality })),
      formulaOutputs: compatible.metrics.map(m => ({ name: m.name, formula: m.formula_id, version: m.formula_version,
        value: m.value, unit: m.unit, status: m.status })),
      metrics: [{ label: 'Analysis status', value: compatible.status },
        { label: 'Time association', value: obs.association.status },
        { label: 'Inference time', value: compatible.timings_ms.inference.toFixed(1) + ' ms' }],
      affectedFraction: segmentation?.status === 'available' && segmentation.affected_fraction !== null && segmentation.denominator
        ? { value: segmentation.affected_fraction, denominator: segmentation.denominator } : null,
      limitations: compatible.limitations,
      evidence: { modelId: compatible.classification.model_id, modelVersion: null,
        localizationMethod: compatible.localization.method ?? compatible.localization.status,
        segmentationMethod: segmentation?.method ?? null, notes: obs.notes ?? 'No additional source notes supplied.' },
    } : null,
  };
}

export function toAttentionView(items: Wire.AttentionItem[]): AttentionReport {
  return { ruleVersion: [...new Set(items.map(item => item.rule_version).filter(Boolean))].join(', ') || 'Not evaluated',
    generatedAt: null, reasons: items.map(item => ({ id: item.observation_id, zoneId: item.zone_id, observationId: item.observation_id,
      status: item.status === 'attention' ? 'flagged' : item.status,
      title: item.status === 'attention' ? 'Needs review' : item.status === 'unknown' ? 'Not enough information' : 'No configured flags',
      detail: item.reasons.join(' ') || (item.status === 'unknown' ? 'No supported analysis or required inputs available.' : 'No configured rule triggered; this does not establish crop health.') })) };
}

export function importMetadata(input: ImportInput): Wire.ObservationMetadata {
  const extra: Record<string, unknown> = input.metadataJson.trim() ? JSON.parse(input.metadataJson) : {};
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) throw new ApiRequestError('INVALID_METADATA', 'Metadata must be a JSON object');
  const allowed = new Set(['zone_id','captured_at','image_kind','crop_hint','source','measurements','notes']);
  if (Object.keys(extra).some(key => !allowed.has(key))) throw new ApiRequestError('INVALID_METADATA', 'Metadata contains unsupported fields; disease ground-truth labels are not inference input');
  if (extra.measurements !== undefined && !Array.isArray(extra.measurements)) throw new ApiRequestError('INVALID_METADATA', 'measurements must be a list');
  const source = extra.source ?? { kind: input.source || 'user_supplied', name: null, reference: null };
  const captured = extra.captured_at ?? (input.capturedAt ? new Date(input.capturedAt).toISOString() : null);
  return { zone_id: input.zoneId, image_kind: input.imageKind, crop_hint: (extra.crop_hint as string | null | undefined) ?? (input.crop || null),
    captured_at: captured as string | null, source: source as Wire.Source,
    measurements: (extra.measurements as Wire.Measurement[] | undefined) ?? [], notes: (extra.notes as string | null | undefined) ?? (input.notes || null) };
}
