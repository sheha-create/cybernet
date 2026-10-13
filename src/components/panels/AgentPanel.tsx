import React, { useState } from 'react';
import { useAgentRegistry } from '../../hooks/useBackendData';
import type { AgentSample } from '../../types';

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
  const { agents, issueToken, revoke, busy, error } = useAgentRegistry();
  const [label, setLabel] = useState('');
  const [issued, setIssued] = useState<{ label: string; token: string } | null>(null);

  const onlineSamples = new Map(agentSamples.map(sample => [sample.agentId, sample]));
  const anyOnline = agentSamples.some(sample => sample.online);

  const handleIssue = async () => {
    const created = await issueToken(label.trim() || 'My PC');
    if (created) {
      setIssued({ label: created.label, token: created.token });
      setLabel('');
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
        </div>
        <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${anyOnline
          ? 'text-[#00ff88] border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.05)]'
          : 'text-gray-500 border-[rgba(255,255,255,0.1)]'}`}>
          {anyOnline ? 'ONLINE' : 'NO AGENT REPORTING'}
        </span>
      </div>

      <div className="font-mono text-[10px] text-gray-500 leading-relaxed border border-[rgba(255,255,255,0.06)] rounded p-3 bg-[rgba(0,0,0,0.25)] space-y-1">
        <div className="text-gray-300">Where the credentials go</div>
        <div>The token is <span className="text-[#00f5d4]">not</span> typed into this page. It goes in one file on the machine you want to monitor:</div>
        <div className="pl-2 text-gray-400">cybernet\agent\.env</div>
        <div className="pt-1 text-gray-300">Steps</div>
        <div>1. Type a label below, click <span className="text-[#00f5d4]">Generate token</span>, then copy it (shown once).</div>
        <div>2. Open <code className="text-[#00f5d4]">agent\.env</code> and paste it after <code className="text-[#00f5d4]">CYBERNET_AGENT_TOKEN=</code></div>
        <div>3. Run <code className="text-[#00f5d4]">node agent\collector.mjs</code> and leave it running.</div>
        <div className="pt-1 text-gray-600">Until the agent runs, the Scans tab stays empty and the Core Load Map reads SERVER HOST instead of YOUR PC. More detail in agent/README.md.</div>
      </div>

      {issued && (
        <div className="border border-[rgba(0,245,212,0.3)] rounded p-3 bg-[rgba(0,245,212,0.05)] space-y-2">
          <div className="font-mono text-[10px] text-[#00f5d4]">Token for "{issued.label}" — copy it now, it is not shown again.</div>
          <code className="block font-mono text-[11px] text-[#00ff41] break-all">{issued.token}</code>
          <div className="font-mono text-[10px] text-gray-500 break-all">
            agent/.env:
            <br />CYBERNET_SERVER_URL={serverUrl}
            <br />CYBERNET_AGENT_TOKEN={issued.token}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(issued.token); }}
              className="font-mono text-[10px] px-2 py-0.5 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)]"
            >
              ⎘ Copy token
            </button>
            <button
              onClick={() => setIssued(null)}
              className="font-mono text-[10px] px-2 py-0.5 rounded border border-[rgba(255,255,255,0.12)] text-gray-400 hover:text-gray-200"
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
                  ? 'border-[rgba(0,245,212,0.5)] text-[#00f5d4] bg-[rgba(0,245,212,0.1)]'
                  : 'border-[rgba(255,255,255,0.1)] text-gray-500 hover:text-gray-300 hover:border-[rgba(255,255,255,0.2)]'
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
            onKeyDown={event => { if (event.key === 'Enter') handleIssue(); }}
            placeholder="My PC"
            maxLength={60}
            className="flex-1 bg-black/30 border border-[rgba(0,245,212,0.2)] font-mono text-xs text-gray-200 px-2 py-1.5 rounded outline-none focus:border-[rgba(0,245,212,0.5)]"
          />
          <button
            onClick={handleIssue}
            disabled={busy}
            className="font-mono text-xs px-3 py-1.5 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)] disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? 'Working…' : 'Generate token'}
          </button>
        </div>
      </div>

      {error && <div className="font-mono text-[10px] text-[#ff2d55]">{error}</div>}

      <div className="space-y-2">
        {agents.map(agent => {
          const sample = onlineSamples.get(agent.id);
          const revoked = Boolean(agent.revokedAt);
          return (
            <div key={agent.id} className={`border rounded p-3 font-mono text-[10px] ${revoked
              ? 'border-[rgba(255,255,255,0.06)] opacity-50'
              : 'border-[rgba(0,245,212,0.15)]'}`}>
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
