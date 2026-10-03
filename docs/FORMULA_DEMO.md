# Demonstrating data and CWSI

This demonstration proves that supplied metadata passes through ingestion, timestamp association, formula execution, persistence and UI display. All readings and the default image are explicitly simulated. It does not prove that these baselines are appropriate for a real crop, or that hardware is measuring accurately.

## Presenter walkthrough

1. With the backend running, click **Refresh** in the dashboard and select **Formula demo (SIMULATED)**. The five demonstration observations are already stored locally.
2. Select an observation and open **Evidence details** to identify its case from the notes. The Measurements table shows each input's value, unit, source, timestamp and quality. Derived outputs shows CWSI, its formula/version, value and status.
3. Show the valid case: canopy 32 degC, air 30 degC, lower temperature-difference baseline -2 degC, upper baseline 6 degC. All readings have the same known timestamp.
4. Explain the arithmetic: **CWSI = ((canopy − air) − lower) / (upper − lower)**. Here, **((32 − 30) − (−2)) / (6 − (−2)) = 4 / 8 = 0.50**.
5. Show warmer_canopy: changing only canopy temperature to 34 degC gives **6 / 8 = 0.75**.
6. Show the rejected-input cases below. The system preserves supplied data and returns an explicit status instead of fabricating a number.

| Case | Change from valid input | Expected and verified output |
|---|---|---|
| valid | None | available, 0.50 |
| warmer_canopy | Canopy temperature becomes 34 degC | available, 0.75 |
| missing_air | Air value null; quality missing | unavailable, null |
| out_of_sync | Air timestamp five seconds after image capture | unavailable, null |
| invalid_baselines | Upper baseline equals lower baseline | invalid, null |

The current default association tolerance is 1,000 milliseconds. Valid synchronized readings use exact input names and unit `degC`; missing, invalid-quality, stale or incompatible inputs cannot establish this calculation. Lower and upper inputs are temperature **difference baselines**, not absolute temperatures. Values outside the usual index interval are not silently clamped.

CWSI is computed deterministically by backend/ agronomy code, not by Ollama or the image classifier. The current attention flag comes from a separate classifier rule; changing CWSI does not trigger a water-stress flag. The synthetic image's classification is incidental and should not be presented as meaningful model evaluation.

## Reproduce or change a reading live

From the repository root, with the normal backend listening:

```powershell
.\.venv\Scripts\python.exe tools\demo_formulas.py
```

In the original workspace use `..\.venv\Scripts\python.exe`. This command makes real HTTP imports and analysis requests, polls jobs, retrieves saved metrics, asserts all five expected outputs and writes [the verification report](verification/formula-demo.json). Each run adds five observations; it does not clear earlier records.

To generate examples without importing anything:

```powershell
.\.venv\Scripts\python.exe tools\demo_formulas.py --examples-only
```

For a live UI demonstration, import `frontend/public/fixtures/leaf_landscape.png` in the formula-demo zone. Set image kind to closeup_leaf and paste [cwsi_valid.json](../config/demo_observations/cwsi_valid.json) into Metadata JSON. This JSON explicitly labels the image/readings simulated and supplies the capture timestamp. Analyze, inspect 0.50, then import another copy changing only canopy temperature from 32 to 34 and inspect 0.75. The form's selected zone/image kind take precedence over those JSON fields.

The stored result records `formula_id`, `formula_version` and measurement `input_refs`. The report includes observation/result IDs and association deltas, making the calculation traceable through the API even where the UI shows a summary.

## Suggested explanation to judges

“We are replaying explicitly simulated sensor readings because we do not have the field hardware here. The system keeps provenance and timestamps, calculates CWSI from compatible inputs, stores the formula version and input references, and refuses to calculate when evidence is missing or unsynchronized. The chatbot explains these stored facts; it does not generate the measurement or the formula result.”

Use real recorded telemetry with documented crop-specific baselines for subsequent field validation. That is a separate experiment from demonstrating the software pipeline.
