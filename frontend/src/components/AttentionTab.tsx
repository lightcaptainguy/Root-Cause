import { useI18n } from '../i18n';
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
  const { t, locale } = useI18n();
  if (!attention) return <p aria-live="polite">{t("Loading attention reasons\u2026")}</p>;
  if (attention.reasons.length === 0) return <p className="empty">{t("No reasons reported for the current selection.")}</p>;

  const byZone = zones.map((z) => ({ zone: z, reasons: attention.reasons.filter((r) => r.zoneId === z.id) }));

  return (
    <div className="attention">
      {byZone.map(({ zone, reasons }) =>
        reasons.length === 0 ? null : (
          <section key={zone.id} className={zone.id === selectedZoneId ? "attention-group selected" : "attention-group"}>
            <h3>{zone.name}{zone.id === selectedZoneId ? t(" (selected)") : ""}</h3>
            <ul>
              {reasons.map((r) => (
                <li key={r.id} className={`reason ${r.status}`}>
                  <strong>{t(r.title)}</strong>{" "}
                  <span className={`reason-state ${r.status}`}>
                    {r.status === "flagged" ? t("Flagged for review") : r.status === "no_flag" ? t("No configured flags") : t("Not enough information")}
                  </span>
                  <p>{t(r.detail)}</p>
                  {r.observationId && (
                    <button className="link" onClick={() => onOpenObservation(r.observationId!)}>
                      {t("Open in Inspect")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
      <details className="evidence">
        <summary>{t("Rule version")}</summary>
        <p>{t("Rule version:")} {attention.ruleVersion}{attention.generatedAt ? t(" · Generated: ") + new Date(attention.generatedAt).toLocaleString(locale) : ""}</p>
        <p className="meta">{t("Thresholds are evaluated by the backend; the app does not recompute them.")}</p>
      </details>
    </div>
  );
}
