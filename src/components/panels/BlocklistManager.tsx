import React, { useState, useEffect } from 'react';
import type { BlocklistEntry } from '../../types';
import { isValidIP, formatIP } from '../../utils/ip';
import PanelMenu from '../PanelMenu';

interface BlocklistManagerProps {
  blocklist: BlocklistEntry[];
  addToBlocklist: (ip: string, reason: string, durationHours: number) => void;
  removeFromBlocklist: (ids: string[]) => void;
  addToast: (message: string, type: 'success' | 'warning' | 'error' | 'info', undoFn?: () => void) => void;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const DURATION_OPTIONS = [
  { label: '1 hour', value: 1 },
  { label: '6 hours', value: 6 },
  { label: '24 hours', value: 24 },
  { label: '7 days', value: 168 },
  { label: '30 days', value: 720 },
];

function formatCountdown(expiresAt: Date): string {
  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return 'EXPIRED';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const RULE_TABS = ['iptables', 'pfSense', 'Cloudflare'] as const;

function generateRule(tab: typeof RULE_TABS[number], ip: string, reason: string): string {
  if (tab === 'iptables') {
    return `iptables -A INPUT -s ${ip} -j DROP\niptables -A OUTPUT -d ${ip} -j DROP\niptables-save > /etc/iptables/rules.v4`;
  }
  if (tab === 'pfSense') {
    return `# pfSense Firewall Rule\n# Navigate to: Firewall > Rules > WAN\ntable <blocklist> persist\nblock in quick from <blocklist> to any\nblock out quick from any to <blocklist>\n# Add IP to table:\npfctl -t blocklist -T add ${ip}`;
  }
  return `# Cloudflare Firewall Rule (API)\ncurl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/firewall/rules" \\\n  -H "Authorization: Bearer API_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  --data '[{"filter":{"expression":"ip.src eq ${ip}"},"action":"block","description":"CYBERNET Block: ${reason}"}]'`;
}

const BlocklistManager: React.FC<BlocklistManagerProps> = ({
  blocklist, addToBlocklist, removeFromBlocklist, addToast, onRefresh, onPin,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState<BlocklistEntry | null>(null);
  const [ruleTab, setRuleTab] = useState<typeof RULE_TABS[number]>('iptables');
  const [addIp, setAddIp] = useState('');
  const [addReason, setAddReason] = useState('');
  const [addDuration, setAddDuration] = useState(24);
  const [addError, setAddError] = useState('');
  const [, setTick] = useState(0);

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === blocklist.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(blocklist.map(e => e.id)));
    }
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selected);
    const deleted = blocklist.filter(e => ids.includes(e.id));
    removeFromBlocklist(ids);
    setSelected(new Set());
    addToast(`Removed ${ids.length} entries`, 'success', () => {
      deleted.forEach(e => {
        addToBlocklist(e.ip, e.reason, Math.max(1, Math.ceil((e.expiresAt.getTime() - Date.now()) / 3600000)));
      });
    });
  };

  const handleAdd = () => {
    setAddError('');
    if (!isValidIP(addIp.trim())) { setAddError('Invalid IPv4 or IPv6 address'); return; }
    if (!addReason.trim()) { setAddError('Reason is required'); return; }
    addToBlocklist(addIp.trim(), addReason.trim(), addDuration);
    addToast(`Blocked ${addIp.trim()}`, 'success');
    setShowAddModal(false);
    setAddIp(''); setAddReason(''); setAddDuration(24);
  };

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">
          Blocklist Manager
          <span className="ml-2 text-gray-500">({blocklist.length})</span>
        </span>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="font-mono text-[10px] px-2 py-0.5 rounded border border-[rgba(255,45,85,0.3)] text-[#ff2d55] hover:bg-[rgba(255,45,85,0.08)] transition-colors"
            >
              Delete ({selected.size})
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="font-mono text-[10px] px-2 py-0.5 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)] transition-colors"
          >
            + Add IP
          </button>
          <PanelMenu panelId="blocklist" title="Blocklist" data={blocklist} onRefresh={onRefresh} onPin={onPin} />
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="text-gray-600 text-[10px] uppercase tracking-wider border-b border-[rgba(0,245,212,0.08)]">
              <th className="pb-1 text-left w-6">
                <input
                  type="checkbox"
                  checked={selected.size === blocklist.length && blocklist.length > 0}
                  onChange={toggleAll}
                  className="accent-[#00f5d4]"
                />
              </th>
              <th className="pb-1 text-left">IP</th>
              <th className="pb-1 text-left">Reason</th>
              <th className="pb-1 text-left">Added</th>
              <th className="pb-1 text-left">Expires</th>
              <th className="pb-1 text-left">Status</th>
              <th className="pb-1 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {blocklist.map(entry => {
              const expired = entry.status === 'expired';
              return (
                <tr
                  key={entry.id}
                  className={`border-b border-[rgba(0,245,212,0.04)] transition-colors hover:bg-[rgba(0,245,212,0.02)] ${expired ? 'opacity-40' : ''}`}
                >
                  <td className="py-1.5">
                    <input
                      type="checkbox"
                      checked={selected.has(entry.id)}
                      onChange={() => toggleSelect(entry.id)}
                      className="accent-[#00f5d4]"
                    />
                  </td>
                  <td className="py-1.5 text-[#00f5d4] break-all">{formatIP(entry.ip)}</td>
                  <td className="py-1.5 text-gray-400 max-w-[160px] truncate">{entry.reason}</td>
                  <td className="py-1.5 text-gray-600 text-[10px]">
                    {entry.addedAt.toLocaleDateString()}
                  </td>
                  <td className={`py-1.5 text-[10px] ${expired ? 'text-gray-600' : 'text-[#ffcc00]'}`}>
                    {formatCountdown(entry.expiresAt)}
                  </td>
                  <td className="py-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      expired
                        ? 'text-gray-600 border-[rgba(255,255,255,0.1)]'
                        : 'text-[#00ff88] border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.05)]'
                    }`}>
                      {expired ? 'EXPIRED' : 'ACTIVE'}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setShowRuleModal(entry)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-[rgba(0,245,212,0.2)] text-gray-400 hover:text-[#00f5d4] transition-colors"
                      >
                        Rule
                      </button>
                      <button
                        onClick={() => {
                          removeFromBlocklist([entry.id]);
                          addToast(`Removed ${entry.ip}`, 'info', () => {
                            addToBlocklist(entry.ip, entry.reason, Math.max(1, Math.ceil((entry.expiresAt.getTime() - Date.now()) / 3600000)));
                          });
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-[rgba(255,45,85,0.2)] text-gray-500 hover:text-[#ff2d55] transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {blocklist.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-600">No blocked IPs</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add IP Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-[rgba(5,13,26,0.85)] flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="cyber-card border border-[rgba(0,245,212,0.25)] rounded p-6 w-full max-w-sm animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Add IP to Blocklist</span>
              <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-gray-300">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="font-mono text-[10px] text-gray-500 uppercase">IP Address</label>
                <input
                  value={addIp}
                  onChange={e => { setAddIp(e.target.value); setAddError(''); }}
                  placeholder="e.g. 192.168.1.1"
                  className="w-full mt-1 bg-[rgba(0,0,0,0.3)] border border-[rgba(0,245,212,0.2)] font-mono text-xs text-gray-200 px-2 py-1.5 rounded outline-none focus:border-[rgba(0,245,212,0.5)]"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] text-gray-500 uppercase">Reason</label>
                <input
                  value={addReason}
                  onChange={e => setAddReason(e.target.value)}
                  placeholder="e.g. Brute force attempt"
                  className="w-full mt-1 bg-[rgba(0,0,0,0.3)] border border-[rgba(0,245,212,0.2)] font-mono text-xs text-gray-200 px-2 py-1.5 rounded outline-none focus:border-[rgba(0,245,212,0.5)]"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] text-gray-500 uppercase">Duration</label>
                <select
                  value={addDuration}
                  onChange={e => setAddDuration(Number(e.target.value))}
                  className="w-full mt-1 bg-[rgba(0,0,0,0.3)] border border-[rgba(0,245,212,0.2)] font-mono text-xs text-gray-200 px-2 py-1.5 rounded outline-none"
                >
                  {DURATION_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {addError && <div className="text-[#ff2d55] font-mono text-[10px]">{addError}</div>}
              <button
                onClick={handleAdd}
                className="w-full font-mono text-xs py-2 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)] transition-colors"
              >
                Add to Blocklist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Rule Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 bg-[rgba(5,13,26,0.85)] flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setShowRuleModal(null); }}>
          <div className="cyber-card border border-[rgba(0,245,212,0.25)] rounded p-6 w-full max-w-lg animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Generate Firewall Rule — {showRuleModal.ip}</span>
              <button onClick={() => setShowRuleModal(null)} className="text-gray-500 hover:text-gray-300">✕</button>
            </div>
            <div className="flex gap-1 mb-3">
              {RULE_TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setRuleTab(tab)}
                  className={`font-mono text-[10px] px-3 py-1 rounded border transition-colors ${
                    ruleTab === tab
                      ? 'border-[rgba(0,245,212,0.5)] text-[#00f5d4] bg-[rgba(0,245,212,0.08)]'
                      : 'border-[rgba(255,255,255,0.1)] text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <pre
              className="font-mono text-[11px] text-[#00ff41] bg-[rgba(0,0,0,0.5)] p-3 rounded overflow-x-auto whitespace-pre-wrap"
              style={{ textShadow: '0 0 4px rgba(0,255,65,0.3)' }}
            >
              {generateRule(ruleTab, showRuleModal.ip, showRuleModal.reason)}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(generateRule(ruleTab, showRuleModal.ip, showRuleModal.reason));
                addToast('Rule copied to clipboard', 'success');
              }}
              className="mt-3 w-full font-mono text-xs py-1.5 rounded border border-[rgba(0,245,212,0.2)] text-gray-400 hover:text-[#00f5d4] transition-colors"
            >
              ⎘ Copy Rule
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlocklistManager;
