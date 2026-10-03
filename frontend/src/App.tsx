import { useI18n } from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCropApp } from './hooks/useCropApp';
import { ChatPanel } from './chat/ChatPanel';
import { InspectTab } from './components/InspectTab';
import { AttentionTab } from './components/AttentionTab';
import { createZone } from './api';
import { importMetadata, toAttentionView, toObservationView } from './api/viewModels';

export function App() {
  const { t, locale, language, setLanguage } = useI18n();
  const app = useCropApp();
  const [tab, setTab] = useState<'inspect' | 'attention'>('inspect');
  const [chatOpen, setChatOpen] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [zoneBusy, setZoneBusy] = useState(false);
  const autoSelectedZone = useRef<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (app.selectedZoneId && app.observations.length && autoSelectedZone.current !== app.selectedZoneId) {
      autoSelectedZone.current = app.selectedZoneId;
      void app.selectObservation(app.observations[0].id);
    }
  }, [app.selectedZoneId, app.observations, app.selectObservation]);
  const selected = useMemo(() => app.selectedObservation
    ? toObservationView(app.selectedObservation, app.result, app.job) : null,
  [app.selectedObservation, app.result, app.job]);
  const history = useMemo(() => app.observations.map(obs => toObservationView(obs)), [app.observations]);
  const attention = useMemo(() => toAttentionView(app.attention), [app.attention]);
  const badge = app.attention.some(item => item.status === 'attention') ? { text: t('Needs attention'), tone: 'amber' }
    : !app.attention.length || app.attention.some(item => item.status === 'unknown') ? { text: t('Not enough information'), tone: 'amber' }
    : { text: t('No configured flags'), tone: 'green' };
  const openObservation = (id: string) => {
    setTab('inspect'); void app.selectObservation(id);
  };
  const tabKeyDown = (event: React.KeyboardEvent) => {
    const tabs = ['inspect', 'attention'] as const;
    const index = tabs.indexOf(tab);
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = (index + 1) % 2;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault(); setTab(tabs[next]); tabRefs.current[next]?.focus();
  };
  const addZone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!zoneName.trim() || zoneBusy) return;
    setZoneBusy(true); setZoneError(null);
    try {
      const zone = await createZone({ id: crypto.randomUUID(), name: zoneName.trim() });
      await app.refresh(); app.selectZone(zone.id); setZoneName('');
    } catch (error) { setZoneError(error instanceof Error ? error.message : t('Could not create zone')); }
    finally { setZoneBusy(false); }
  };
  return (
    <div className="app">
      <header className="app-header">
        <h1>{t("Crop Health")}</h1>
        <div className="header-controls">
          <label className="zone-select">भाषा / Language
            <select aria-label="भाषा / Language" value={language} onChange={e => setLanguage(e.target.value === 'hi' ? 'hi' : 'en')}>
              <option value="en">English</option><option value="hi">हिन्दी</option>
            </select>
          </label>
          <label className="zone-select">{t("Zone")}
            <select value={app.selectedZoneId ?? ''} onChange={e => app.selectZone(e.target.value)} aria-label={t("Select zone")}>
              {!app.zones.length && <option value="">{t("No zones")}</option>}
              {app.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>
          </label>
          <span className={'status-badge ' + badge.tone}>{t("Status:")} {badge.text}</span>
          <button onClick={() => void app.refresh()}>{t("Refresh")}</button>
          <button className="chat-toggle" aria-pressed={chatOpen} onClick={() => setChatOpen(value => !value)}>{chatOpen ? t('Hide chat') : t('Chat')}</button>
        </div>
      </header>
      {app.mode === 'fixture' && <div className="fixture-banner" role="status">{t("Fixture / Simulated data \u2014 development only")}</div>}
      <p className="meta" role="status">{t("Vision:")} {app.health?.vision_ready ? t('ready') : t('unavailable')} · {t("Local assistant:")} {app.health?.ollama_ready ? t('ready') : t('unavailable')}</p>
      {app.mode === 'live' && <details className="import-panel">
        <summary>{t("Add a named zone")}</summary>
        <form onSubmit={addZone} className="import-form">
          <label>{t("Zone name")}<input value={zoneName} onChange={e => setZoneName(e.target.value)} required /></label>
          <button disabled={zoneBusy || !zoneName.trim()}>{zoneBusy ? t('Adding…') : t('Add zone')}</button>
          {zoneError && <p role="alert">{t(zoneError)}</p>}
        </form>
      </details>}
      {app.error && <div role="alert" className="global-error">{t(app.error.message)} <button onClick={() => void app.refresh()}>{t("Retry / refresh")}</button> <button onClick={app.clearError}>{t("Dismiss")}</button></div>}
      <main className="layout">
        <aside className="history" aria-label={t("Observation history")}>
          <h2>{t("History")}</h2>
          {app.loadState === 'loading' ? <p aria-live="polite">{t("Loading observations\u2026")}</p>
            : !history.length ? <p className="empty">{t("No observations for this zone yet.")}</p>
            : <ul className="history-list">{history.map(obs => <li key={obs.id}>
              <button className={selected?.id === obs.id ? 'history-item selected' : 'history-item'} aria-current={selected?.id === obs.id} onClick={() => openObservation(obs.id)}>
                <img src={obs.imageUrl} alt="" width={56} height={56} />
                <span><strong>{t(obs.crop ?? 'Unknown crop')}</strong>
                  <span className="meta">{t(obs.source)} · {t(obs.imageKind)}</span>
                  <span className="meta">{obs.capturedAt ? t('Capture time: ') + new Date(obs.capturedAt).toLocaleString(locale) : t('Capture time unknown')}</span>
                </span>
              </button>
            </li>)}</ul>}
        </aside>
        <section className="workspace" aria-label={t("Workspace")}>
          <div role="tablist" aria-label={t("Workspace views")} className="tabs" onKeyDown={tabKeyDown}>
            {(['inspect', 'attention'] as const).map((name, index) => <button key={name} role="tab"
              id={'tab-' + name} aria-selected={tab === name} aria-controls={'panel-' + name} tabIndex={tab === name ? 0 : -1}
              ref={el => { tabRefs.current[index] = el; }} onClick={() => setTab(name)}>{name === 'inspect' ? t('Inspect') : t('Attention')}</button>)}
          </div>
          <div role="tabpanel" id="panel-inspect" aria-labelledby="tab-inspect" hidden={tab !== 'inspect'}>
            <InspectTab zones={app.zones} defaultZoneId={app.selectedZoneId ?? ''} observation={selected}
              onImport={async input => { await app.importObservation(input.file, importMetadata(input)); setTab('inspect'); }}
              onAnalyze={app.analyzeObservation} />
          </div>
          <div role="tabpanel" id="panel-attention" aria-labelledby="tab-attention" hidden={tab !== 'attention'}>
            <AttentionTab attention={attention} zones={app.zones} selectedZoneId={app.selectedZoneId ?? ''} onOpenObservation={openObservation} />
          </div>
        </section>
        <aside className={chatOpen ? 'chat open' : 'chat'} aria-label={t("Local AI explanations")}>
          <ChatPanel zoneId={app.selectedZoneId} observationId={app.selectedObservation?.id ?? null}
            onOpenEvidence={evidence => { if (evidence.observation_id) openObservation(evidence.observation_id); }} />
        </aside>
      </main>
    </div>
  );
}
