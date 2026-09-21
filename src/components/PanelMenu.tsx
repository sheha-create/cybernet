import React, { useState, useRef, useEffect } from 'react';

interface PanelMenuProps {
  panelId: string;
  title: string;
  data?: unknown;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
  children?: React.ReactNode;
}

const PanelMenu: React.FC<PanelMenuProps> = ({ panelId, title, data, onRefresh, onPin, children }) => {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = () => {
    setOpen(false);
    const blob = new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${panelId}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-gray-500 hover:text-[#00f5d4] text-sm px-1 transition-colors"
        title="Panel options"
      >
        ···
      </button>

      {open && (
        <div className="absolute right-0 top-6 z-50 cyber-card border border-[rgba(0,245,212,0.2)] rounded min-w-[140px] py-1 animate-fade-in">
          <button
            onClick={() => { setExpanded(true); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:text-[#00f5d4] hover:bg-[rgba(0,245,212,0.05)] transition-colors"
          >
            ⤢ Expand
          </button>
          {onRefresh && (
            <button
              onClick={() => { onRefresh(); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:text-[#00f5d4] hover:bg-[rgba(0,245,212,0.05)] transition-colors"
            >
              ↺ Refresh
            </button>
          )}
          <button
            onClick={handleExport}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:text-[#00f5d4] hover:bg-[rgba(0,245,212,0.05)] transition-colors"
          >
            ↓ Export
          </button>
          {onPin && (
            <button
              onClick={() => { onPin(panelId); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:text-[#00f5d4] hover:bg-[rgba(0,245,212,0.05)] transition-colors"
            >
              ⊕ Pin to top
            </button>
          )}
        </div>
      )}

      {/* Fullscreen expand modal */}
      {expanded && (
        <div
          className="fixed inset-0 z-[100] bg-[rgba(5,13,26,0.95)] flex flex-col"
          onClick={e => { if (e.target === e.currentTarget) setExpanded(false); }}
        >
          <div className="flex items-center justify-between px-6 py-3 border-b border-[rgba(0,245,212,0.15)]">
            <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">{title} — EXPANDED</span>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-400 hover:text-[#ff2d55] font-mono text-lg"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

export default PanelMenu;
