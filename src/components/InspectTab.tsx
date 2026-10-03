import { useState } from "react";
import type { AnalysisResult, ImportInput, Observation, Zone } from "../types";
import { ApiError } from "../types";
import { getObservation, importObservation, startAnalysis, type Scenario } from "../api/mockApi";
import { Viewer } from "./Viewer";

const KINDS = ["closeup_leaf", "aerial", "other"] as const;

export function InspectTab({
  scenario,
  zones,
  defaultZoneId,
  observation,
  onImported,
  onObservationUpdated,
}: {
  scenario: Scenario;
  zones: Zone[];
  defaultZoneId: string;
  observation: Observation | null;
  onImported: (o: Observation) => void;
  onObservationUpdated: (o: Observation) => void;
}) {
  return (
    <div className="inspect">
      <details className="import-panel">
        <summary>Import a new image</summary>
        <ImportForm scenario={scenario} zones={zones} defaultZoneId={defaultZoneId} onImported={onImported} />
      </details>

      {observation == null ? (
        <p className="empty">Select an observation from the history panel, or import a new image.</p>
      ) : (
        <ObservationDetail scenario={scenario} observation={observation} onObservationUpdated={onObservationUpdated} />
      )}
    </div>
  );
}

function ImportForm({
  scenario,
  zones,
  defaultZoneId,
  onImported,
}: {
  scenario: Scenario;
  zones: Zone[];
  defaultZoneId: string;
  onImported: (o: Observation) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [zoneId, setZoneId] = useState(defaultZoneId);
  const [imageKind, setImageKind] = useState<(typeof KINDS)[number]>("closeup_leaf");
  const [crop, setCrop] = useState("");
  const [capturedAt, setCapturedAt] = useState("");
  const [source, setSource] = useState("user_supplied");
  const [notes, setNotes] = useState("");
  const [metadataJson, setMetadataJson] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!file) errs.push("Image file is required.");
    else if (!/\.(jpe?g|png)$/i.test(file.name) && !/^image\/(jpeg|png)$/.test(file.type)) errs.push("Only JPEG or PNG images are accepted.");
    if (!zoneId) errs.push("Zone is required.");
    if (metadataJson.trim()) {
      try {
        const parsed = JSON.parse(metadataJson);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) errs.push("Metadata JSON must be an object (key/value pairs).");
        else if ("measurements" in parsed && typeof parsed.measurements !== "object") errs.push("metadata.measurements must be an object when present.");
      } catch (e) {
        errs.push(`Metadata JSON is not valid JSON: ${e instanceof Error ? e.message : "parse error"}`);
      }
    }
    return errs;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return;
    setBusy(true);
    try {
      const input: ImportInput = { file: file!, zoneId, imageKind, crop, capturedAt, source: source || "user_supplied", notes, metadataJson };
      const obs = await importObservation(input, scenario);
      setErrors([]);
      onImported(obs);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors([err.message, ...(err.details ?? [])]);
      } else {
        setErrors(["Import failed unexpectedly."]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="import-form" onSubmit={submit} noValidate>
      <div aria-live="assertive">
        {errors.length > 0 && (
          <ul className="form-errors" role="alert">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </div>

      <label>
        Image file (JPEG/PNG only)
        <input type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label>
        Zone
        <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          <option value="">Select a zone…</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </label>
      <label>
        Image kind
        <select value={imageKind} onChange={(e) => setImageKind(e.target.value as (typeof KINDS)[number])}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <label>
        Known crop (optional)
        <input type="text" value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="e.g. tomato" />
      </label>
      <label>
        Actual capture timestamp (optional — never auto-filled)
        <input type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
      </label>
      <label>
        Source
        <input type="text" value={source} onChange={(e) => setSource(e.target.value)} />
        <small>Default is "user_supplied". Do not label as a dataset automatically.</small>
      </label>
      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </label>
      <label>
        Metadata JSON (optional; may supply measurements)
        <textarea
          value={metadataJson}
          onChange={(e) => setMetadataJson(e.target.value)}
          rows={4}
          placeholder={'{"measurements": {"leaf_spot_area": {"value": 214, "unit": "mm2"}}}'}
          aria-describedby="metadata-help"
        />
        <small id="metadata-help">Soil and other values are only taken from what you enter here; they are never auto-filled.</small>
      </label>
      <button type="submit" disabled={busy}>{busy ? "Importing…" : "Import"}</button>
    </form>
  );
}

function ObservationDetail({
  scenario,
  observation,
  onObservationUpdated,
}: {
  scenario: Scenario;
  observation: Observation;
  onObservationUpdated: (o: Observation) => void;
}) {
  const [jobError, setJobError] = useState<string | null>(null);
  const busy = observation.job === "queued" || observation.job === "running";

  const analyze = async () => {
    setJobError(null);
    try {
      onObservationUpdated({ ...observation, job: "queued", error: null });
      await startAnalysis(observation.id, scenario);
      const fresh = await getObservation(observation.id, scenario);
      if (fresh) onObservationUpdated(fresh);
    } catch (err) {
      if (err instanceof ApiError) {
        setJobError(err.message);
        onObservationUpdated({ ...observation, job: null });
      } else {
        setJobError("Could not start analysis.");
      }
    }
  };

  return (
    <div>
      <Viewer observation={observation} />

      <div className="analyze-row">
        <button onClick={analyze} disabled={busy}>Analyze</button>
        <p aria-live="polite" className="job-status">
          Job status: {observation.job ? observation.job : "not started"}
          {observation.error ? ` — ${observation.error}` : ""}
        </p>
        {jobError && <p role="alert" className="job-error">{jobError}</p>}
        {(scenario === "queue_full" || scenario === "backend_offline") && (
          <p className="meta">Backend error above. <button onClick={analyze}>Retry</button></p>
        )}
      </div>

      {observation.job === "failed" && <p role="alert" className="job-error">Analysis failed: {observation.error ?? "unknown error"} <button onClick={analyze}>Retry</button></p>}

      {observation.result && <Results result={observation.result} />}
    </div>
  );
}

function Results({ result }: { result: AnalysisResult }) {
  return (
    <div className="results">
      <h3>Classification</h3>
      <dl className="card">
        <div><dt>Crop</dt><dd>{result.crop ?? "Unavailable"}</dd></div>
        <div><dt>Predicted label</dt><dd>{result.predictedLabel ?? "Unavailable"}</dd></div>
        <div>
          <dt>Model score</dt>
          <dd>{result.score != null ? `${Math.round(result.score * 100)}%` : "Unavailable"}</dd>
        </div>
        <div><dt>Model ID</dt><dd>{result.modelId ?? "Unavailable"}</dd></div>
      </dl>
      <p className="meta">
        Capture time: {result.capturedAt ? new Date(result.capturedAt).toLocaleString() : "unknown"}
        {" · "}Received time: {new Date(result.receivedAt).toLocaleString()}
        {result.affectedFraction && (
          <> · Affected: {result.affectedFraction.value}% of {result.affectedFraction.denominator === "leaf_area" ? "leaf area" : "image area"}</>
        )}
      </p>

      <h3>Measurements</h3>
      <table>
        <thead>
          <tr><th>Value</th><th>Unit</th><th>Source</th><th>Measurement time</th><th>Quality</th></tr>
        </thead>
        <tbody>
          {result.measurements.map((m) => (
            <tr key={m.key}>
              <td>{m.value ?? "—"} {m.value == null && <span className="missing-label">Missing</span>}</td>
              <td>{m.unit ?? "—"}</td>
              <td>{m.source}</td>
              <td>{m.measuredAt ? new Date(m.measuredAt).toLocaleString() : "—"}</td>
              <td>{m.quality === "missing" ? "Missing" : m.quality}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Derived outputs</h3>
      <table>
        <thead><tr><th>Output</th><th>Formula</th><th>Version</th><th>Value</th><th>Unit</th></tr></thead>
        <tbody>
          {result.formulaOutputs.map((f) => (
            <tr key={f.name}>
              <td>{f.name}</td>
              <td>{f.formula ?? "Unavailable"}</td>
              <td>{f.version ?? "Unavailable"}</td>
              <td>{f.value ?? "—"}</td>
              <td>{f.unit ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Metrics</h3>
      <ul>{result.metrics.map((m) => <li key={m.label}><strong>{m.label}:</strong> {m.value}</li>)}</ul>

      <h3>Limitations</h3>
      <ul>{result.limitations.map((l) => <li key={l}>{l}</li>)}</ul>

      <details className="evidence">
        <summary>Evidence details</summary>
        <dl>
          <div><dt>Model ID</dt><dd>{result.evidence.modelId ?? "Unavailable"}</dd></div>
          <div><dt>Model version</dt><dd>{result.evidence.modelVersion ?? "Unavailable"}</dd></div>
          <div><dt>Localization method</dt><dd>{result.evidence.localizationMethod}</dd></div>
          <div><dt>Segmentation method</dt><dd>{result.evidence.segmentationMethod ?? "Segmentation unavailable"}</dd></div>
          <div><dt>Notes</dt><dd>{result.evidence.notes}</dd></div>
        </dl>
      </details>
    </div>
  );
}
