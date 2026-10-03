# Backend implementation and review guide

The latest user instruction authorized implementing backend modules without waiting for frontend completion or pausing at each checkpoint. No commit/push is performed. These modules can still be reviewed and committed in groups.

## Working components

| Group | Files | What changed and why |
|---|---|---|
| Contracts | contracts.py, config.py, errors.py | Typed input/output data, local defaults and consistent error envelopes |
| Persistence/import | storage.py, ingestion.py | SQLite WAL; source observations, original bytes and orientation-normalized evidence assets; local zones |
| Association | association.py | Match nearest supplied timestamp per measurement name; no sensor waits or invented capture time |
| API/jobs | app.py, jobs.py, __main__.py | Local FastAPI, asynchronous persisted jobs, bounded queue, polling endpoints and restart interruption handling |
| Vision | vision.py | Pinned PlantVillage MobileNetV2 ONNX weights/labels/preprocessing; native CPU execution |
| Visual candidates | experimental.py | Optional color-based leaf region boxes and discoloration masks, explicitly experimental |
| Formulas/rules | agronomy.py | Supplied-spec CWSI and versioned demo classifier attention rule |
| Explanations | chat.py | Local qwen3:4b, evidence retrieval, bounded conversations and permitted read-only tools |
| Reproduction | tools/prepare_assets.py, evaluate_model.py, smoke_backend.py | Source-tracked downloads, honest model smoke evaluation, full pipeline without UI |

All backend module paths above are under backend/ unless shown otherwise.

## Launch and inspect without frontend

Run from the GitHub-connected nested Root-Cause checkout. Python 3.12 recommended. Dependencies are pinned in requirements.txt; requirements.lock.txt records the tested complete environment.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe tools\prepare_assets.py model
.\.venv\Scripts\python.exe tools\prepare_assets.py samples
ollama pull qwen3:4b
.\.venv\Scripts\python.exe -m backend --config config\demo.json
```

In the current workspace the prepared Python environment is one level above the connected checkout: use ..\.venv\Scripts\python.exe instead. A fresh clone should use its own .venv as above. Ollama is already installed and qwen3:4b is already present on this machine; installation/update is not necessary for this prototype.

API: http://127.0.0.1:8000. Interactive API documentation: /docs. OpenAPI: /openapi.json. No frontend is needed. Run one server process for this demo; do not start multiple workers against the same queue/database.

The UI should use supplied OpenAPI plus shared frontend contract. One additive endpoint exists: POST /api/zones with {id,name}; it creates/updates a zone before import. Demo config seeds demo-zone explicitly; that is an assigned organizational label, not a measured GPS location.

Import multipart fields image and metadata. Analyze an observation using POST /api/observations/{id}/analyze; poll returned job ID; retrieve result_id after completion. Assets and saved results remain available after restart. Reanalysis creates another result and updates latest_result_id without removing earlier evidence.

## Changes from the initial proposal

The small classifier runs through ONNX Runtime's CPU provider, not CUDA/TensorRT. This avoids CUDA DLL setup and reserves VRAM for Ollama. It is a prototype decision backed by measured smoke latency, not a claim that CPU inference always wins. No Python/CUDA zero-copy or native lock-free transport is implemented.

There is no GPU sharing scheduler because only Ollama uses the GPU in the current configuration. Vision has one worker; chat calls are serialized separately. They can execute concurrently on different processors. Introducing GPU vision later requires renewed profiling and memory/scheduling policy.

The normal config leaves experimental overlays disabled; config/demo.json opts in. Overlays detect color regions against a mostly neutral background. They do not establish lesion identity or agronomic severity. Bounding boxes describe estimated leaf regions. Fraction denominator is the color heuristic's estimated leaf region; don't relabel it measured diseased area. Aerial inference remains unsupported.

Timestamp association uses metadata supplied for that observation; it is not a live telemetry stream store. The interpolation helper is tested but isn't applied automatically. Its caller must choose a physically suitable continuous quantity, zone and compatible clock context. Unknown times remain unknown. Raw measurements are never overwritten by estimates.

CWSI input names: canopy_temperature, air_temperature, cwsi_lower_delta, cwsi_upper_delta; units degC. Required readings must be valid and associated within configured tolerance. Denominator must be positive. Raw out-of-range indices are preserved rather than clamped. Other friend-provided formulas remain pending.

Attention threshold is an explicit prototype model-score threshold (default 0.8), not a validated disease/severity threshold. Healthy-class predictions return no_flag; low-score/unsupported predictions return unknown. Only adequate-score nonhealthy classifications trigger attention. Reasons/version are stored and displayed.

## Why explanation handling is stricter

The first real language-model test overstated a prediction and converted an experimental fraction incorrectly. Numeric facts now come directly from validated records and are rendered by backend code. The model receives qualitative evidence and produces schema-constrained qualitative explanation; digit-bearing, empty, malformed, certainty-bearing or truncated responses are rejected with a visible service error. No fake answer substitutes for a failed model call.

Permitted tools: read_observation, read_result, calculate_cwsi. Tools are bounded to retrieved context IDs, have exact allowed argument keys and cannot mutate records or execute SQL/commands. Conversations have a fixed selected context, short history and a capped in-memory count. They reset after backend restart. Numeric tool data can still lead to rejected model wording; this is a conservative behavior, not a guarantee of agronomic correctness.

Returned evidence links identify server-retrieved sources; they do not independently prove every generated sentence. Prompting/format checks reduce demonstrated failure modes but are not a full semantic truth verifier. The explanation can still be inaccurate. No treatment doses or confirmed diagnoses are part of this demo.

## Verify without UI

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe tools\evaluate_model.py
.\.venv\Scripts\python.exe tools\smoke_backend.py --chat
.\.venv\Scripts\python.exe -m backend --config config\demo.json --export-openapi docs\openapi.json
```

The smoke tool writes real observations into the demo database; repeated runs add observations. No deletion/reset occurs automatically. It uses actual downloaded images and preserves missing capture times; it does not inject known evaluation labels into input metadata. Evaluation results are recorded in docs/verification.

Verification covers bad uploads/metadata, null values, timezone requirements, queue saturation, duplicate pending submissions, restart persistence/interrupted jobs, history retention, unsupported aerial inputs, synchronized formula inputs, experimental overlay geometry/alpha and read-only tool scope. Live Ollama and real-model smoke checks are separate from mocked/unavailable-service unit tests.

The 12-image sample matched 11 source labels. This is neither an independent holdout nor evidence of field accuracy; downloaded images could overlap original training data. The recorded mistake must remain visible. Performance figures in reports describe these images and this session only.

## Assets and offline behavior

Model artifacts and datasets are ignored by Git. Pinning source revision and storing SHA256 prevents accidental model changes during reproduction. Model candidate source: https://huggingface.co/onnx-community/mobilenet_v2_1.0_224-plant-disease-identification-ONNX. Dataset source: https://github.com/spMohanty/PlantVillage-Dataset. Cite upstream authors; review distribution terms before redistributing their assets.

After downloading packages/images/weights and preparing Ollama, runtime image analysis never contacts a remote host. Chat contacts the local listener only. Network disconnection has not been physically forced on the user's machine; no such claim should be made from a normal online smoke test.

## Remaining work

Frontend integration is complete; see INTEGRATION_RECORD.md for the verified workflows and fixes. Remaining work includes an actual offline rehearsal; crop-specific references/formulas from the team; validated lesion detection/segmentation; aerial-field model/evaluation; robust field-domain training/evaluation. Jetson drivers, C++ transport and TensorRT are future deployment work. No distributed training or calibration is necessary to show this working prototype path.
