import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Alert, Device, BlocklistEntry } from '../types';

type TabId = 'dashboard' | 'devices' | 'alerts' | 'scans' | 'config';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  alerts: Alert[];
  devices: Device[];
  blocklist: BlocklistEntry[];
  onOpenTab?: (tab: TabId) => void;
  onSelectAlert?: (alert: Alert) => void;
  onSelectDevice?: (device: Device) => void;
  onSelectBlocklist?: (entry: BlocklistEntry) => void;
}

type ResultItem =
  | { kind: 'alert'; item: Alert }
  | { kind: 'device'; item: Device }
  | { kind: 'blocklist'; item: BlocklistEntry };

interface TabAction {
  label: string;
  icon: string;
  hint: string;
  tab: TabId;
}

const TAB_ACTIONS: TabAction[] = [
  { label: 'Dashboard', icon: '⬛', hint: 'System overview, live telemetry', tab: 'dashboard' },
  { label: 'Devices',   icon: '◈',   hint: 'Network interfaces observed on this host', tab: 'devices' },
  { label: 'Alerts',    icon: '⚠',   hint: 'Threat feed and detections', tab: 'alerts' },
  { label: 'Scans',     icon: '◎',   hint: 'Security scan findings and blocklist', tab: 'scans' },
  { label: 'Config',    icon: '⚙',   hint: 'Collector agent and preferences', tab: 'config' },
];

const KIND_LABELS: Record<ResultItem['kind'], string> = {
  alert: 'ALERTS',
  device: 'DEVICES',
  blocklist: 'BLOCKLIST',
};

const GlobalSearch: React.FC<GlobalSearchProps> = ({
  open, onClose, alerts, devices, blocklist, onOpenTab, onSelectAlert, onSelectDevice, onSelectBlocklist,
}) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // Keep the highlighted row visible while arrowing through the list.
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-result-index="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected, open]);

  const select = useCallback((result: ResultItem | null) => {
    onClose();
    if (!result) return;
    if (result.kind === 'alert') onSelectAlert?.(result.item);
    if (result.kind === 'device') onSelectDevice?.(result.item);
    if (result.kind === 'blocklist') onSelectBlocklist?.(result.item);
  }, [onClose, onSelectAlert, onSelectDevice, onSelectBlocklist]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, Math.max(results.length - 1, 0))); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0) select(results[Math.min(selected, results.length - 1)]);
      else onClose();
    }
  }, [results, selected, select, onClose]);

  if (!open) return null;

  const navigating = results.length === 0 && query.trim();

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-24"
      style={{ background: 'var(--backdrop, rgba(5,13,26,0.85))' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cyber-card border border-[color:var(--accent-line,var(--cyber-border))] rounded w-full max-w-xl mx-4 overflow-hidden animate-fade-in">
        {/* Input row */}
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--accent-line, rgba(0,245,212,0.1))' }}>
          <span className="text-[#00f5d4] text-sm">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search alerts, devices, blocklist…"
            className="flex-1 bg-transparent font-mono text-sm text-gray-200 placeholder-gray-600 outline-none"
            aria-label="Search alerts, devices, blocklist"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="global-search-results"
          />
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 font-mono text-xs" title="Close (Esc)">ESC</button>
        </div>

        <div ref={listRef} id="global-search-results" role="listbox" className="max-h-80 overflow-y-auto">
          {/* Quick tab navigation when no query is typed — the command-palette row */}
          {!query.trim() && (
            <div>
              <div className="px-4 py-1 text-[10px] font-mono uppercase tracking-widest text-gray-600 bg-black/20">
                Jump to
              </div>
              {TAB_ACTIONS.map(action => (
                <button
                  key={action.tab}
                  onClick={() => { onOpenTab?.(action.tab); onClose(); }}
                  className="w-full text-left px-4 py-2 font-mono text-xs flex items-center gap-3 text-gray-300 hover:bg-black/10 transition-colors"
                >
                  <span className="text-[#00f5d4]">{action.icon}</span>
                  <span>{action.label}</span>
                  <span className="text-gray-600 ml-auto text-[10px] truncate max-w-[240px]">{action.hint}</span>
                </button>
              ))}
            </div>
          )}

          {/* Grouped results */}
          {results.length > 0 && (['alert', 'device', 'blocklist'] as const).map(kind => {
            const group = results.filter(r => r.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <div className="px-4 py-1 text-[10px] font-mono uppercase tracking-widest text-gray-600 bg-black/20">
                  {KIND_LABELS[kind]}
                </div>
                {group.map(r => {
                  const globalIdx = results.indexOf(r);
                  const isSelected = globalIdx === selected;
                  return (
                    <button
                      key={r.kind === 'alert' ? r.item.id : r.kind === 'device' ? r.item.id : r.item.id}
                      data-result-index={globalIdx}
                      onClick={() => select(r)}
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

          {navigating && (
            <div className="px-4 py-6 text-center font-mono text-xs text-gray-600">
              No results for "{query}"
            </div>
          )}
        </div>

        {/* Keyboard hints */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[color:var(--accent-line)] font-mono text-[10px] text-gray-600">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
