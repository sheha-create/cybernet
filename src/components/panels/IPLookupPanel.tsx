import React, { useState } from 'react';
import { isValidIPv4, computeThreatScore } from '../../utils/logic';
import type { IPThreatData } from '../../utils/threatIntel';
import { useAuthedFetch } from '../../auth/api';
import PanelMenu from '../PanelMenu';

interface IPLookupResult {
  ip: string;
  country_name?: string;
  city?: string;
  org?: string;
  asn?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  abuseScore?: number;
  totalReports?: number;
  usageType?: string;
  isVPN?: boolean;
  isProxy?: boolean;
  isBogon?: boolean;
  isDatacenter?: boolean;
  isResidential?: boolean;
  isMobile?: boolean;
  threatTypes?: string[];
  error?: string;
}

interface IPLookupPanelProps {
  onRefresh?: () => void;
  onPin?: (id: string) => void;
  onIPTracked?: (ip: string, threatData: IPThreatData) => void;
}

const IPLookupPanel: React.FC<IPLookupPanelProps> = ({ onRefresh, onPin, onIPTracked }) => {
  const authedFetch = useAuthedFetch();
  const [ip, setIp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IPLookupResult | null>(null);
  const [threatData, setThreatData] = useState<IPThreatData | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setThreatData(null);

    if (!isValidIPv4(ip.trim())) {
      setError('Invalid IPv4 address');
      return;
    }

    setLoading(true);
    try {
      const res = await authedFetch(`/api/lookup/${ip.trim()}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as IPLookupResult;
      if ((data as any).error) throw new Error((data as any).error);
      setResult(data);

      if (data.abuseScore != null) {
        const threats: IPThreatData = {
          ip: data.ip,
          country: data.country_name || data.city || 'Unknown',
          city: data.city || 'Unknown',
          isp: data.org || 'Unknown',
          asn: data.asn || 'Unknown',
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          abuseScore: data.abuseScore,
          totalReports: data.totalReports || 0,
          isVPN: data.isVPN || false,
          isProxy: data.isProxy || false,
          isBogon: data.isBogon || false,
          isDatacenter: data.isDatacenter || false,
          isResidential: data.isResidential || false,
          isMobile: data.isMobile || false,
          usageType: data.usageType || 'Unknown',
          threatTypes: data.threatTypes || [],
          recentActivity: (data.totalReports || 0) > 0,
        };

        setThreatData(threats);
        if (onIPTracked) {
          onIPTracked(ip.trim(), threats);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const threatScore = threatData ? threatData.abuseScore : (result ? computeThreatScore(result.ip) : 0);

  const reportText = result ? `
IP LOOKUP REPORT
================
IP:        ${result.ip}
Country:   ${result.country_name ?? threatData?.country ?? 'N/A'}
City:      ${result.city ?? threatData?.city ?? 'N/A'}
ISP:       ${result.org ?? threatData?.isp ?? 'N/A'}
ASN:       ${result.asn ?? threatData?.asn ?? 'N/A'}
Timezone:  ${result.timezone ?? 'N/A'}
Lat/Lng:   ${result.latitude ?? threatData?.latitude ?? 'N/A'}, ${result.longitude ?? threatData?.longitude ?? 'N/A'}

THREAT INTELLIGENCE
===================
Abuse Score: ${threatScore}/100
Total Reports: ${threatData?.totalReports ?? 0}
Threat Types: ${threatData?.threatTypes.join(', ') ?? 'Clean'}
Usage Type: ${threatData?.usageType ?? 'Unknown'}
VPN: ${threatData?.isVPN ? 'Yes' : 'No'}
Proxy: ${threatData?.isProxy ? 'Yes' : 'No'}
Datacenter: ${threatData?.isDatacenter ? 'Yes' : 'No'}
Bogon: ${threatData?.isBogon ? 'Yes' : 'No'}
Residential: ${threatData?.isResidential ? 'Yes' : 'No'}
Mobile: ${threatData?.isMobile ? 'Yes' : 'No'}

Generated: ${new Date().toISOString()}
`.trim() : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(reportText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const scoreColor = threatScore > 70 ? '#ff2d55' : threatScore > 40 ? '#ffcc00' : '#00ff88';

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">IP Lookup</span>
        <PanelMenu panelId="iplookup" title="IP Lookup" data={result} onRefresh={onRefresh} onPin={onPin} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1">
          <input
            value={ip}
            onChange={e => { setIp(e.target.value); setError(''); }}
            placeholder="Enter IPv4 address..."
            className={`w-full bg-[rgba(0,0,0,0.3)] border font-mono text-xs text-gray-200 px-2 py-1.5 rounded outline-none transition-colors ${
              error ? 'border-[rgba(255,45,85,0.5)]' : 'border-[rgba(0,245,212,0.2)] focus:border-[rgba(0,245,212,0.5)]'
            }`}
          />
          {error && <div className="text-[#ff2d55] font-mono text-[10px] mt-0.5">{error}</div>}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="font-mono text-xs px-3 py-1.5 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : 'LOOKUP'}
        </button>
      </form>

      {result && (
        <div
          className="flex-1 overflow-y-auto font-mono text-xs rounded p-3 space-y-2"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,245,212,0.1)' }}
        >
          <div className="text-[#00f5d4] text-[10px] uppercase tracking-widest mb-2">// WHOIS & THREAT REPORT</div>
          
          {/* Geolocation Info */}
          <div className="space-y-1">
            {[
              ['IP', result.ip],
              ['Country', threatData?.country || result.country_name || 'N/A'],
              ['City', threatData?.city || result.city || 'N/A'],
              ['ISP', threatData?.isp || result.org || 'N/A'],
              ['ASN', threatData?.asn || result.asn || 'N/A'],
              ['Timezone', result.timezone || 'N/A'],
              ['Lat/Lng', `${threatData?.latitude || result.latitude || 'N/A'}, ${threatData?.longitude || result.longitude || 'N/A'}`],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-gray-500 w-20 flex-shrink-0">{k}:</span>
                <span className="text-gray-200">{v}</span>
              </div>
            ))}
          </div>

          {/* Threat Intelligence */}
          {threatData && (
            <>
              <div className="border-t border-[rgba(0,245,212,0.1)] pt-2 mt-2">
                <div className="text-[#ff6b9d] text-[10px] uppercase tracking-widest mb-1">⚠ THREAT INTEL</div>
                <div className="space-y-0.5">
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-20 flex-shrink-0">Abuse Score:</span>
                    <span style={{ color: scoreColor, textShadow: `0 0 6px ${scoreColor}80` }}>
                      {threatScore}/100
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-20 flex-shrink-0">Reports:</span>
                    <span className="text-gray-200">{threatData.totalReports}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-20 flex-shrink-0">Threats:</span>
                    <span className="text-[#ffcc00] text-[10px]">
                      {threatData.threatTypes.join(', ') || 'Clean'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-20 flex-shrink-0">Usage:</span>
                    <span className="text-gray-200">{threatData.usageType}</span>
                  </div>
                  
                  {/* Flags */}
                  <div className="flex gap-1 flex-wrap mt-1">
                    {threatData.isVPN && <span className="px-1 py-0.5 bg-[rgba(255,45,85,0.2)] text-[#ff2d55] text-[9px] rounded">VPN</span>}
                    {threatData.isProxy && <span className="px-1 py-0.5 bg-[rgba(255,45,85,0.2)] text-[#ff2d55] text-[9px] rounded">PROXY</span>}
                    {threatData.isDatacenter && <span className="px-1 py-0.5 bg-[rgba(255,193,7,0.2)] text-[#ffcc00] text-[9px] rounded">DC</span>}
                    {threatData.isBogon && <span className="px-1 py-0.5 bg-[rgba(255,45,85,0.2)] text-[#ff2d55] text-[9px] rounded">BOGON</span>}
                    {threatData.isResidential && <span className="px-1 py-0.5 bg-[rgba(0,245,212,0.2)] text-[#00f5d4] text-[9px] rounded">RES</span>}
                    {threatData.isMobile && <span className="px-1 py-0.5 bg-[rgba(0,245,212,0.2)] text-[#00f5d4] text-[9px] rounded">MOBILE</span>}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1 border-t border-[rgba(0,245,212,0.1)]">
            <span className="text-gray-500 w-20 flex-shrink-0">Risk Level:</span>
            <span style={{ color: scoreColor, textShadow: `0 0 6px ${scoreColor}80` }}>
              {threatScore > 75 ? '🔴 CRITICAL' : threatScore > 50 ? '🟠 HIGH' : threatScore > 25 ? '🟡 MEDIUM' : '🟢 LOW'}
            </span>
          </div>

          <button
            onClick={handleCopy}
            className="mt-2 w-full font-mono text-[10px] py-1 rounded border border-[rgba(0,245,212,0.2)] text-gray-400 hover:text-[#00f5d4] transition-colors"
          >
            {copied ? '✓ Copied!' : '⎘ Copy Report'}
          </button>
        </div>
      )}

      {!result && !loading && (
        <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-xs">
          Enter an IP to lookup
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center text-[#00f5d4] font-mono text-xs animate-glow-pulse">
          Querying...
        </div>
      )}
    </div>
  );
};

export default IPLookupPanel;
