import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Alert, Device, BlocklistEntry } from '../types';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  alerts: Alert[];
  devices: Device[];
  blocklist: BlocklistEntry[];
  onSelectAlert?: (alert: Alert) => void;
  onSelectDevice?: (device: Device) => void;
}

type ResultItem =
  | { kind: 'alert'; item: Alert }
  | { kind: 'device'; item: Device }
  | { kind: 'blocklist'; item: BlocklistEntry };

const GlobalSearch: React.FC<GlobalSearchProps> = ({
  open, onClose, alerts, devices, blocklist,
}) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!open) return; // handled by parent
      }
      if (!open) return;
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const results: ResultItem[] = React.useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const res: ResultItem[] = [];
    alerts.slice(0, 50).forEach(a => {
      if (a.sourceIP.includes(q) || a.eventType.toLowerCase().includes(q)) {
        res.push({ kind: 'alert', item: a });
      }
    });
    devices.forEach(d => {
      if (d.ip.includes(q) || d.name.toLowerCase().includes(q)) {
        res.push({ kind: 'device', item: d });
      }
    });
    blocklist.forEach(b => {
      if (b.ip.includes(q) || b.reason.toLowerCase().includes(q)) {
        res.push({ kind: 'blocklist', item: b });
      }
    });
    return res.slice(0, 20);
  }, [query, alerts, devices, blocklist]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') { onClose(); }
  }, [results.length, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-[rgba(5,13,26,0.85)] flex items-start justify-center pt-24"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cyber-card border border-[rgba(0,245,212,0.25)] rounded w-full max-w-xl mx-4 overflow-hidden animate-fade-in">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(0,245,212,0.1)]">
          <span className="text-[#00f5d4] text-sm">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search alerts, devices, blocklist..."
            className="flex-1 bg-transparent font-mono text-sm text-gray-200 placeholder-gray-600 outline-none"
          />
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 font-mono text-xs">ESC</button>
        </div>

        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            {/* Group by kind */}
            {(['alert', 'device', 'blocklist'] as const).map(kind => {
              const group = results.filter(r => r.kind === kind);
              if (group.length === 0) return null;
              const labels: Record<string, string> = { alert: 'ALERTS', device: 'DEVICES', blocklist: 'BLOCKLIST' };
              return (
                <div key={kind}>
                  <div className="px-4 py-1 text-[10px] font-mono uppercase tracking-widest text-gray-600 bg-[rgba(0,0,0,0.2)]">
                    {labels[kind]}
                  </div>
                  {group.map(r => {
                    const globalIdx = results.indexOf(r);
                    const isSelected = globalIdx === selected;
                    return (
                      <button
                        key={r.kind === 'alert' ? r.item.id : r.kind === 'device' ? r.item.id : r.item.id}
                        onClick={onClose}
                        className={`w-full text-left px-4 py-2 font-mono text-xs flex items-center gap-3 transition-colors ${
                          isSelected ? 'bg-[rgba(0,245,212,0.08)] text-[#00f5d4]' : 'text-gray-300 hover:bg-[rgba(0,245,212,0.04)]'
                        }`}
                      >
                        {r.kind === 'alert' && (
                          <>
                            <span className={`text-[10px] px-1 rounded ${
                              r.item.severity === 'CRITICAL' ? 'bg-[rgba(255,45,85,0.2)] text-[#ff2d55]' :
                              r.item.severity === 'HIGH' ? 'bg-[rgba(255,100,0,0.2)] text-orange-400' :
                              r.item.severity === 'MED' ? 'bg-[rgba(255,204,0,0.2)] text-[#ffcc00]' :
                              'bg-[rgba(0,255,136,0.1)] text-[#00ff88]'
                            }`}>{r.item.severity}</span>
                            <span>{r.item.eventType}</span>
                            <span className="text-gray-500 ml-auto">{r.item.sourceIP}</span>
                          </>
                        )}
                        {r.kind === 'device' && (
                          <>
                            <span className="text-[#00f5d4]">⬡</span>
                            <span>{r.item.name}</span>
                            <span className="text-gray-500 ml-auto">{r.item.ip}</span>
                          </>
                        )}
                        {r.kind === 'blocklist' && (
                          <>
                            <span className="text-[#ff2d55]">⊘</span>
                            <span>{r.item.ip}</span>
                            <span className="text-gray-500 ml-auto truncate max-w-[120px]">{r.item.reason}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {query && results.length === 0 && (
          <div className="px-4 py-6 text-center font-mono text-xs text-gray-600">
            No results for "{query}"
          </div>
        )}

        {!query && (
          <div className="px-4 py-4 text-center font-mono text-xs text-gray-600">
            Search alerts by IP or type · devices by hostname · blocklist by IP
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalSearch;
