# Crop health hackathon prototype: architecture and team handoff

## Scope and decisions

This plan records the user's latest prototype decisions. The original Jetson specification is a future deployment reference; its Qt/no-server requirement and sequential module checkpoints do not govern this web prototype.

Target: Windows laptop, i7-12700H, RTX 4070 8 GB, RAM 16 GB. Eight-hour delivery window. Download dependencies, assets and models during setup; demonstrate local operation without internet afterward.

Inputs: close-up leaf images, raw aerial images, and observation metadata/soil measurements supplied by the team. Use named zones, not geographical maps. PlantVillage supplies leaf classification training/evaluation data. The original specification names no crop species or disease target list; those remain pending.

Outputs: image inspection, honest model results and overlays, measurements/history, attention-required summary, and an explanation-only local assistant. No autonomous tasks or changes by the assistant.

## Runtime architecture

Browser (React + TypeScript + Vite) -> local Python FastAPI backend -> ingestion/association, vision adapter, formula engine, SQLite, Ollama adapter.

Serve the frontend build and API from one localhost origin for the demo. Vite is a development tool; runtime requires no frontend development server or cloud service. Frontend never calls Ollama or the database directly.

Ingestion -> validated observation -> bounded inference queue -> vision results -> applicable formulas -> persisted result -> UI fetches result. Chat separately retrieves persisted evidence and approved crop references before requesting an explanation from Ollama.

Keep adapters for replacing file input with camera ingestion and Python inference with a C++/TensorRT engine later. NVMM, CUDA homography, physical serial drivers, pybind11 and DuckDB are deferred. Do not claim zero-copy or lock-free implementation for the initial Python queue. A future C++ SPSC transport is separate from timestamp association.

Load the vision model once. Limit inference concurrency to one initially and bound pending jobs (initial proposal: 16). Return queue-full errors instead of silently losing observations. Keep CPU image decoding and SQLite writes outside GPU inference. Serialize GPU-heavy vision/chat work initially through a scheduler, prioritizing pending vision work between chat requests. Benchmark contention before changing this policy; do not promise GPU preemption or a specific throughput.

## Scientific boundaries

- Classification, leaf localization, and lesion segmentation are separate capabilities. Record the provider and method for each result.
- PlantVillage image-level labels do not establish lesion boxes or lesion masks. A segmented leaf image is not an annotated disease-region mask.
- Show leaf boxes as leaf localization, never as disease localization. A classifier result describes the analyzed image/crop; it cannot identify disease pixels by itself.
- Affected-area overlays require a lesion segmentation model or an explicitly labeled experimental image-processing method. Unavailable segmentation returns unavailable status, not an invented mask or percentage.
- Aerial images are a separate input domain. Unless a suitable model is validated, allow inspection/metadata and report unsupported disease analysis. Do not apply a leaf classifier to a whole field and present the outcome as validated.
- Soil data comes only from supplied metadata. Missing measurements remain null. Store provenance, units and timestamp. No random demonstration measurements in the production input path.
- Formulas execute only when their required inputs and approved definitions exist. CWSI requires thermal/air/baseline inputs; RGB-only inputs cannot supply them.
- Dataset labels may be evaluation truth but must not be passed as inference inputs or shown as model predictions. Keep train/test images separated by original leaf where grouping metadata exists.
- Confidence is a model score, not a guaranteed diagnosis. Attention status is based on versioned configured rules; unavailable analysis is unknown, not healthy.

## Ownership

### Core team: user + Codex in this workspace

Own backend, contracts, input validation/provenance, timestamp association, vision/model integration and targeted training, inference scheduling, formula execution, SQLite, attention rules, Ollama evidence/tools, automated backend checks and integration.

Directories: backend/, models/, data/, tests/, docs/. Model and dataset downloads stay out of Git. Export API schema once backend models are implemented. This document is a proposed contract, not a claim of working endpoints.

### Friend 1: farmer interface and image viewer

Own frontend/src/components/, frontend/src/pages/, frontend/src/styles/ and app shell/layout.

Build zone selector, Inspect and Attention views, observation picker/upload form, result cards, image viewer with box/mask toggles, measurements/history and responsive persistent chat sidebar placement. Friend 2 supplies the chat component. Use locally bundled fonts/icons/assets; no CDN dependencies.

Render overlays in original image pixel coordinates with consistent scaling/letterboxing. Separate disease label, leaf localization and lesion overlay labels. Show unavailable/stale/unsupported states and evidence source. Keep text readable and actions obvious; use status icons/text as well as color. No fake confidence or severity. Display original image evidence; raw datasets are read-only.

Acceptance: import an image, select zone, see processing state, view result/evidence, toggle genuine overlays, inspect measurements with units, and review attention reasons. Empty/error/unsupported states must work.

### Friend 2: frontend API integration and chat

Own frontend/src/api/, frontend/src/types/, frontend/src/hooks/, frontend/src/chat/, frontend/package.json and frontend build configuration.

Provide typed API client, shared contract types, upload/analysis polling hooks, cancellation/timeouts/error handling, chat panel, evidence-link navigation, frontend fixtures and build/start documentation. Connect the chat panel to the backend only. Render plain text or sanitized Markdown; never execute model-generated HTML.

Start with clearly marked development fixtures matching this contract. Fixture mode must be explicit and disabled for the final live demo. Coordinate shared exports with Friend 1; Friend 1 owns layout while Friend 2 owns networking/state.

Acceptance: complete import/analyze/poll cycle against real backend; chat resolves evidence references; unavailable Ollama produces a truthful unavailable message; backend errors appear clearly; production build works offline.

## Shared API contract v0.1

All timestamps: UTC ISO 8601 with explicit offset. Image coordinates: original decoded width/height; boxes use [x_min,y_min,x_max,y_max] pixels. Scores: 0..1. Unknown numeric values are null, never zero. IDs are opaque strings. Every list response uses {items: [...]}.

Routes:

| Method and route | Request | Response |
|---|---|---|
| GET /api/health | none | {status, vision_ready, ollama_ready, capabilities} |
| GET /api/zones | none | {items: [{id, name}]} |
| POST /api/observations | multipart image + metadata JSON | observation, HTTP 201 |
| GET /api/observations?zone_id=... | optional zone filter | {items: [observation]} |
| GET /api/observations/{id} | none | observation |
| POST /api/observations/{id}/analyze | none | {job_id, observation_id, status}, HTTP 202 |
| GET /api/jobs/{id} | none | {id, observation_id, status, result_id, error} |
| GET /api/results/{id} | none | analysis result |
| GET /api/attention?zone_id=... | optional zone filter | {items: [{observation_id, zone_id, status, reasons, rule_version}]} |
| POST /api/chat | {message, zone_id?, observation_id?, conversation_id?} | {conversation_id, answer, evidence, limitations} |
| GET /api/assets/{id} | none | image/mask bytes, correct content type |

Initial chat is non-streaming to reduce integration work. Show pending indicator; add token streaming only after end-to-end success. Poll active analysis jobs at 1-second intervals, stopping on completion/failure or page departure. Asset URLs are backend-relative, never filesystem paths.

Observation metadata:

```json
{
  "zone_id": "zone-a",
  "captured_at": null,
  "image_kind": "closeup_leaf",
  "crop_hint": null,
  "source": {"kind": "dataset", "name": "PlantVillage", "reference": "original-image-id"},
  "measurements": [],
  "notes": null
}
```

image_kind: closeup_leaf | aerial | other. source.kind: dataset | recorded | live | simulated | user_supplied. Metadata is user/data-source supplied; timestamps absent in the source stay absent. Backend adds id, received_at, image {url,width,height} and association status.

Measurement: {name, value, unit, measured_at, source, quality}. quality: valid | stale | missing | invalid. Formula outputs carry formula identifier/version and input references.

Analysis result:

```json
{
  "id": "result-1",
  "observation_id": "obs-1",
  "status": "completed",
  "classification": {"status": "unavailable", "crop": null, "label": null, "score": null, "model_id": null},
  "localization": {"status": "unavailable", "method": null, "boxes": []},
  "segmentation": {"status": "unavailable", "method": null, "mask_url": null, "affected_fraction": null, "denominator": null},
  "metrics": [],
  "attention": {"status": "unknown", "reasons": [], "rule_version": null},
  "limitations": [],
  "timings_ms": {"queue": 0, "inference": 0, "total": 0}
}
```

Capability status: available | unavailable | unsupported | failed. Job status: queued | running | completed | failed. Result status: completed | partial | unsupported | failed. Attention status: attention | no_flag | unknown. No_flag means no configured rule triggered, not proof of health. Each box includes coordinates, label, score and method. Segmentation affected_fraction uses affected-leaf-pixels / total-leaf-pixels only when a leaf mask exists; otherwise choose an explicit image-area denominator or return null.

Chat evidence item: {kind, id, title, observation_id, result_id}; kind is observation | result | reference | formula. The backend retrieves records and approved references; the model cannot write records or run arbitrary SQL/commands. Explanations must distinguish measured values, predictions, experimental overlays and unavailable inputs.

Errors: {error: {code, message, details}}. Use 400 invalid input, 404 unknown ID, 413 excessive upload, 429 full queue, 503 unavailable service. Backend controls input size/type limits; frontend displays the message.

## Timestamp association

Same zone and compatible clock domain only. Keep captured_at, measured_at and received_at separate. Match nearest supplied measurement within a configurable per-sensor tolerance; record time delta and association method. Without known comparable timestamps return unassociated. Interpolate only configured continuous measurements with valid bracketing samples and a maximum gap; do not interpolate categorical values, zone IDs or disease predictions. Do not block inference while waiting for telemetry.

## Eight-hour schedule from project start

| Window | Core team | Friend 1 | Friend 2 |
|---|---|---|---|
| 0-1 h | Runtime audit, target shortlist, API models, model/dataset feasibility | Layout and shared component skeleton | API types, fixtures, build setup |
| 1-3 h | Import/store/analyze flow; one genuine leaf classifier | Inspection, overlay viewer, measurement cards | API hooks, polling, chat UI |
| 3-5 h | Ollama evidence integration; formulas; segmentation feasibility gate | Attention/history, empty/error states | Real backend connection and evidence navigation |
| 5-6 h | End-to-end integration, latency/VRAM measurements | Real result polish | Offline production build |
| 6-7 h | Correctness and outage checks; fix failures | Usability checks | Integration fixes |
| 7-8 h | Freeze, repeatable launch and demo script | Presentation polish | Packaging and final demo rehearsal |

Feasibility gate: by hour 2 select a verified usable checkpoint or a small transfer-learning run. By hour 4, if lesion segmentation is unavailable, keep that capability honestly unavailable/experimental and prioritize the working classification/evidence demo. Aerial disease inference requires its own verified capability. Do not spend the final integration hours on distributed training or optimization rewrites.

## Required final checks

Unknown telemetry stays unknown; unmatched timestamps do not fabricate association; queue overflow is visible; a stored observation survives restart; no dataset truth leaks into inference; masks/boxes align after resize; unsupported aerial analysis is explicit; assistant cites actual record IDs and cannot mutate data; Ollama outage is visible; launch and demo succeed with internet disconnected. Record actual image latency and chat response latency separately.

## Outstanding inputs

Crop/disease shortlist (not present in the supplied spec), friend-provided formulas/references, sample observation metadata and aerial images, and availability of a verified model checkpoint. These block their specific scientific features, not frontend or API work.
