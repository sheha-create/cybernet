import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { ThreatLevel } from '../../types';
import { useAuthContext } from '../../auth/AuthProvider';
import { apiUrl } from '../../utils/api';
import PanelMenu from '../PanelMenu';

interface GeoSource {
  ip: string;
  eventCount: number;
  lastSeen: string;
  severity: ThreatLevel;
  geo: {
    country?: string;
    countryCode?: string;
    city?: string;
    lat?: number;
    lon?: number;
    isp?: string;
    proxy?: boolean;
    hosting?: boolean;
    private?: boolean;
    lookupFailed?: boolean;
  } | null;
}

const SEVERITY_COLOR: Record<ThreatLevel, string> = {
  LOW: '#00f5d4',
  MED: '#ffcc00',
  HIGH: '#ff8c00',
  CRITICAL: '#ff2d55',
};

function severityRank(severity: ThreatLevel): number {
  return { LOW: 1, MED: 2, HIGH: 3, CRITICAL: 4 }[severity];
}

const GeoMapPanel: React.FC<{ onPin?: (id: string) => void }> = ({ onPin }) => {
  const { getIdToken } = useAuthContext();
  const [sources, setSources] = useState<GeoSource[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const token = await getIdToken();
        const response = await fetch(apiUrl('/api/threats/geo'), {
          signal: AbortSignal.timeout(8_000),
          headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!response.ok || !active) return;
        const data = await response.json() as { sources: GeoSource[] };
        if (active) {
          setSources(data.sources ?? []);
          setError('');
        }
      } catch {
        if (active) setError('Threat source lookup unavailable');
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [getIdToken]);

  const mappable = useMemo(
    () => sources.filter(s => typeof s.geo?.lat === 'number' && typeof s.geo?.lon === 'number'),
    [sources],
  );

  const peakSeverity = useMemo(
    () => sources.reduce<ThreatLevel | null>(
      (worst, s) => (worst === null || severityRank(s.severity) > severityRank(worst) ? s.severity : worst),
      null,
    ),
    [sources],
  );

  const unlocated = sources.length - mappable.length;
  const maxCount = Math.max(1, ...mappable.map(s => s.eventCount));

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Threat Map</span>
          <div className="font-mono text-[10px] text-gray-500 mt-1">
            Geolocation of source addresses observed against your account
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-gray-600">{sources.length} sources</span>
          <PanelMenu panelId="geomap" title="Threat Map" data={sources} onPin={onPin} />
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded overflow-hidden border border-[color:var(--accent-line)]">
        {mappable.length > 0 ? (
          <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {mappable.map(source => {
              const radius = 6 + Math.min(14, (source.eventCount / maxCount) * 14);
              return (
                <CircleMarker
                  key={source.ip}
                  center={[source.geo!.lat as number, source.geo!.lon as number]}
                  radius={radius}
                  pathOptions={{
                    color: SEVERITY_COLOR[source.severity],
                    fillColor: SEVERITY_COLOR[source.severity],
                    fillOpacity: 0.35,
                    weight: 1.5,
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      <div><b>{source.ip}</b></div>
                      <div>severity: {source.severity}</div>
                      <div>events: {source.eventCount}</div>
                      <div>location: {[source.geo?.city, source.geo?.country].filter(Boolean).join(', ') || 'unknown'}</div>
                      {source.geo?.isp && <div>isp: {source.geo.isp}</div>}
                      <div>last seen: {new Date(source.lastSeen).toLocaleString()}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
            <span className="font-mono text-xs text-gray-500">
              {sources.length === 0
                ? 'No observed sources yet'
                : `${sources.length} source${sources.length === 1 ? '' : 's'} observed, none publicly geolocatable`}
            </span>
            {sources.length > 0 && unlocated > 0 && (
              <span className="font-mono text-[10px] text-gray-600">
                Private and loopback addresses cannot be placed on a map.
              </span>
            )}
            {error && <span className="font-mono text-[10px] text-[#ff2d55]">{error}</span>}
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <div className="flex items-center gap-3 font-mono text-[10px] text-gray-500 border-t border-[color:var(--line-2)] pt-2 flex-wrap">
          <span>PEAK {peakSeverity ?? '—'}</span>
          {mappable.length < sources.length && <span>UNMAPPED {unlocated}</span>}
          {(['LOW', 'MED', 'HIGH', 'CRITICAL'] as ThreatLevel[]).map(severity => (
            <span key={severity} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: SEVERITY_COLOR[severity] }} />
              {severity}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default GeoMapPanel;
