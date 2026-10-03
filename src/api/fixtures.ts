import type { AnalysisResult, AttentionReport, Observation, Zone } from "../types";

export const ZONES: Zone[] = [
  { id: "z-north", name: "North Field", area: "12 ha" },
  { id: "z-greenhouse", name: "Greenhouse East", area: "0.4 ha" },
  { id: "z-orchard", name: "Orchard Row B", area: "3 ha" },
];

function baseResult(crop: string | null, label: string | null, score: number | null): AnalysisResult {
  return {
    crop,
    predictedLabel: label,
    score,
    modelId: "cropnet-leaf-v0.9.3",
    capturedAt: "2026-09-28T09:14:00+05:30",
    receivedAt: "2026-09-28T09:31:42+05:30",
    measurements: [
      { key: "lesion_count", label: "Lesion count", value: 3, unit: "count", source: "segmentation_head", measuredAt: "2026-09-28T09:32:05+05:30", quality: "ok" },
      { key: "soil_moisture", label: "Soil moisture", value: null, unit: null, source: "metadata_json", measuredAt: null, quality: "missing" },
      { key: "leaf_spot_area", label: "Spot area", value: 214, unit: "mm2", source: "metadata_json", measuredAt: "2026-09-28T09:14:00+05:30", quality: "ok" },
    ],
    formulaOutputs: [
      { name: "Affected fraction", formula: "mask_area / leaf_area", version: "v1.2", value: 8.4, unit: "% of leaf area" },
      { name: "NDVI", formula: null, version: null, value: null, unit: null },
    ],
    metrics: [
      { label: "Localization method", value: "detector box, see overlays" },
      { label: "Segmentation method", value: "leaf-mask-unet v2.1" },
    ],
    affectedFraction: { value: 8.4, denominator: "leaf_area" },
    limitations: [
      "Single-image estimate; not a diagnosis.",
      "Aerial frames are not analyzed for leaf symptoms.",
      "Scores are model outputs, not scientific accuracy.",
    ],
    evidence: {
      modelId: "cropnet-leaf-v0.9.3",
      modelVersion: "0.9.3 (fixture weights)",
      localizationMethod: "bbox-yolo-leaf v0.6",
      segmentationMethod: "leaf-mask-unet v2.1",
      notes: "Fixture evidence. Real backend must supply model id, methods, and mask/box URIs.",
    },
  };
}

export const OBSERVATIONS: Observation[] = [
  {
    id: "obs-1001",
    zoneId: "z-north",
    source: "user_supplied",
    imageKind: "closeup_leaf",
    crop: "tomato",
    capturedAt: "2026-09-28T09:14:00+05:30",
    receivedAt: "2026-09-28T09:31:42+05:30",
    notes: "Spots visible on lower canopy leaves after rain.",
    imageUrl: "/fixtures/leaf_landscape.png",
    geometry: {
      width: 1200,
      height: 800,
      box: { x: 640, y: 300, width: 240, height: 260 },
      boxMethod: "detector box (fixture)",
      maskUrl: "/fixtures/mask_landscape.png",
      maskMethod: "leaf-mask-unet v2.1 (fixture)",
    },
    job: "completed",
    error: null,
    result: { ...baseResult("tomato", "early_blight", 0.72), measurements: [...baseResult(null, null, null).measurements] },
  },
  {
    id: "obs-1002",
    zoneId: "z-greenhouse",
    source: "drone_survey",
    imageKind: "closeup_leaf",
    crop: "cucumber",
    capturedAt: "2026-09-29T16:02:00+05:30",
    receivedAt: "2026-09-29T16:20:10+05:30",
    notes: "Powdery patches after humid night.",
    imageUrl: "/fixtures/leaf_portrait.png",
    geometry: {
      width: 800,
      height: 1200,
      box: { x: 160, y: 560, width: 300, height: 320 },
      boxMethod: "detector box (fixture)",
      maskUrl: "/fixtures/mask_portrait.png",
      maskMethod: "leaf-mask-unet v2.1 (fixture)",
    },
    job: "completed",
    error: null,
    result: baseResult("cucumber", "powdery_mildew", 0.58),
  },
  {
    id: "obs-1003",
    zoneId: "z-orchard",
    source: "user_supplied",
    imageKind: "aerial",
    crop: null,
    capturedAt: null,
    receivedAt: "2026-09-30T07:11:00+05:30",
    notes: "Aerial pass over row B; symptoms not assessable from air.",
    imageUrl: "/fixtures/aerial.png",
    geometry: { width: 1600, height: 900, boxMethod: undefined, maskUrl: undefined, maskMethod: undefined },
    job: null,
    error: null,
    result: null,
  },
  {
    id: "obs-1004",
    zoneId: "z-north",
    source: "greenhouse_cam",
    imageKind: "closeup_leaf",
    crop: "tomato",
    capturedAt: "2026-10-01T08:45:00+05:30",
    receivedAt: "2026-10-01T08:45:30+05:30",
    notes: "Awaiting analysis run.",
    imageUrl: "/fixtures/leaf_landscape.png",
    geometry: {
      width: 1200,
      height: 800,
      box: { x: 640, y: 300, width: 240, height: 260 },
      boxMethod: "detector box (fixture)",
      maskUrl: undefined,
      maskMethod: undefined,
    },
    job: null,
    error: null,
    result: null,
  },
];

export const ATTENTION: AttentionReport = {
  ruleVersion: "attention-rules v0.4.1",
  generatedAt: "2026-10-03T06:00:00+05:30",
  reasons: [
    { id: "r1", zoneId: "z-north", observationId: "obs-1001", status: "flagged", title: "Elevated lesion area", detail: "Model output suggests early_blight with high affected fraction. Inspect and confirm in the field." },
    { id: "r2", zoneId: "z-greenhouse", observationId: "obs-1002", status: "flagged", title: "Humidity-related pattern", detail: "Observation notes mention patches after humid nights. Review the leaf image." },
    { id: "r3", zoneId: "z-orchard", observationId: "obs-1003", status: "unknown", title: "Aerial frame only", detail: "Not enough information to assess. Capture a close-up leaf image." },
    { id: "r4", zoneId: "z-greenhouse", observationId: null, status: "no_flag", title: "No configured flags", detail: "Configured rules did not fire for this zone. No configured flags is not a health guarantee." },
  ],
};
