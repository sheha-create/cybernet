import React, { useState } from 'react';
import { useAgentRegistry } from '../../hooks/useBackendData';
import type { AgentStartResult, AgentSample } from '../../types';

interface AgentPanelProps {
  agentSamples: AgentSample[];
  serverUrl: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function formatUptime(seconds: number): string {
  if (!seconds) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const LABEL_PRESETS = ['My PC', 'My Laptop', 'Office PC', 'Home Server', 'Test Agent'];

const AgentPanel: React.FC<AgentPanelProps> = ({ agentSamples, serverUrl }) => {
  const { agents, status, startAgent, revoke, busy, error } = useAgentRegistry();
  const [label, setLabel] = useState('');
  const [manual, setManual] = useState<AgentStartResult | null>(null);
  const [message, setMessage] = useState('');

  const onlineSamples = new Map(agentSamples.map(sample => [sample.agentId, sample]));
  const reporting = agentSamples.some(sample => sample.online);
  const online = reporting || Boolean(status?.fresh);

  const handleStart = async () => {
    setMessage('');
    const result = await startAgent(label.trim() || 'My PC');
    setLabel('');
    if (!result) return;
    if (result.started) {
      setMessage('Collector is running. Samples arrive every 5 seconds — the live host panels now read this machine.');
      setManual(null);
    } else {
      // Server could not spawn the collector (remote deployment or
      // autostart disabled). Fall back to the classic paste-it-yourself path.
      setManual(result);
      setMessage('Server cannot supervise a local collector — paste the token on the machine to monitor.');
    }
  };

  return (
    <section className="cyber-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Collector Agent</div>
          <div className="font-mono text-[10px] text-gray-500 mt-1">
            Reports this machine's real CPU, memory, storage and network figures to the dashboard.
          </div>
        </div>        <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${online
          ? 'text-[#00ff88] border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.05)]'
          : 'text-gray-500 border-[color:var(--line-2)]'}`}>
          {online ? 'LIVE' : 'NOT REPORTING'}
        </span>
      </div>

      <div className="font-mono text-[10px] text-gray-500 leading-relaxed border border-[color:var(--line-1)] rounded p-3 bg-[rgba(0,0,0,0.25)] space-y-1">
        <div className="text-gray-300">One-click setup</div>
        <div>1. Type a label below (optional) and press <span className="text-[#00f5d4]">Start live agent</span>.</div>
        <div>2. The server issues the token, stores it in <code className="text-[#00f5d4]">agent\.env</code> and starts the collector itself — nothing to copy, paste, or run.</div>
        <div className="pt-1 text-gray-600">The collector restarts automatically whenever <code className="text-[#00f5d4]">npm run dev</code> runs, as long as the stored token is valid. Hosting the dashboard elsewhere? The button then hands you the token for the remote machine instead.</div>
      </div>

      {manual && (
        <div className="border border-[rgba(0,245,212,0.3)] rounded p-3 bg-[rgba(0,245,212,0.05)] space-y-2">
          <div className="font-mono text-[10px] text-[#00f5d4]">Token for manual setup — shown once, never retrievable afterwards.</div>
          <code className="block font-mono text-[11px] text-[#00ff41] break-all">{manual.token}</code>
          <div className="font-mono text-[10px] text-gray-500 break-all">
            On the target machine — agent/.env:
            <br />CYBERNET_SERVER_URL={serverUrl}
            <br />CYBERNET_AGENT_TOKEN={manual.token}
            <br />Then: node agent/collector.mjs
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(manual.token ?? ''); }}
              className="font-mono text-[10px] px-2 py-0.5 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)]"
            >
              ⎘ Copy token
            </button>
            <button
              onClick={() => setManual(null)}
              className="font-mono text-[10px] px-2 py-0.5 rounded border border-[color:var(--line-2)] text-gray-400 hover:text-gray-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider">
          Label <span className="text-gray-600 normal-case">— a name for this machine, e.g. &quot;My Desktop&quot;. Optional; leave blank for &quot;My PC&quot;.</span>
        </label>
        <div className="flex flex-wrap gap-1">
          {LABEL_PRESETS.map(preset => (
            <button
              key={preset}
              type="button"
              onClick={() => setLabel(preset)}
              className={`font-mono text-[10px] px-2 py-0.5 rounded border transition-colors ${
                label === preset
                  ? 'border-[rgba(0,245,212,0.5)] text-[#00f5d4] bg-[color:var(--accent-line)]'
                  : 'border-[color:var(--line-2)] text-gray-500 hover:text-gray-300 hover:border-[rgba(255,255,255,0.2)]'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={label}
            onChange={event => setLabel(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') handleStart(); }}
            placeholder="My PC"
            maxLength={60}
            className="flex-1 bg-black/30 border border-[rgba(0,245,212,0.2)] font-mono text-xs text-gray-200 px-2 py-1.5 rounded outline-none focus:border-[rgba(0,245,212,0.5)]"
          />
          <button
            onClick={handleStart}
            disabled={busy}
            className="font-mono text-xs px-3 py-1.5 rounded border border-[rgba(0,245,212,0.4)] text-[#00f5d4] bg-[rgba(0,245,212,0.06)] hover:bg-[rgba(0,245,212,0.12)] disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? 'Starting…' : '⚡ Start live agent'}
          </button>
        </div>
      </div>

      {error && <div className="font-mono text-[10px] text-[#ff2d55]">{error}</div>}
      {message && <div className="font-mono text-[10px] text-[#00ff88]">{message}</div>}

      <div className="space-y-2">
        {agents.map(agent => {
          const sample = onlineSamples.get(agent.id);
          const revoked = Boolean(agent.revokedAt);
          return (
            <div key={agent.id} className={`border rounded p-3 font-mono text-[10px] ${revoked
              ? 'border-[color:var(--line-1)] opacity-50'
              : 'border-[color:var(--accent-line)]'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-200 text-xs">{agent.label}</span>
                <div className="flex items-center gap-2">
                  <span className={revoked ? 'text-gray-600'
                    : sample?.online ? 'text-[#00ff88]' : 'text-[#ffcc00]'}>
                    {revoked ? 'REVOKED' : sample?.online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  {!revoked && (
                    <button
                      onClick={() => revoke(agent.id)}
                      disabled={busy}
                      className="px-1.5 py-0.5 rounded border border-[rgba(255,45,85,0.3)] text-[#ff2d55] hover:bg-[rgba(255,45,85,0.08)] disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
              <div className="text-gray-500 mt-1">created {new Date(agent.createdAt).toLocaleString()}</div>
              {sample && !revoked && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 mt-2 text-gray-400">
                  <span>host <b className="text-gray-200">{sample.hostname ?? '—'}</b></span>
                  <span>ip <b className="text-[#00f5d4]">{sample.primaryIp ?? '—'}</b></span>
                  <span>uptime <b className="text-gray-200">{formatUptime(sample.uptimeSeconds)}</b></span>
                  <span>cpu <b className="text-[#00f5d4]">{sample.cpuUsage}%</b> ({sample.cpuCores.length} cores)</span>
                  <span>mem <b className="text-[#00f5d4]">{sample.memoryUsage}%</b> of {formatBytes(sample.totalMemoryBytes)}</span>
                  <span>net <b className="text-gray-200">{(sample.networkInBps / 1024).toFixed(1)} KB/s in</b></span>
                </div>
              )}
            </div>
          );
        })}
        {agents.length === 0 && (
          <div className="font-mono text-[10px] text-gray-600 py-3 text-center">
            No collector tokens yet.
          </div>
        )}
      </div>
    </section>
  );
};

export default AgentPanel;
