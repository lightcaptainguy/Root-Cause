# Root-Cause
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
