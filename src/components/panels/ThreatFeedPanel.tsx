import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Alert, ThreatLevel } from '../../types';
import PanelMenu from '../PanelMenu';

interface ThreatFeedPanelProps {
  alerts: Alert[];
  unreadAlertCount: number;
  addToBlocklist: (ip: string, reason: string, durationHours: number) => void;
  addToast: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  markAlertsRead: () => void;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const SEVERITY_BADGE: Record<ThreatLevel, { text: string; color: string; border: string; bg: string }> = {
  LOW:      { text: 'LOW',      color: 'var(--sev-low)', border: 'rgba(0,255,136,0.35)',  bg: 'rgba(0,255,136,0.08)'  },
  MED:      { text: 'MED',      color: 'var(--sev-med)', border: 'rgba(255,204,0,0.35)',  bg: 'rgba(255,204,0,0.08)'  },
  HIGH:     { text: 'HIGH',     color: 'var(--sev-high)', border: 'rgba(255,140,0,0.35)',  bg: 'rgba(255,140,0,0.08)'  },
  CRITICAL: { text: 'CRIT',     color: 'var(--sev-critical)', border: 'rgba(255,45,85,0.4)',   bg: 'rgba(255,45,85,0.12)'  },
};

const SEVERITY_ORDER: Record<ThreatLevel, number> = { LOW: 1, MED: 2, HIGH: 3, CRITICAL: 4 };
const FILTERS: Array<ThreatLevel | 'ALL'> = ['ALL', 'LOW', 'MED', 'HIGH', 'CRITICAL'];

/** Human-readable elapsed-time label */
function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 5_000)     return 'just now';
  if (diff < 60_000)    return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Mini bar chart of the severity distribution across the visible list */
function SeverityChart({ alerts }: { alerts: Alert[] }) {
  const counts: Record<ThreatLevel, number> = { LOW: 0, MED: 0, HIGH: 0, CRITICAL: 0 };
  alerts.forEach(a => { counts[a.severity]++; });
  const total = alerts.length || 1;
  const bars: Array<{ level: ThreatLevel; count: number; pct: number; color: string }> = [
    { level: 'CRITICAL', count: counts.CRITICAL, pct: (counts.CRITICAL / total) * 100, color: '#ff2d55' },
    { level: 'HIGH',     count: counts.HIGH,     pct: (counts.HIGH     / total) * 100, color: '#ff8c00' },
    { level: 'MED',      count: counts.MED,      pct: (counts.MED      / total) * 100, color: '#ffcc00' },
    { level: 'LOW',      count: counts.LOW,      pct: (counts.LOW      / total) * 100, color: '#00ff88' },
  ];
  return (
    <div className="flex items-end gap-1 h-8" title="Severity distribution of the current filter">
      {bars.map(b => (
        <div key={b.level} className="flex flex-col items-center gap-0.5" style={{ flex: 1 }}>
          <span className="font-mono text-[9px]" style={{ color: b.color }}>{b.count > 0 ? b.count : ''}</span>
          <div style={{
            width: '100%', background: 'var(--line-1)', borderRadius: 2, height: 20,
            display: 'flex', alignItems: 'flex-end', overflow: 'hidden',
          }}>
            <div style={{
              width: '100%', height: `${Math.max(2, b.pct)}%`,
              background: b.color,
              boxShadow: `0 0 4px ${b.color}60`,
              transition: 'height 0.5s ease',
            }} />
          </div>
          <span className="font-mono text-[8px] text-gray-600">{b.level.slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

/** Events-per-minute observed over a rolling 60-second window */
function useEpm(alerts: Alert[]) {
  const [epm, setEpm] = useState(0);
  useEffect(() => {
    const calc = () => {
      const since = Date.now() - 60_000;
      setEpm(alerts.filter(a => a.timestamp.getTime() > since).length);
    };
    calc();
    const id = setInterval(calc, 5_000);
    return () => clearInterval(id);
  }, [alerts]);
  return epm;
}

/** Tracks the newest alert so its row can flash once when it arrives */
function useNewAlertKey(alerts: Alert[]) {
  const prevTopId = useRef<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    const top = alerts[0]?.id ?? null;
    if (top && top !== prevTopId.current) {
      setFlashId(top);
      const id = setTimeout(() => setFlashId(null), 900);
      prevTopId.current = top;
      return () => clearTimeout(id);
    }
    prevTopId.current = top;
  }, [alerts]);
  return flashId;
}

const ThreatFeedPanel: React.FC<ThreatFeedPanelProps> = ({
  alerts, unreadAlertCount, addToBlocklist, addToast, markAlertsRead, onRefresh, onPin,
}) => {
  const [filter, setFilter] = useState<ThreatLevel | 'ALL'>('ALL');
  const [groupByIp, setGroupByIp] = useState(false);
  const [expandedIps, setExpandedIps] = useState<Set<string>>(new Set());
  const ticker = useState(0)[1];

  // Re-render periodically so "Xs ago" labels stay fresh even without new data.
  useEffect(() => {
    const id = setInterval(() => ticker(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, [ticker]);

  const epm = useEpm(alerts);
  const flashId = useNewAlertKey(alerts);

  const filtered = useMemo(
    () => (filter === 'ALL' ? alerts : alerts.filter(a => a.severity === filter)),
    [alerts, filter],
  );

  // Grouped-by-source view: IP -> rows, ordered by the worst severity present.
  const byIp = useMemo(() => {
    const map = new Map<string, Alert[]>();
    filtered.forEach(a => {
      const list = map.get(a.sourceIP) ?? [];
      list.push(a);
      map.set(a.sourceIP, list);
    });
    return [...map.entries()]
      .map(([ip, rows]) => ({
        ip,
        rows,
        maxSev: rows.reduce((m, r) => (SEVERITY_ORDER[r.severity] > SEVERITY_ORDER[m] ? r.severity : m), 'LOW' as ThreatLevel),
        latest: rows[0].timestamp,
      }))
      .sort((a, b) => SEVERITY_ORDER[b.maxSev] - SEVERITY_ORDER[a.maxSev]);
  }, [filtered]);

  const handleBlock = (alert: Alert) => {
    addToBlocklist(alert.sourceIP, `Auto-blocked: ${alert.eventType}`, 24);
    addToast(`Blocked ${alert.sourceIP} for 24h`, 'success');
  };

  const toggleIp = (ip: string) => {
    setExpandedIps(prev => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip); else next.add(ip);
      return next;
    });
  };

  const isLive = alerts.some(a => a.live);

  return (
    <div className="cyber-card p-4 flex flex-col gap-2 h-full">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Threat Feed</span>
          {unreadAlertCount > 0 && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: 'var(--sev-critical)', color: '#fff', boxShadow: '0 0 8px rgba(255,45,85,0.6)' }}>
              {unreadAlertCount}
            </span>
          )}
          {isLive && <span className="live-badge">LIVE</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="font-mono text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ border: '1px solid rgba(0,245,212,0.2)', color: 'rgba(0,245,212,0.7)' }}>
            <span>{epm}</span>
            <span className="text-gray-600">ev/min</span>
          </div>
          <PanelMenu panelId="threatfeed" title="Threat Feed" data={alerts.slice(0, 20)} onRefresh={onRefresh} onPin={onPin} />
        </div>
      </div>

      {/* Severity mini chart */}
      <SeverityChart alerts={filtered.slice(0, 200)} />

      {/* Controls row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => {
            const s = f !== 'ALL' ? SEVERITY_BADGE[f as ThreatLevel] : null;
            const isActive = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)}
                className="font-mono text-[9px] px-1.5 py-0.5 rounded border transition-all"
                style={{
                  color:       isActive ? (s ? s.color : 'var(--accent)') : 'var(--text-dim, var(--ink-3))',
                  borderColor: isActive ? (s ? s.border : 'rgba(0,245,212,0.4)') : 'var(--border-faint, var(--line-2))',
                  background:  isActive ? (s ? s.bg : 'rgba(0,245,212,0.06)') : 'transparent',
                }}>
                {f}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setGroupByIp(v => !v)}
            className="font-mono text-[9px] px-1.5 py-0.5 rounded border transition-all flex-shrink-0"
            style={{
              color:       groupByIp ? 'var(--accent)' : 'var(--text-dim, var(--ink-3))',
              borderColor: groupByIp ? 'rgba(0,245,212,0.4)' : 'var(--border-faint, var(--line-2))',
              background:  groupByIp ? 'rgba(0,245,212,0.06)' : 'transparent',
            }}>
            GROUP BY IP
          </button>
          <button onClick={markAlertsRead}
            className="font-mono text-[9px] text-gray-500 hover:text-[#00f5d4] transition-colors">
            Mark read
          </button>
        </div>
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto panel-scroll space-y-0.5 min-h-0">
        {groupByIp ? (
          byIp.length === 0 ? (
            <div className="text-center text-gray-600 font-mono text-xs py-6">No alerts</div>
          ) : byIp.map(({ ip, rows, maxSev, latest }) => {
            const s = SEVERITY_BADGE[maxSev];
            const expanded = expandedIps.has(ip);
            return (
              <div key={ip}>
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono hover:bg-[rgba(0,245,212,0.03)] transition-colors"
                  onClick={() => toggleIp(ip)}
                >
                  <span className="text-gray-500" style={{ fontSize: 8 }}>{expanded ? '▼' : '▶'}</span>
                  <span className="text-[9px] px-1 py-0.5 rounded border flex-shrink-0"
                    style={{ color: s.color, borderColor: s.border, background: s.bg }}>
                    {s.text}
                  </span>
                  <span className="text-[#00f5d4] flex-1 text-left">{ip}</span>
                  <span className="font-mono text-[9px] text-gray-500">{rows.length} events</span>
                  <span className="font-mono text-[9px] text-gray-600">{timeAgo(latest)}</span>
                </button>
                {expanded && (
                  <div className="ml-4 border-l border-[color:var(--accent-line)] pl-2 space-y-0.5 mb-1">
                    {rows.slice(0, 20).map(alert => {
                      const bs = SEVERITY_BADGE[alert.severity];
                      return (
                        <div key={alert.id}
                          className="flex items-center gap-2 px-1 py-1 rounded text-[10px] font-mono"
                          style={{
                            background: flashId === alert.id ? 'rgba(0,245,212,0.07)' : 'transparent',
                            transition: 'background 0.8s ease',
                          }}>
                          <span className="text-[9px] px-1 py-0.5 rounded border flex-shrink-0"
                            style={{ color: bs.color, borderColor: bs.border, background: bs.bg }}>
                            {bs.text}
                          </span>
                          <span className="text-gray-500 flex-shrink-0 text-[9px]">{timeAgo(alert.timestamp)}</span>
                          <span className="text-gray-300 flex-1 truncate">{alert.eventType}</span>
                          <span className="text-gray-600 flex-shrink-0">:{alert.targetPort}</span>
                        </div>
                      );
                    })}
                    {rows.length > 20 && (
                      <div className="text-gray-600 font-mono text-[9px] px-1 py-0.5">
                        +{rows.length - 20} older events
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          filtered.length === 0 ? (
            <div className="text-center text-gray-600 font-mono text-xs py-6">No alerts</div>
          ) : filtered.slice(0, 100).map(alert => {
            const s = SEVERITY_BADGE[alert.severity];
            const isNew = !alert.read;
            return (
              <div
                key={alert.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono transition-all"
                style={{
                  background:  flashId === alert.id ? 'rgba(0,245,212,0.09)' : isNew ? 'rgba(0,245,212,0.02)' : 'transparent',
                  borderLeft:  isNew ? '2px solid rgba(0,245,212,0.35)' : '2px solid transparent',
                  transition:  'background 0.8s ease',
                }}
              >
                <span className="text-[9px] px-1 py-0.5 rounded border flex-shrink-0"
                  style={{ color: s.color, borderColor: s.border, background: s.bg }}>
                  {s.text}
                </span>
                {alert.live && (
                  <span className="text-[9px] font-bold flex-shrink-0" style={{ color: 'var(--accent)' }}>●</span>
                )}
                <span className="text-gray-500 flex-shrink-0 text-[9px]">{timeAgo(alert.timestamp)}</span>
                <span className="text-gray-200 flex-1 truncate">{alert.eventType}</span>
                <span className="text-[#00f5d4] flex-shrink-0 text-[9px]">{alert.sourceIP}</span>
                <span className="text-gray-600 flex-shrink-0 text-[9px]">:{alert.targetPort}</span>
                <button onClick={() => handleBlock(alert)} title="Block this IP for 24 hours"
                  className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded border transition-colors"
                  style={{ color: 'var(--sev-critical)', borderColor: 'rgba(255,45,85,0.3)', background: 'transparent' }}>
                  BLK
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer count */}
      <div className="font-mono text-[9px] text-gray-600 border-t border-[color:var(--line-1)] pt-1 flex items-center justify-between">
        <span>{filtered.length} event{filtered.length !== 1 ? 's' : ''}{filtered.length > 100 && !groupByIp ? ' · showing 100' : ''}</span>
        <span style={{ color: 'rgba(0,245,212,0.4)' }}>// live threat stream</span>
      </div>
    </div>
  );
};

export default React.memo(ThreatFeedPanel);
