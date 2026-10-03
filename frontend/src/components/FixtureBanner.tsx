import { SCENARIOS, type Scenario } from "../api/mockApi";

export function FixtureBanner({ scenario, onScenario, onRefresh }: { scenario: Scenario; onScenario: (s: Scenario) => void; onRefresh: () => void }) {
  return (
    <div className="fixture-banner" role="status">
      <strong>Fixture mode:</strong> running on mock data — no real backend connected.
      <label className="mock-switcher">
        Mock state
        <select value={scenario} onChange={(e) => onScenario(e.target.value as Scenario)}>
          {SCENARIOS.map((s) => (
            <option key={s} value={s}>{s.split("_").join(" ")}</option>
          ))}
        </select>
      </label>
      <button onClick={onRefresh}>Refresh</button>
    </div>
  );
}
