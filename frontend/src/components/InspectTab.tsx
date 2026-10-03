import { useI18n } from '../i18n';
import { useEffect, useState } from "react";
import type { AnalysisResult, ImportInput, Observation, Zone } from "../types";
import { ApiError } from "../types";
import { ApiRequestError } from "../api/client";
import { Viewer } from "./Viewer";

const KINDS = ["closeup_leaf", "aerial", "other"] as const;

export function InspectTab({
  zones,
  defaultZoneId,
  observation,
  onImport,
  onAnalyze,
}: {
  zones: Zone[];
  defaultZoneId: string;
  observation: Observation | null;
  onImport: (input: ImportInput) => Promise<void>;
  onAnalyze: (id: string) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <div className="inspect">
      <details className="import-panel">
        <summary>{t("Import a new image")}</summary>
        <ImportForm zones={zones} defaultZoneId={defaultZoneId} onImport={onImport} />
      </details>

      {observation == null ? (
        <p className="empty">{t("Select an observation from the history panel, or import a new image.")}</p>
      ) : (
        <ObservationDetail key={observation.id} observation={observation} onAnalyze={onAnalyze} />
      )}
    </div>
  );
}

function ImportForm({
  zones,
  defaultZoneId,
  onImport,
}: {
  zones: Zone[];
  defaultZoneId: string;
  onImport: (input: ImportInput) => Promise<void>;
}) {
  const { t } = useI18n();
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
  useEffect(() => { setZoneId(defaultZoneId); }, [defaultZoneId]);

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!file) errs.push(t("Image file is required."));
    else if (!/\.(jpe?g|png)$/i.test(file.name) && !/^image\/(jpeg|png)$/.test(file.type)) errs.push(t("Only JPEG or PNG images are accepted."));
    if (!zoneId) errs.push(t("Zone is required."));
    if (metadataJson.trim()) {
      try {
        const parsed = JSON.parse(metadataJson);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) errs.push(t("Metadata JSON must be an object (key/value pairs)."));
        else if ("measurements" in parsed && !Array.isArray(parsed.measurements)) errs.push(t("metadata.measurements must be a list when present."));
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
      await onImport(input);
      setErrors([]);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors([err.message]);
      } else if (err instanceof ApiError) {
        setErrors([err.message, ...(err.details ?? [])]);
      } else {
        setErrors([t("Import failed unexpectedly.")]);
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
            {errors.map((e) => <li key={e}>{t(e)}</li>)}
          </ul>
        )}
      </div>

      <label>
        {t("Image file (JPEG/PNG only)")}
        <input type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label>
        {t("Zone")}
        <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          <option value="">{t("Select a zone\u2026")}</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </label>
      <label>
        {t("Image kind")}
        <select value={imageKind} onChange={(e) => setImageKind(e.target.value as (typeof KINDS)[number])}>
          {KINDS.map((k) => <option key={k} value={k}>{t(k)}</option>)}
        </select>
      </label>
      <label>
        {t("Known crop (optional)")}
        <input type="text" value={crop} onChange={(e) => setCrop(e.target.value)} placeholder={t("e.g. tomato")} />
      </label>
      <label>
        {t("Actual capture timestamp (optional \u2014 never auto-filled)")}
        <input type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
      </label>
      <label>
        {t("Source kind")}
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          {["user_supplied", "dataset", "recorded", "live", "simulated"].map(kind => <option key={kind} value={kind}>{t(kind)}</option>)}
        </select>
        <small>{t("Default is \"user_supplied\". Do not label as a dataset automatically.")}</small>
      </label>
      <label>
        {t("Notes")}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </label>
      <label>
        {t("Metadata JSON (optional; may supply measurements)")}
        <textarea
          value={metadataJson}
          onChange={(e) => setMetadataJson(e.target.value)}
          rows={4}
          placeholder={'{"measurements": [{"name": "soil_ph", "value": null, "unit": "pH", "measured_at": null, "source": {"kind": "recorded", "name": null, "reference": null}, "quality": "missing"}]}'}
          aria-describedby="metadata-help"
        />
        <small id="metadata-help">{t("Soil and other values are only taken from what you enter here; they are never auto-filled.")}</small>
      </label>
      <button type="submit" disabled={busy}>{busy ? t("Importing…") : t("Import")}</button>
    </form>
  );
}

function ObservationDetail({
  observation,
  onAnalyze,
}: {
  observation: Observation;
  onAnalyze: (id: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [jobError, setJobError] = useState<string | null>(null);
  const busy = observation.job === "queued" || observation.job === "running";

  const analyze = async () => {
    setJobError(null);
    try {
      await onAnalyze(observation.id);
    } catch (err) {
      if (err instanceof ApiError || err instanceof ApiRequestError) {
        setJobError(err.message);
      } else {
        setJobError(t("Could not start analysis."));
      }
    }
  };

  return (
    <div>
      <Viewer observation={observation} />

      <div className="analyze-row">
        <button onClick={analyze} disabled={busy}>{t("Analyze")}</button>
        <p aria-live="polite" className="job-status">
          {t("Job status:")} {observation.job ? t(observation.job) : t("not started")}
          {observation.error ? ` — ${observation.error}` : ""}
        </p>
        {jobError && <p role="alert" className="job-error">{t(jobError)}</p>}
      </div>

      {observation.job === "failed" && <p role="alert" className="job-error">{t("Analysis failed:")} {observation.error ?? t("unknown error")} <button onClick={analyze}>{t("Retry")}</button></p>}

      {observation.result && <Results result={observation.result} />}
    </div>
  );
}

function Results({ result }: { result: AnalysisResult }) {
  const { t, locale } = useI18n();
  return (
    <div className="results">
      <h3>{t("Classification")}</h3>
      <dl className="card">
        <div><dt>{t("Crop")}</dt><dd>{t(result.crop ?? "Unavailable")}</dd></div>
        <div><dt>{t("Predicted label")}</dt><dd>{t(result.predictedLabel ?? "Unavailable")}</dd></div>
        <div>
          <dt>{t("Model score")}</dt>
          <dd>{result.score != null ? `${Math.round(result.score * 100)}%` : t("Unavailable")}</dd>
        </div>
        <div><dt>{t("Model ID")}</dt><dd>{result.modelId ?? t("Unavailable")}</dd></div>
      </dl>
      <p className="meta">
        {t("Capture time:")} {result.capturedAt ? new Date(result.capturedAt).toLocaleString(locale) : t("unknown")}
        {" · "}{t("Received time:")} {new Date(result.receivedAt).toLocaleString(locale)}
        {result.affectedFraction && (
          <> · {t("Experimental discoloration:")} {(result.affectedFraction.value * 100).toFixed(3)}{t("% of")} {result.affectedFraction.denominator === "leaf_area" ? t("estimated leaf region") : t("image area")}{t("; not disease severity.")}</>
        )}
      </p>

      <h3>{t("Measurements")}</h3>
      <table>
        <thead>
          <tr><th>{t("Measurement")}</th><th>{t("Value")}</th><th>{t("Unit")}</th><th>{t("Source")}</th><th>{t("Measurement time")}</th><th>{t("Quality")}</th></tr>
        </thead>
        <tbody>
          {result.measurements.map((m) => (
            <tr key={m.key}>
              <td>{t(m.label)}</td>
              <td>{m.value ?? "—"} {m.value == null && <span className="missing-label">{t("Missing")}</span>}</td>
              <td>{m.unit ?? "—"}</td>
              <td>{t(m.source)}</td>
              <td>{m.measuredAt ? new Date(m.measuredAt).toLocaleString(locale) : "—"}</td>
              <td>{m.quality === "missing" ? t("Missing") : t(m.quality)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t("Derived outputs")}</h3>
      <table>
        <thead><tr><th>{t("Output")}</th><th>{t("Formula")}</th><th>{t("Version")}</th><th>{t("Value")}</th><th>{t("Unit")}</th></tr></thead>
        <tbody>
          {result.formulaOutputs.map((f) => (
            <tr key={f.name}>
              <td>{f.name}</td>
              <td>{f.formula ?? t("Unavailable")}</td>
              <td>{f.version ?? t("Unavailable")}</td>
              <td>{f.value ?? t(f.status ?? "Unavailable")}</td>
              <td>{f.unit ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t("Metrics")}</h3>
      <ul>{result.metrics.map((m) => <li key={m.label}><strong>{t(m.label)}:</strong> {t(m.value)}</li>)}</ul>

      <h3>{t("Limitations")}</h3>
      <ul>{result.limitations.map((l) => <li key={l}>{t(l)}</li>)}</ul>

      <details className="evidence">
        <summary>{t("Evidence details")}</summary>
        <dl>
          <div><dt>{t("Model ID")}</dt><dd>{result.evidence.modelId ?? t("Unavailable")}</dd></div>
          <div><dt>{t("Model version")}</dt><dd>{result.evidence.modelVersion ?? t("Unavailable")}</dd></div>
          <div><dt>{t("Localization method")}</dt><dd>{result.evidence.localizationMethod}</dd></div>
          <div><dt>{t("Segmentation method")}</dt><dd>{result.evidence.segmentationMethod ?? t("Segmentation unavailable")}</dd></div>
          <div><dt>{t("Notes")}</dt><dd>{t(result.evidence.notes)}</dd></div>
        </dl>
      </details>
    </div>
  );
}
