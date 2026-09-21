import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Alert } from '../../types';
import PanelMenu from '../PanelMenu';

// Fix default icon issue
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

interface VisitMarker {
  id: number;
  ip: string;
  country: string;
  city: string;
  isp: string;
  asn: string;
  abuseScore: number;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  flagged: boolean;
}

interface GeoMapPanelProps {
  alerts: Alert[];
  visits: VisitMarker[];
  addToBlocklist: (ip: string, reason: string, durationHours: number) => void;
  addToast: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

// Custom pulsing marker icon
function createPulseIcon(severity: string) {
  const color = severity === 'CRITICAL' ? '#ff2d55' : severity === 'HIGH' ? '#ff8c00' : '#00f5d4';
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 12px; height: 12px;
      background: ${color};
      border-radius: 50%;
      box-shadow: 0 0 0 0 ${color}80;
      animation: pulse-marker 1.5s ease-out infinite;
      border: 2px solid ${color};
    "></div>
    <style>
      @keyframes pulse-marker {
        0% { box-shadow: 0 0 0 0 ${color}80; }
        70% { box-shadow: 0 0 0 8px transparent; }
        100% { box-shadow: 0 0 0 0 transparent; }
      }
    </style>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

// Auto-pan to high severity alerts
function MapAutoPan({ alerts }: { alerts: Alert[] }) {
  const map = useMap();
  const lastAlertRef = useRef<string>('');

  useEffect(() => {
    const highSeverity = alerts.find(a =>
      (a.severity === 'CRITICAL' || a.severity === 'HIGH') && a.lat && a.lng
    );
    if (highSeverity && highSeverity.id !== lastAlertRef.current && highSeverity.lat && highSeverity.lng) {
      lastAlertRef.current = highSeverity.id;
      map.flyTo([highSeverity.lat, highSeverity.lng], 4, { duration: 1.5 });
    }
  }, [alerts, map]);

  return null;
}

const createVisitIcon = () => L.divIcon({
  className: '',
  html: `<div style="width: 10px; height: 10px; background: rgba(0,245,212,0.9); border-radius: 50%; border: 1px solid #00f5d4"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

const GeoMapPanel: React.FC<GeoMapPanelProps> = ({ alerts, visits, addToBlocklist, addToast, onRefresh, onPin }) => {
  const geoAlerts = alerts.filter(a => a.lat && a.lng).slice(0, 50);
  const visitMarkers = visits.filter(v => v.latitude != null && v.longitude != null).slice(0, 120);

  const handleBlock = (alert: Alert) => {
    addToBlocklist(alert.sourceIP, `Geo-blocked: ${alert.eventType}`, 24);
    addToast(`Blocked ${alert.sourceIP}`, 'success');
  };

  return (
    <div className="cyber-card p-4 flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Threat Map</span>
        <PanelMenu panelId="geomap" title="Threat Map" onRefresh={onRefresh} onPin={onPin} />
      </div>

      <div className="flex-1 rounded overflow-hidden" style={{ minHeight: 200 }}>
        <MapContainer
          center={[20, 0]}
          zoom={2}
          style={{ height: '100%', width: '100%', background: '#050d1a' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <MapAutoPan alerts={alerts} />
          {geoAlerts.map(alert => (
            <Marker
              key={alert.id}
              position={[alert.lat!, alert.lng!]}
              icon={createPulseIcon(alert.severity)}
            >
              <Popup>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, background: '#0a1628', color: '#e0e0e0', padding: 8, borderRadius: 4, minWidth: 180 }}>
                  <div style={{ color: '#00f5d4', marginBottom: 4 }}>{alert.eventType}</div>
                  <div>IP: {alert.sourceIP}</div>
                  <div>Port: {alert.targetPort}</div>
                  <div>Severity: <span style={{ color: alert.severity === 'CRITICAL' ? '#ff2d55' : alert.severity === 'HIGH' ? '#ff8c00' : '#ffcc00' }}>{alert.severity}</span></div>
                  <button
                    onClick={() => handleBlock(alert)}
                    style={{ marginTop: 6, padding: '2px 8px', background: 'rgba(255,45,85,0.15)', border: '1px solid rgba(255,45,85,0.4)', color: '#ff2d55', borderRadius: 2, cursor: 'pointer', fontSize: 10 }}
                  >
                    Block IP
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
          {visitMarkers.map(visit => (
            <Marker
              key={`visit-${visit.id}`}
              position={[visit.latitude!, visit.longitude!]}
              icon={createVisitIcon()}
            >
              <Popup>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, background: '#0a1628', color: '#e0e0e0', padding: 8, borderRadius: 4, minWidth: 180 }}>
                  <div style={{ color: '#00f5d4', marginBottom: 4 }}>Live Visit</div>
                  <div>IP: {visit.ip}</div>
                  <div>Country: {visit.country}</div>
                  <div>ISP: {visit.isp}</div>
                  <div>Abuse Score: {visit.abuseScore}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default GeoMapPanel;
