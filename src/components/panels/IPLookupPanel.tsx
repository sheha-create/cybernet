import React, { useState } from 'react';
import { useAuthContext } from '../../auth/AuthContext';
import { formatIP, ipFamily, isValidIP } from '../../utils/ip';
import { apiUrl } from '../../utils/api';
import PanelMenu from '../PanelMenu';

interface Geo {
  country?: string;
  countryCode?: string;
  city?: string;
  lat?: number;
  lon?: number;
  isp?: string;
  proxy?: boolean;
  hosting?: boolean;
  mobile?: boolean;
  private?: boolean;
  lookupFailed?: boolean;
}

interface Shodan {
  indexed: boolean;
  unavailable?: boolean;
  ports: number[];
  cves: string[];
  tags: string[];
  hostnames: string[];
  cpes: string[];
}

interface Intel {
  ip: string;
  family: 'IPv4' | 'IPv6' | null;
  private: boolean;
  note?: string;
  geo: Geo | null;
  shodan: Shodan;
  threat: { score: number; reasons: string[] };
  observed: { eventCount: number; lastSeen: string | null; highestSeverity: string | null } | null;
  generatedAt: string;
  cached: boolean;
}

function scoreColor(score: number): string {
  if (score >= 60) return '#ff2d55';
  if (score >= 30) return '#ffcc00';
  if (score > 0) return '#00f5d4';
  return '#00ff88';
}

function scoreLabel(score: number): string {
  if (score >= 60) return 'HIGH RISK';
  if (score >= 30) return 'SUSPICIOUS';
  if (score > 0) return 'LOW RISK';
  return 'NO RISK FOUND';
}

const RISKY_PORTS: Record<number, string> = {
  21: 'FTP', 23: 'Telnet', 69: 'TFTP', 135: 'RPC', 139: 'NetBIOS', 445: 'SMB',
  1433: 'MSSQL', 3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC',
  6379: 'Redis', 9200: 'Elasticsearch', 27017: 'MongoDB',
};

const IPLookupPanel: React.FC<{ onPin?: (id: string) => void }> = ({ onPin }) => {
  const { getIdToken } = useAuthContext();
  const [ip, setIp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Intel | null>(null);

  const lookup = async (target: string) => {
    const candidate = target.trim();
    if (!isValidIP(candidate)) {
      setError('Enter a valid IPv4 or IPv6 address, for example 8.8.8.8 or 2606:4700:4700::1111');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const token = await getIdToken();
      const response = await fetch(apiUrl(`/api/ip/intel?ip=${encodeURIComponent(candidate)}`), {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
      setResult(await response.json() as Intel);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">IP Intelligence</span>
          <div className="font-mono text-[10px] text-gray-500 mt-1">
            Passive lookup from Shodan InternetDB and geolocation. The target is never probed.
          </div>
        </div>
        <PanelMenu panelId="iplookup" title="IP Intelligence" data={result} onPin={onPin} />
      </div>

      <form onSubmit={e => { e.preventDefault(); lookup(ip); }} className="flex gap-2">
        <input
          value={ip}
          onChange={e => setIp(e.target.value)}
          placeholder="IPv4 or IPv6 address, e.g. 2606:4700:4700::1111"
          className="flex-1 bg-black/30 border border-[rgba(0,245,212,0.2)] font-mono text-xs text-gray-200 px-2 py-1.5 rounded outline-none focus:border-[rgba(0,245,212,0.5)]"
        />
        <button type="submit" disabled={loading} className="font-mono text-xs px-3 py-1.5 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] disabled:opacity-50">
          {loading ? '...' : 'CHECK'}
        </button>
      </form>

      {error && <div className="font-mono text-[10px] text-[#ff2d55]">{error}</div>}

      {result ? (
        <div className="flex-1 min-h-0 overflow-auto font-mono text-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-100 text-sm break-all">{formatIP(result.ip)}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-[rgba(255,255,255,0.15)] text-gray-400">
                {result.family ?? (ipFamily(result.ip) ?? '—')}
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded border"
                style={{
                  color: scoreColor(result.threat.score),
                  borderColor: `${scoreColor(result.threat.score)}55`,
                  background: `${scoreColor(result.threat.score)}11`,
                }}
              >
                {scoreLabel(result.threat.score)} · {result.threat.score}
              </span>
            </div>
          </div>

          {result.private ? (
            <div className="text-[10px] text-gray-500 leading-relaxed">{result.note}</div>
          ) : (
            <>
              {result.geo && !result.geo.lookupFailed && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <span className="text-gray-500">location <b className="text-gray-200">{[result.geo.city, result.geo.country].filter(Boolean).join(', ') || 'unknown'}</b></span>
                  <span className="text-gray-500">isp <b className="text-gray-200">{result.geo.isp ?? 'unknown'}</b></span>
                  <span className="text-gray-500">coordinates <b className="text-gray-200">{result.geo.lat != null ? `${result.geo.lat}, ${result.geo.lon}` : 'n/a'}</b></span>
                  <span className="text-gray-500">flags <b className={result.geo.proxy || result.geo.hosting ? 'text-[#ffcc00]' : 'text-[#00ff88]'}>
                    {[result.geo.proxy && 'proxy', result.geo.hosting && 'hosting', result.geo.mobile && 'mobile'].filter(Boolean).join(', ') || 'none'}
                  </b></span>
                </div>
              )}

              {result.shodan.indexed ? (
                <div className="space-y-2">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Shodan InternetDB</div>
                  {result.shodan.hostnames.length > 0 && (
                    <div className="text-[10px] text-gray-400 break-all">hostnames: {result.shodan.hostnames.join(', ')}</div>
                  )}
                  {result.shodan.ports.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {result.shodan.ports.map(port => (
                        <span
                          key={port}
                          className="text-[10px] px-1.5 py-0.5 rounded border"
                          style={RISKY_PORTS[port]
                            ? { color: '#ff8c00', borderColor: 'rgba(255,140,0,0.35)', background: 'rgba(255,140,0,0.08)' }
                            : { color: '#00f5d4', borderColor: 'rgba(0,245,212,0.25)' }}
                          title={RISKY_PORTS[port] ?? 'Known open port'}
                        >
                          {port}{RISKY_PORTS[port] ? ` ${RISKY_PORTS[port]}` : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-600">No known open ports in Shodan records.</div>
                  )}
                  {result.shodan.cves.length > 0 && (
                    <div className="text-[10px] text-[#ff2d55] break-all">CVEs: {result.shodan.cves.join(', ')}</div>
                  )}
                  {result.shodan.tags.length > 0 && (
                    <div className="text-[10px] text-gray-400">tags: {result.shodan.tags.join(', ')}</div>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-gray-600">
                  {result.shodan.unavailable
                    ? 'Shodan InternetDB is unreachable right now.'
                    : 'Shodan has no scan record for this address.'}
                </div>
              )}

              {result.threat.reasons.length > 0 && (
                <div className="text-[10px] text-gray-400 space-y-0.5">
                  {result.threat.reasons.map(reason => <div key={reason}>• {reason}</div>)}
                </div>
              )}

              {result.observed && result.observed.eventCount > 0 && (
                <div className="border-t border-[rgba(0,245,212,0.12)] pt-2 text-[10px]">
                  <span className="text-gray-500">observed against your account: </span>
                  <b className="text-[#ff2d55]">{result.observed.eventCount}</b>
                  <span className="text-gray-500"> event(s), highest </span>
                  <b className="text-[#ffcc00]">{result.observed.highestSeverity ?? 'n/a'}</b>
                </div>
              )}
            </>
          )}

          <div className="text-[10px] text-gray-600 border-t border-[rgba(255,255,255,0.06)] pt-2">
            Looked up {new Date(result.generatedAt).toLocaleTimeString()}{result.cached ? ' (cached)' : ''}. Passive database lookup only.
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center font-mono text-[10px] text-gray-600 text-center px-4">
          Check any public IPv4 or IPv6 address for location, known open ports, CVEs and risk flags.
        </div>
      )}
    </div>
  );
};

export default IPLookupPanel;
