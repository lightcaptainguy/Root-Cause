import type { AttentionReport, Zone } from "../types";

export function AttentionTab({
  attention,
  zones,
  selectedZoneId,
  onOpenObservation,
}: {
  attention: AttentionReport | null;
  zones: Zone[];
  selectedZoneId: string;
  onOpenObservation: (observationId: string) => void;
}) {
  if (!attention) return <p aria-live="polite">Loading attention reasons…</p>;
  if (attention.reasons.length === 0) return <p className="empty">No reasons reported for the current selection.</p>;

  const byZone = zones.map((z) => ({ zone: z, reasons: attention.reasons.filter((r) => r.zoneId === z.id) }));

  return (
    <div className="attention">
      {byZone.map(({ zone, reasons }) =>
        reasons.length === 0 ? null : (
          <section key={zone.id} className={zone.id === selectedZoneId ? "attention-group selected" : "attention-group"}>
            <h3>{zone.name}{zone.id === selectedZoneId ? " (selected)" : ""}</h3>
            <ul>
              {reasons.map((r) => (
                <li key={r.id} className={`reason ${r.status}`}>
                  <strong>{r.title}</strong>{" "}
                  <span className={`reason-state ${r.status}`}>
                    {r.status === "flagged" ? "Flagged for review" : r.status === "no_flag" ? "No configured flags" : "Not enough information"}
                  </span>
                  <p>{r.detail}</p>
                  {r.observationId && (
                    <button className="link" onClick={() => onOpenObservation(r.observationId!)}>
                      Open in Inspect
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
      <details className="evidence">
        <summary>Rule version</summary>
        <p>Rule version: {attention.ruleVersion} · Generated: {new Date(attention.generatedAt).toLocaleString()}</p>
        <p className="meta">Thresholds are evaluated by the backend; the app does not recompute them.</p>
      </details>
    </div>
  );
}
