import { ATTENTION, OBSERVATIONS, ZONES } from "./fixtures";
import { ApiError } from "../types";
import type { AttentionReport, ImportInput, Observation, Zone } from "../types";

export type Scenario =
  | "normal"
  | "no_zones"
  | "empty_observations"
  | "initial_loading"
  | "metadata_invalid"
  | "upload_failure"
  | "queue_full"
  | "backend_offline"
  | "failed_inference"
  | "unsupported_aerial"
  | "missing_measurements"
  | "unavailable_segmentation";

export const SCENARIOS: Scenario[] = [
  "normal",
  "no_zones",
  "empty_observations",
  "initial_loading",
  "metadata_invalid",
  "upload_failure",
  "queue_full",
  "backend_offline",
  "failed_inference",
  "unsupported_aerial",
  "missing_measurements",
  "unavailable_segmentation",
];

// Canonical in-memory store the UI mutates together (stands in for the server DB).
const store: Observation[] = structuredClone(OBSERVATIONS);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const baseDelay = (s: Scenario) => (s === "initial_loading" ? 2500 : 350);

function offline(s: Scenario) {
  if (s === "backend_offline") throw new ApiError("backend_offline", "Backend unreachable. Check connection or retry.");
}

export async function listZones(s: Scenario): Promise<Zone[]> {
  await wait(baseDelay(s));
  offline(s);
  if (s === "no_zones") return [];
  return structuredClone(ZONES);
}

function adjust(obs: Observation, s: Scenario): Observation {
  const o = structuredClone(obs);
  if (s === "unavailable_segmentation" && o.geometry) {
    o.geometry = { ...o.geometry, maskUrl: undefined, maskMethod: undefined };
  }
  if (s === "missing_measurements" && o.result) {
    o.result = { ...o.result, measurements: o.result.measurements.map((m) => ({ ...m, value: null, unit: null, measuredAt: null, quality: "missing" })), formulaOutputs: o.result.formulaOutputs.map((f) => ({ ...f, value: null, unit: null })) };
  }
  return o;
}

export async function listObservations(s: Scenario): Promise<Observation[]> {
  await wait(baseDelay(s));
  offline(s);
  if (s === "no_zones" || s === "empty_observations") return [];
  return store.map((o) => adjust(o, s));
}

export async function getObservation(id: string, s: Scenario): Promise<Observation | null> {
  await wait(Math.min(baseDelay(s), 500));
  offline(s);
  const found = store.find((o) => o.id === id);
  return found ? adjust(found, s) : null;
}

export async function getAttention(s: Scenario): Promise<AttentionReport> {
  await wait(baseDelay(s));
  offline(s);
  if (s === "no_zones" || s === "empty_observations") return { ...ATTENTION, reasons: [] };
  return structuredClone(ATTENTION);
}

const VALID_KINDS = new Set(["closeup_leaf", "aerial", "other"]);

export async function importObservation(input: ImportInput, s: Scenario): Promise<Observation> {
  await wait(baseDelay(s));
  offline(s);
  if (s === "upload_failure") throw new ApiError("upload_failure", "Upload failed. The image was not stored.");
  if (s === "metadata_invalid") throw new ApiError("metadata_invalid", "Metadata JSON failed validation on the server.", ["measurements.soil_moisture.value must be a number when present", "measurements.soil_moisture.unit must be a string when present"]);

  // Server-side structural validation (mirrors what the real backend must do).
  let metadata: Record<string, unknown> = {};
  if (input.metadataJson.trim()) {
    try {
      const parsed = JSON.parse(input.metadataJson);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Metadata must be a JSON object");
      metadata = parsed as Record<string, unknown>;
    } catch (e) {
      throw new ApiError("metadata_invalid", e instanceof Error ? e.message : "Invalid JSON");
    }
  }
  if (!VALID_KINDS.has(input.imageKind)) throw new ApiError("metadata_invalid", "Unknown image kind");

  const url = URL.createObjectURL(input.file);
  const obs: Observation = {
    id: `obs-${Date.now()}`,
    zoneId: input.zoneId,
    source: input.source || "user_supplied",
    imageKind: input.imageKind,
    crop: input.crop || null,
    capturedAt: input.capturedAt ? new Date(input.capturedAt).toISOString() : null,
    receivedAt: new Date().toISOString(),
    notes: input.notes,
    imageUrl: url,
    geometry: null, // real backend must return dimensions + any box/mask URIs after processing
    job: null,
    error: null,
    result: null,
  };
  void metadata; // stored server-side in the real system; mock keeps it out of the UI model
  store.unshift(obs);
  return structuredClone(obs);
}

export async function startAnalysis(id: string, s: Scenario): Promise<void> {
  if (s === "backend_offline") throw new ApiError("backend_offline", "Backend unreachable. Check connection or retry.");
  if (s === "queue_full") throw new ApiError("queue_full", "Analysis queue is full. Try again later.");
  const obs = store.find((o) => o.id === id);
  if (!obs) throw new ApiError("not_found", "Observation not found.");

  if (obs.imageKind === "aerial" || s === "unsupported_aerial") {
    obs.job = "failed";
    obs.error =
      "Analysis unavailable for aerial images: no leaf-level model configured. Capture a close-up leaf image.";
    return;
  }
  obs.job = "queued";
  obs.error = null;
  // Background progression stands in for server job lifecycle; UI polls getObservation.
  void (async () => {
    await wait(1000);
    obs.job = "running";
    await wait(1600);
    if (s === "failed_inference") {
      obs.job = "failed";
      obs.error = "Inference failed on the server. Retry the analysis.";
      return;
    }
    obs.job = "completed";
    obs.error = null;
    const fixture = store.find((o) => o.result)?.result ?? null;
    obs.result = fixture
      ? { ...structuredClone(fixture), capturedAt: obs.capturedAt, receivedAt: obs.receivedAt, crop: obs.crop ?? fixture.crop }
      : null;
  })();
}
