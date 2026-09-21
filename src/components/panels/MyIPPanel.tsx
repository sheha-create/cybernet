import React, { useEffect, useRef, useState } from 'react';
import type { Alert, ThreatLevel } from '../../types';

interface MyIPPanelProps {
  myIP: string;
  myIPAlerts: Alert[];
  onPin: (id: string) => void;
}

const SEVERITY_COLOR: Record<ThreatLevel, string> = {
  LOW: '#00f5d4',
  MED: '#f5a623',
  HIGH: '#f5564a',
  CRITICAL: '#ff0044',
};

const SEVERITY_BG: Record<ThreatLevel, string> = {
  LOW: 'rgba(0,245,212,0.1)',
  MED: 'rgba(245,166,35,0.1)',
  HIGH: 'rgba(245,86,74,0.1)',
  CRITICAL: 'rgba(255,0,68,0.15)',
};

function fmt(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

const MyIPPanel: React.FC<MyIPPanelProps> = ({ myIP, myIPAlerts, onPin }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [pulse, setPulse] = useState(false);

  // Flash badge when a new event arrives
  useEffect(() => {
    if (myIPAlerts.length > prevCountRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      prevCountRef.current = myIPAlerts.length;
      return () => clearTimeout(t);
    }
    prevCountRef.current = myIPAlerts.length;
  }, [myIPAlerts.length]);

  const critCount = myIPAlerts.filter(a => a.severity === 'CRITICAL').length;
  const highCount = myIPAlerts.filter(a => a.severity === 'HIGH').length;

  return (
    <div className="cyber-card flex flex-col" style={{ minHeight: 260 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-[rgba(0,245,212,0.1)]">
        <div className="flex items-center gap-2">
          <span style={{ color: '#00f5d4', fontSize: 11, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            My IP Tracker
          </span>
          {myIP && (
            <span
              style={{
                fontSize: 10,
                fontFamily: 'monospace',
                color: '#050d1a',
                background: '#00f5d4',
                borderRadius: 3,
                padding: '1px 6px',
                fontWeight: 700,
                letterSpacing: '0.05em',
              }}
            >
              {myIP}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {myIPAlerts.length > 0 && (
            <span
              style={{
                fontSize: 10,
                fontFamily: 'monospace',
                color: pulse ? '#ff0044' : '#f5a623',
                background: pulse ? 'rgba(255,0,68,0.15)' : 'rgba(245,166,35,0.1)',
                border: `1px solid ${pulse ? '#ff0044' : '#f5a623'}`,
                borderRadius: 3,
                padding: '1px 6px',
                transition: 'all 0.3s',
              }}
            >
              {myIPAlerts.length} events
            </span>
          )}
          <button
            id="my-ip-pin-btn"
            onClick={() => onPin('my-ip')}
            title="Pin panel"
            style={{ color: 'rgba(0,245,212,0.4)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            📌
          </button>
        </div>
      </div>

      {/* No IP configured state */}
      {!myIP && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ padding: '24px 16px' }}>
          <div style={{ fontSize: 28 }}>🎯</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
            No IP configured
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
            Set your IP in the Config tab to start tracking
          </div>
        </div>
      )}

      {/* IP set but no events yet */}
      {myIP && myIPAlerts.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ padding: '24px 16px' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: '#00f5d4',
            boxShadow: '0 0 8px #00f5d4',
            animation: 'pulse 1.5s infinite',
          }} />
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(0,245,212,0.6)', textAlign: 'center' }}>
            Monitoring {myIP}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
            Waiting for interactions…
          </div>
        </div>
      )}

      {/* Events list */}
      {myIP && myIPAlerts.length > 0 && (
        <>
          {/* Summary badges */}
          <div className="flex gap-2 px-3 py-2">
            {critCount > 0 && (
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#ff0044', background: 'rgba(255,0,68,0.1)', border: '1px solid rgba(255,0,68,0.3)', borderRadius: 3, padding: '1px 6px' }}>
                {critCount} CRITICAL
              </span>
            )}
            {highCount > 0 && (
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#f5564a', background: 'rgba(245,86,74,0.1)', border: '1px solid rgba(245,86,74,0.3)', borderRadius: 3, padding: '1px 6px' }}>
                {highCount} HIGH
              </span>
            )}
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
              Total: {myIPAlerts.length}
            </span>
          </div>

          {/* Scrollable event list */}
          <div
            ref={listRef}
            style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}
          >
            {myIPAlerts.slice(0, 50).map((alert, i) => (
              <div
                key={alert.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '5px 6px',
                  marginBottom: 3,
                  borderRadius: 4,
                  background: i === 0 ? SEVERITY_BG[alert.severity] : 'rgba(255,255,255,0.02)',
                  border: i === 0 ? `1px solid ${SEVERITY_COLOR[alert.severity]}33` : '1px solid rgba(255,255,255,0.04)',
                  transition: 'background 0.3s',
                }}
              >
                {/* Severity dot */}
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: SEVERITY_COLOR[alert.severity],
                  boxShadow: i === 0 ? `0 0 6px ${SEVERITY_COLOR[alert.severity]}` : 'none',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'monospace', fontSize: 10,
                    color: i === 0 ? SEVERITY_COLOR[alert.severity] : 'rgba(255,255,255,0.7)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {alert.eventType}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                    Port {alert.targetPort} · {fmt(alert.timestamp)}
                  </div>
                </div>
                <span style={{
                  fontFamily: 'monospace', fontSize: 9,
                  color: SEVERITY_COLOR[alert.severity],
                  background: SEVERITY_BG[alert.severity],
                  border: `1px solid ${SEVERITY_COLOR[alert.severity]}44`,
                  borderRadius: 3, padding: '1px 4px', flexShrink: 0,
                }}>
                  {alert.severity}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default MyIPPanel;
