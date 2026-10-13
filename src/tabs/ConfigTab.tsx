import React from 'react';
import type { DashboardState } from '../hooks/useDashboardState';
import AgentPanel from '../components/panels/AgentPanel';

interface ConfigTabProps {
  state: DashboardState;
}

const ConfigTab: React.FC<ConfigTabProps> = ({ state }) => {
  const { darkMode, setDarkMode, agentSamples } = state;
  // The agent talks to the API directly, not through the Vite dev server, so the
  // frontend port has to be swapped for the backend port.
  const backendUrl = import.meta.env.VITE_BACKEND_URL
    ?? `${window.location.protocol}//${window.location.hostname}:3001`;

  return (
    <div className="h-full p-3 overflow-auto">
      <div className="max-w-2xl mx-auto space-y-4">
        <AgentPanel agentSamples={agentSamples} serverUrl={backendUrl} />

        <section className="cyber-card p-4 space-y-3">
          <div className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Detection Scope</div>
          <p className="font-mono text-xs text-gray-400 leading-relaxed">
            This service records request signatures and request-rate thresholds it observes directly, plus host CPU, memory, storage, and network counters. It does not use external threat feeds, geolocation services, synthetic events, or API keys.
          </p>
          <div className="font-mono text-[10px] text-gray-600">Set TRUST_PROXY=true only when deployed behind a trusted reverse proxy.</div>
        </section>

        <section className="cyber-card p-4 space-y-3">
          <div className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Display</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xs text-gray-300">Dark mode</div>
              <div className="font-mono text-[10px] text-gray-600">Changes only the local dashboard theme.</div>
            </div>
            <button onClick={() => setDarkMode(!darkMode)} aria-label="Toggle dark mode" className={`relative w-10 h-5 rounded-full transition-colors ${darkMode ? 'bg-[rgba(0,245,212,0.3)]' : 'bg-[rgba(255,255,255,0.1)]'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${darkMode ? 'translate-x-5 bg-[#00f5d4]' : 'translate-x-0.5 bg-gray-400'}`} />
            </button>
          </div>
        </section>

        <section className="cyber-card p-4 space-y-2">
          <div className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Operations</div>
          <div className="font-mono text-xs text-gray-400 leading-relaxed">
            Security events are stored in SQLite and written as NDJSON to the configured log directory. Local triage rules are exported as firewall-rule snippets; applying firewall changes remains an explicit operator action.
          </div>
        </section>
      </div>
    </div>
  );
};

export default ConfigTab;
