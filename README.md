# Root-Cause
<<<<<<< Updated upstream
An AI based crop disease detection and advisory system

## Crop Health (frontend)

A calm, polished agricultural dashboard built with React + TypeScript + plain CSS. No UI libraries, system fonts, local assets only, no maps. All data comes from a mock fixture layer behind a small API seam (`src/api/mockApi.ts`) that can be swapped for real endpoints.

### Run

```bash
npm install
npm run dev      # or: npm run build && npm run preview
```

Fixture images live in `public/fixtures/` and can be regenerated with `npm run fixtures`.

### Fixture mode

The app always shows a **Fixture mode** banner while running on mock data. The banner's mock-state switcher demonstrates: no zones, empty observations, initial loading, metadata validation failure, upload failure, queue full, backend offline, failed inference, unsupported aerial analysis, missing measurements, unavailable segmentation.

### Note: mock fields the real backend must supply

- `Zone`: id, name, optional area.
- `Observation`: id, zoneId, source (default `user_supplied`; never auto `plantvillage`), imageKind (`closeup_leaf`/`aerial`/`other`), optional crop, optional `capturedAt` (never auto-filled), `receivedAt`, notes, image URL, dimensions.
- `Geometry`: pixel width/height, optional leaf box (x, y, width, height + method), optional lesion mask URL (+ method). Boxes/masks must come from the backend; the browser never generates them.
- `AnalysisResult`: crop, predictedLabel, model score (or absent → "Unavailable", never 0%), model ID, measurements (value/unit/source/measurement time/quality; never auto-filled soil values), formula outputs (formula + version, or unavailable), metrics, limitations, affected fraction with its denominator ("leaf area" or "image area"), and evidence details (localization/segmentation methods).
- `AttentionReport`: rule version, generated time, reasons per zone (backend-evaluated; the browser never recomputes thresholds), each with observation reference.
- Job lifecycle states: queued / running / completed / failed with any failure reason.
=======

Local crop image analysis and evidence-based farmer explanations. Hackathon prototype targeting a Windows/NVIDIA laptop with a local web UI and Ollama.

## Run without frontend

The backend imports source-tracked images, stores observations/results in SQLite, runs a local PlantVillage ONNX classifier, evaluates supported CWSI inputs, and produces read-only Ollama explanations. Optional experimental color overlays are explicitly not validated disease segmentation. Aerial disease analysis is unsupported.

Use Python 3.12:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe tools\prepare_assets.py model
.\.venv\Scripts\python.exe tools\prepare_assets.py samples
ollama pull qwen3:4b
.\.venv\Scripts\python.exe -m backend --config config\demo.json
```

Contracts: `backend/contracts.py`. Explicit configuration defaults: `backend/config.py` and `config/backend.example.json`. Timestamps must include offsets and normalize to UTC; absent measurements remain null. Classification, leaf boxes and lesion masks have separate capability statuses. No disease ground-truth field is accepted as inference metadata.

API documentation: http://127.0.0.1:8000/docs. OpenAPI is exported in `docs/openapi.json`; it is the implemented route/type contract. Individual JSON Schemas in `docs/schemas/` are supplemental contract artifacts. Coordinate frontend wiring using `docs/frontend-handoff/SHARED_FRONTEND_CONTRACT.md`.

See `docs/CHECKPOINTS.md` for the review sequence and `docs/PROTOTYPE_HANDOFF.md` for ownership and scope. Model/dataset artifacts and local runtime data are excluded from Git.

Read `docs/ARCHITECTURE_EXPLAINED.md` for the component walkthrough, C++/Python tradeoffs, implementation status and decision record.

Read `docs/BACKEND_IMPLEMENTATION.md` for current module status, startup details, scientific limits and verification. The current workspace's prepared virtual environment lives one directory above this checkout; use `..\.venv\Scripts\python.exe` here. Fresh clones should follow the commands above. Model/data downloads are deliberately not committed; run preparation tools after cloning.
>>>>>>> Stashed changes
