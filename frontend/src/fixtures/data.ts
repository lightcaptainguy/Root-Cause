// Fixture data for VITE_DATA_MODE=fixture.
// Exercises: classification, leaf box, experimental segmentation,
// null/stale soil data, unknown attention, attention reasons,
// unsupported aerial input, queue-full, unavailable chat.

import type {
  AnalysisJob,
  AnalysisResult,
  AttentionItem,
  ChatResponse,
  Health,
  Observation,
  ObservationMetadata,
  Zone,
} from '../types/contracts';

export const FIXTURE_ZONES: Zone[] = [
  { id: 'zone-1', name: 'North Field', crop: 'wheat', area_ha: 12.5 },
  { id: 'zone-2', name: 'South Field', crop: 'corn', area_ha: 8.3 },
  { id: 'zone-3', name: 'East Plot', crop: 'soybean', area_ha: 5.1 },
];

export const FIXTURE_HEALTH: Health = {
  status: 'ok',
  vision_ready: true,
  ollama_ready: true,
  capabilities: {
    classification: true,
    segmentation: true,
    metrics: true,
    chat: true,
  },
};

let observationCounter = 0;

function makeObservation(zoneId: string, overrides: Partial<Observation> = {}): Observation {
  observationCounter++;
  return {
    id: `obs-fixture-${observationCounter}`,
    zone_id: zoneId,
    captured_at: new Date().toISOString(),
    image_kind: 'ground',
    crop_hint: 'wheat',
    source: { kind: 'simulated', name: 'Fixture Generator', reference: null },
    measurements: [
      { name: 'soil_moisture', value: 42, unit: '%', measured_at: null, source: { kind: 'simulated', name: null, reference: null }, quality: 'stale' },
      { name: 'leaf_count', value: null, unit: 'count', measured_at: null, source: { kind: 'simulated', name: null, reference: null }, quality: 'missing' },
    ],
    notes: null,
    received_at: new Date().toISOString(),
    image: { url: '/fixture-image.png', width: 640, height: 480 },
    association: { status: 'associated', method: 'fixture', deltas_ms: {} },
    ...overrides,
  };
}

export const FIXTURE_OBSERVATIONS: Record<string, Observation[]> = {
  'zone-1': [
    makeObservation('zone-1', {
      id: 'obs-fixture-1',
      latest_result_id: 'result-fixture-1',
      image: { url: '/fixture-image.png', width: 640, height: 480 },
    }),
    makeObservation('zone-1', {
      id: 'obs-fixture-2',
      image_kind: 'aerial',
      latest_result_id: null,
    }),
  ],
  'zone-2': [
    makeObservation('zone-2', {
      id: 'obs-fixture-3',
      measurements: [
        { name: 'soil_moisture', value: null, unit: '%', measured_at: null, source: { kind: 'simulated', name: null, reference: null }, quality: 'missing' },
        { name: 'nitrogen', value: 15.2, unit: 'mg/kg', measured_at: new Date().toISOString(), source: { kind: 'simulated', name: null, reference: null }, quality: 'valid' },
      ],
    }),
  ],
  'zone-3': [],
};

export const FIXTURE_ATTENTION: Record<string, AttentionItem[]> = {
  'zone-1': [
    {
      observation_id: 'obs-fixture-1',
      zone_id: 'zone-1',
      status: 'attention',
      reasons: ['low_soil_moisture', 'pest_detected'],
      rule_version: 'v1.2',
    },
    {
      observation_id: 'obs-fixture-2',
      zone_id: 'zone-1',
      status: 'unknown',
      reasons: [],
      rule_version: null,
    },
  ],
  'zone-2': [
    {
      observation_id: 'obs-fixture-3',
      zone_id: 'zone-2',
      status: 'no_flag',
      reasons: [],
      rule_version: 'v1.2',
    },
  ],
  'zone-3': [],
};

export const FIXTURE_RESULTS: Record<string, AnalysisResult> = {
  'result-fixture-1': {
    id: 'result-fixture-1',
    observation_id: 'obs-fixture-1',
    created_at: new Date().toISOString(),
    classification: {
      label: 'leaf_rust',
      score: 0.87,
      method: 'fixture-classifier-v1',
    },
    metrics: [
      {
        name: 'leaf_area_index',
        value: 2.3,
        unit: 'm²/m²',
        formula_id: 'lai-001',
        formula_version: '1.0',
        input_refs: ['segmentation'],
        status: 'available',
      },
      {
        name: 'canopy_temperature',
        value: null,
        unit: '°C',
        formula_id: 'canopy-temp-001',
        formula_version: '1.0',
        input_refs: [],
        status: 'unavailable',
      },
    ],
    boxes: [
      {
        coordinates: [120, 80, 340, 290],
        label: 'disease_region',
        score: 0.92,
        method: 'fixture-detector',
      },
    ],
    segmentation: {
      mask_url: '/fixture-mask.png',
      denominator: 'leaf_area',
      leaf_area_px: 45230,
      image_area_px: 307200,
    },
    notes: 'Fixture result for testing',
  },
};

// Job simulation
let jobCounter = 0;

export function createFixtureJob(observationId: string): AnalysisJob {
  jobCounter++;
  return {
    id: `job-fixture-${jobCounter}`,
    observation_id: observationId,
    status: 'queued',
    result_id: null,
    error: null,
  };
}

export function advanceFixtureJob(job: AnalysisJob): AnalysisJob {
  switch (job.status) {
    case 'queued':
      return { ...job, status: 'running' };
    case 'running':
      return { ...job, status: 'completed', result_id: `result-fixture-${jobCounter}` };
    default:
      return job;
  }
}

export function createFixtureResult(observationId: string): AnalysisResult {
  return {
    id: `result-fixture-${jobCounter}`,
    observation_id: observationId,
    created_at: new Date().toISOString(),
    classification: {
      label: 'healthy',
      score: 0.95,
      method: 'fixture-classifier-v1',
    },
    metrics: [
      {
        name: 'leaf_area_index',
        value: 3.1,
        unit: 'm²/m²',
        formula_id: 'lai-001',
        formula_version: '1.0',
        input_refs: ['segmentation'],
        status: 'available',
      },
    ],
    boxes: [
      {
        coordinates: [50, 50, 200, 200],
        label: 'leaf',
        score: 0.88,
        method: 'fixture-detector',
      },
    ],
    segmentation: {
      mask_url: '/fixture-mask.png',
      denominator: 'image_area',
      leaf_area_px: 120000,
      image_area_px: 307200,
    },
    notes: 'Fixture analysis result',
  };
}

export function createFixtureChatResponse(
  message: string,
  _zoneId: string | null,
  observationId: string | null,
  conversationId: string,
): ChatResponse {
  // Simulate unavailable chat for certain messages
  if (message.toLowerCase().includes('unavailable')) {
    return {
      conversation_id: conversationId,
      answer: '',
      evidence: [],
      limitations: ['Chat is temporarily unavailable. Please try again later.'],
    };
  }

  return {
    conversation_id: conversationId,
    answer: `Fixture response to: "${message}". This is simulated data for testing purposes.`,
    evidence: observationId
      ? [
          {
            kind: 'observation' as const,
            id: observationId,
            title: `Observation ${observationId}`,
            observation_id: observationId,
            result_id: null,
          },
        ]
      : [],
    limitations: [],
  };
}

export function createFixtureObservation(metadata: ObservationMetadata): Observation {
  return makeObservation(metadata.zone_id, {
    image_kind: metadata.image_kind,
    measurements: metadata.measurements,
    source: metadata.source,
    notes: metadata.notes,
  });
}
