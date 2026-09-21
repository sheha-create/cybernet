import React, { useState } from 'react';
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

const SEVERITY_BADGE: Record<ThreatLevel, string> = {
  LOW: 'text-[#00ff88] bg-[rgba(0,255,136,0.1)] border-[rgba(0,255,136,0.3)]',
  MED: 'text-[#ffcc00] bg-[rgba(255,204,0,0.1)] border-[rgba(255,204,0,0.3)]',
  HIGH: 'text-orange-400 bg-[rgba(255,100,0,0.1)] border-[rgba(255,100,0,0.3)]',
  CRITICAL: 'text-[#ff2d55] bg-[rgba(255,45,85,0.1)] border-[rgba(255,45,85,0.3)]',
};

const FILTERS: Array<ThreatLevel | 'ALL'> = ['ALL', 'LOW', 'MED', 'HIGH', 'CRITICAL'];

const ThreatFeedPanel: React.FC<ThreatFeedPanelProps> = ({
  alerts, unreadAlertCount, addToBlocklist, addToast, markAlertsRead, onRefresh, onPin,
}) => {
  const [filter, setFilter] = useState<ThreatLevel | 'ALL'>('ALL');

  const filtered = filter === 'ALL' ? alerts : alerts.filter(a => a.severity === filter);

  const handleBlock = (alert: Alert) => {
    addToBlocklist(alert.sourceIP, `Auto-blocked: ${alert.eventType}`, 24);
    addToast(`Blocked ${alert.sourceIP} for 24h`, 'success');
  };

  const formatTime = (d: Date) => {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Threat Feed</span>
          {unreadAlertCount > 0 && (
            <span className="bg-[#ff2d55] text-white text-[9px] rounded-full px-1.5 py-0.5 font-bold">
              {unreadAlertCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={markAlertsRead}
            className="font-mono text-[10px] text-gray-500 hover:text-[#00f5d4] transition-colors"
          >
            Mark all read
          </button>
          <PanelMenu panelId="threatfeed" title="Threat Feed" data={alerts.slice(0, 20)} onRefresh={onRefresh} onPin={onPin} />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-[10px] px-2 py-0.5 rounded border transition-colors ${
              filter === f
                ? f === 'ALL' ? 'border-[rgba(0,245,212,0.5)] text-[#00f5d4] bg-[rgba(0,245,212,0.1)]'
                  : f === 'LOW' ? 'border-[rgba(0,255,136,0.5)] text-[#00ff88] bg-[rgba(0,255,136,0.1)]'
                  : f === 'MED' ? 'border-[rgba(255,204,0,0.5)] text-[#ffcc00] bg-[rgba(255,204,0,0.1)]'
                  : f === 'HIGH' ? 'border-[rgba(255,100,0,0.5)] text-orange-400 bg-[rgba(255,100,0,0.1)]'
                  : 'border-[rgba(255,45,85,0.5)] text-[#ff2d55] bg-[rgba(255,45,85,0.1)]'
                : 'border-[rgba(255,255,255,0.1)] text-gray-500 hover:text-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {filtered.slice(0, 100).map(alert => (
          <div
            key={alert.id}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono transition-colors ${
              !alert.read ? 'bg-[rgba(0,245,212,0.03)] border-l-2 border-[rgba(0,245,212,0.3)]' : 'border-l-2 border-transparent'
            }`}
          >
            <span className={`flex-shrink-0 text-[9px] px-1 py-0.5 rounded border ${SEVERITY_BADGE[alert.severity]}`}>
              {alert.severity}
            </span>
            {alert.live && (
              <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded border border-[#00f5d4] text-[#00f5d4] bg-[rgba(0,245,212,0.1)]">
                LIVE
              </span>
            )}
            <span className="text-gray-500 flex-shrink-0 text-[10px]">{formatTime(alert.timestamp)}</span>
            <span className="text-gray-200 flex-1 truncate">{alert.eventType}</span>
            <span className="text-[#00f5d4] flex-shrink-0 text-[10px]">{alert.sourceIP}</span>
            <span className="text-gray-600 flex-shrink-0 text-[10px]">:{alert.targetPort}</span>
            <button
              onClick={() => handleBlock(alert)}
              className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded border border-[rgba(255,45,85,0.3)] text-[#ff2d55] hover:bg-[rgba(255,45,85,0.1)] transition-colors"
            >
              Block
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-gray-600 font-mono text-xs py-8">No alerts</div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ThreatFeedPanel);
