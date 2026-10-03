// Friend 1 owns this file.
// This is a placeholder shell that uses the public interfaces from Friend 2.
// Replace with your full App implementation.

import { useCropApp } from './hooks/useCropApp';
import { ChatPanel } from './chat/ChatPanel';

export function App() {
  const app = useCropApp();

  return (
    <div className="app">
      <header className="app__header">
        <h1>Root-Cause</h1>
        {app.mode === 'fixture' && (
          <span className="app__fixture-banner">Fixture / Simulated Data</span>
        )}
      </header>

      <main className="app__main">
        <div className="app__sidebar">
          <h2>Zones</h2>
          {app.zones.map((zone) => (
            <button
              key={zone.id}
              className={`app__zone-btn ${app.selectedZoneId === zone.id ? 'app__zone-btn--active' : ''}`}
              onClick={() => app.selectZone(zone.id)}
            >
              {zone.name}
            </button>
          ))}

          {app.selectedZoneId && (
            <>
              <h2>Observations</h2>
              {app.observations.map((obs) => (
                <button
                  key={obs.id}
                  className={`app__obs-btn ${app.selectedObservation?.id === obs.id ? 'app__obs-btn--active' : ''}`}
                  onClick={() => app.selectObservation(obs.id)}
                >
                  {obs.id}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="app__content">
          {app.selectedObservation ? (
            <div className="app__detail">
              <h2>{app.selectedObservation.id}</h2>
              {app.result && (
                <div className="app__result">
                  <h3>Analysis Result</h3>
                  <p>Classification: {app.result.classification?.label ?? 'N/A'}</p>
                </div>
              )}
              {app.job && (
                <div className="app__job">
                  <p>Job: {app.job.id} — {app.job.status}</p>
                </div>
              )}
            </div>
          ) : (
            <p>Select an observation to view details.</p>
          )}
        </div>

        <div className="app__chat">
          <ChatPanel
            zoneId={app.selectedZoneId}
            observationId={app.selectedObservation?.id ?? null}
            onOpenEvidence={(ev) => {
              if (ev.observation_id) {
                app.selectObservation(ev.observation_id);
              }
            }}
          />
        </div>
      </main>

      {app.error && (
        <div className="app__error" onClick={app.clearError}>
          <strong>Error:</strong> {app.error.message}
        </div>
      )}
    </div>
  );
}
