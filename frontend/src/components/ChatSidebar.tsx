import type { Observation, Zone } from "../types";

export function ChatSidebar({
  zone,
  observation,
  onEvidenceLink,
}: {
  zone: Zone | null;
  observation: Observation | null;
  onEvidenceLink: (observationId: string) => void;
}) {
  return (
    <div className="chat-panel">
      <h2>Advisor</h2>
      <p className="chat-context" aria-live="polite">
        Context — Zone: {zone?.name ?? "none"} · Observation: {observation ? `${observation.id} (${observation.imageKind}${observation.crop ? `, ${observation.crop}` : ""})` : "none selected"}
        {observation?.job ? ` · Job: ${observation.job}` : ""}
      </p>
      <div className="chat-messages">
        <div className="bubble assistant">
          <p>
            You are inspecting <strong>{zone?.name ?? "no zone"}</strong>
            {observation ? (
              <> with observation <strong>{observation.id}</strong>{observation.crop ? ` of ${observation.crop}` : ""}{observation.result ? `. Latest result: ${observation.result.predictedLabel ?? "no label"} (model score ${observation.result.score != null ? Math.round(observation.result.score * 100) + "%" : "unavailable"}).` : ". No completed analysis yet."}</>
            ) : (
              <>. Pick an observation or import an image to start.</>
            )}
          </p>
          <p className="meta">Chat is a placeholder; real messaging is not wired up.</p>
        </div>
      </div>
      <nav className="evidence-links" aria-label="Evidence links">
        <p>Jump to evidence:</p>
        <button className="link" onClick={() => onEvidenceLink("obs-1001")}>obs-1001 — early blight review (North Field)</button>
        <button className="link" onClick={() => onEvidenceLink("obs-1002")}>obs-1002 — powdery patches (Greenhouse East)</button>
      </nav>
    </div>
  );
}
