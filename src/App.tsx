import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttentionReport, Observation, Zone } from "./types";
import { ApiError } from "./types";
import { getAttention, getObservation, listObservations, listZones, type Scenario } from "./api/mockApi";
import { FixtureBanner } from "./components/FixtureBanner";
import { InspectTab } from "./components/InspectTab";
import { AttentionTab } from "./components/AttentionTab";
import { ChatSidebar } from "./components/ChatSidebar";

export default function App() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [zones, setZones] = useState<Zone[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [attention, setAttention] = useState<AttentionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedObservationId, setSelectedObservationId] = useState<string>("");
  const [tab, setTab] = useState<"inspect" | "attention">("inspect");
  const [chatOpen, setChatOpen] = useState(false);
  const previewUrls = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [z, o, a] = await Promise.all([listZones(scenario), listObservations(scenario), getAttention(scenario)]);
      setZones(z);
      setObservations(o);
      setAttention(a);
      setSelectedZoneId((prev) => (prev && z.some((x) => x.id === prev) ? prev : (z[0]?.id ?? "")));
      setSelectedObservationId((prev) => (prev && o.some((x) => x.id === prev) ? prev : (o[0]?.id ?? "")));
    } catch (e) {
      setZones([]);
      setObservations([]);
      setAttention(null);
      setError(e instanceof ApiError && e.kind === "backend_offline" ? "Backend offline. Fixture API could not be reached." : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [scenario]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedObservation = useMemo(
    () => observations.find((o) => o.id === selectedObservationId) ?? null,
    [observations, selectedObservationId],
  );

  // Poll the mock job lifecycle while an analysis is in flight.
  useEffect(() => {
    if (!selectedObservation || (selectedObservation.job !== "queued" && selectedObservation.job !== "running")) return;
    const t = setInterval(() => {
      void getObservation(selectedObservation.id, scenario)
        .then((fresh) => {
          if (fresh) setObservations((list) => list.map((o) => (o.id === fresh.id ? fresh : o)));
        })
        .catch(() => {});
    }, 900);
    return () => clearInterval(t);
  }, [selectedObservation?.id, selectedObservation?.job, scenario]);

  // Revoke object URLs for replaced previews; revoke everything on unmount.
  useEffect(() => {
    const current = selectedObservation?.imageUrl;
    for (const url of Array.from(previewUrls.current)) {
      if (url !== current) {
        URL.revokeObjectURL(url);
        previewUrls.current.delete(url);
      }
    }
  }, [selectedObservation?.imageUrl]);
  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current.clear();
    },
    [],
  );

  const zoneObservations = useMemo(
    () => observations.filter((o) => o.zoneId === selectedZoneId),
    [observations, selectedZoneId],
  );

  const zoneReasons = useMemo(
    () => (attention ? attention.reasons.filter((r) => r.zoneId === selectedZoneId) : []),
    [attention, selectedZoneId],
  );
  const badge = useMemo(() => {
    if (zoneReasons.some((r) => r.status === "flagged")) return { text: "Needs attention", tone: "amber" };
    if (zoneReasons.some((r) => r.status === "unknown")) return { text: "Unknown", tone: "amber" };
    if (zoneReasons.length > 0) return { text: "No flags", tone: "green" };
    return { text: "No configured flags", tone: "neutral" };
  }, [zoneReasons]);

  const handleImported = useCallback((obs: Observation) => {
    if (obs.imageUrl.startsWith("blob:")) previewUrls.current.add(obs.imageUrl);
    setObservations((list) => [obs, ...list.filter((o) => o.id !== obs.id)]);
    setSelectedZoneId(obs.zoneId);
    setSelectedObservationId(obs.id);
    setTab("inspect");
  }, []);

  const handleEvidenceLink = useCallback(
    (observationId: string) => {
      const obs = observations.find((o) => o.id === observationId);
      if (!obs) return;
      setSelectedZoneId(obs.zoneId);
      setSelectedObservationId(obs.id);
      setTab("inspect");
      setChatOpen(false);
    },
    [observations],
  );

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const tabs: Array<"inspect" | "attention"> = ["inspect", "attention"];
    const i = tabs.indexOf(tab);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      setTab(next);
      tabRefs.current[tabs.indexOf(next)]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault(); setTab("inspect"); tabRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault(); setTab("attention"); tabRefs.current[1]?.focus();
    }
  };

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Crop Health</h1>
        <div className="header-controls">
          <label className="zone-select">
            Zone
            <select value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)} aria-label="Select zone">
              {zones.length === 0 && <option value="">No zones</option>}
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </label>
          <span className={`status-badge ${badge.tone}`}>Status: {badge.text}</span>
          <button className="chat-toggle" aria-pressed={chatOpen} onClick={() => setChatOpen((v) => !v)}>
            {chatOpen ? "Hide chat" : "Chat"}
          </button>
        </div>
      </header>

      <FixtureBanner scenario={scenario} onScenario={setScenario} onRefresh={() => void load()} />

      {error && (
        <p role="alert" className="global-error">
          {error} <button onClick={() => void load()}>Retry</button>
        </p>
      )}

      <main className="layout">
        <aside className="history" aria-label="Observation history">
          <h2>History</h2>
          {loading ? (
            <p aria-live="polite">Loading observations…</p>
          ) : zoneObservations.length === 0 ? (
            <p className="empty">No observations for this zone yet.</p>
          ) : (
            <ul className="history-list">
              {zoneObservations.map((o) => (
                <li key={o.id}>
                  <button
                    className={o.id === selectedObservationId ? "history-item selected" : "history-item"}
                    aria-current={o.id === selectedObservationId}
                    onClick={() => setSelectedObservationId(o.id)}
                  >
                    <img src={o.imageUrl} alt="" width={56} height={56} />
                    <span>
                      <strong>{o.crop ?? "Unknown crop"}</strong>
                      <span className="meta">{o.source} · {o.imageKind}</span>
                      <span className="meta">{o.capturedAt ? `Capture time: ${new Date(o.capturedAt).toLocaleString()}` : "Capture time unknown"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="workspace" aria-label="Workspace">
          <div role="tablist" aria-label="Workspace views" className="tabs" onKeyDown={onTabKeyDown}>
            <button
              role="tab"
              id="tab-inspect"
              aria-selected={tab === "inspect"}
              aria-controls="panel-inspect"
              tabIndex={tab === "inspect" ? 0 : -1}
              ref={(el) => (tabRefs.current[0] = el)}
              onClick={() => setTab("inspect")}
            >
              Inspect
            </button>
            <button
              role="tab"
              id="tab-attention"
              aria-selected={tab === "attention"}
              aria-controls="panel-attention"
              tabIndex={tab === "attention" ? 0 : -1}
              ref={(el) => (tabRefs.current[1] = el)}
              onClick={() => setTab("attention")}
            >
              Attention
            </button>
          </div>

          <div role="tabpanel" id="panel-inspect" aria-labelledby="tab-inspect" hidden={tab !== "inspect"}>
            <InspectTab
              scenario={scenario}
              zones={zones}
              defaultZoneId={selectedZoneId}
              observation={selectedObservation}
              onImported={handleImported}
              onObservationUpdated={(o) => setObservations((list) => list.map((x) => (x.id === o.id ? o : x)))}
            />
          </div>
          <div role="tabpanel" id="panel-attention" aria-labelledby="tab-attention" hidden={tab !== "attention"}>
            <AttentionTab attention={attention} zones={zones} selectedZoneId={selectedZoneId} onOpenObservation={handleEvidenceLink} />
          </div>
        </section>

        <aside className={chatOpen ? "chat open" : "chat"} aria-label="Advisor chat (placeholder)">
          <ChatSidebar zone={selectedZone} observation={selectedObservation} onEvidenceLink={handleEvidenceLink} />
        </aside>
      </main>
    </div>
  );
}
