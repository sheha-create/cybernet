import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePanelPins } from './PanelPinsContext';

interface PanelMenuProps {
  panelId: string;
  title: string;
  data?: unknown;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

/**
 * Per-panel option menu.
 *
 * "Expand" moves the panel's real DOM node into a fullscreen modal and moves it
 * back on close. Because the node is moved — not re-rendered — anything already
 * running inside (charts, SSE-fed state, map tiles) keeps its React state and
 * never loses data during the round trip.
 */
const PanelMenu: React.FC<PanelMenuProps> = ({ panelId, title, data, onRefresh, onPin }) => {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const { isPinned, pinPanel: pinFromContext } = usePanelPins();
  const pinned = onPin ? isPinned(panelId) : false;
  // Where the panel card lived before expansion, so it can be put back exactly.
  const homeRef = useRef<{ parent: Node; next: Node | null } | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [expanded]);

  const restoreCard = () => {
    const home = homeRef.current;
    const card = modalBodyRef.current?.firstElementChild;
    homeRef.current = null;
    if (home && card) {
      const insertBefore = home.next && home.next.parentElement === home.parent ? home.next : null;
      try {
        home.parent.insertBefore(card, insertBefore);
      } catch {
        home.parent.appendChild(card);
      }
      card.classList.remove('panel-expanded');
    }
  };

  // Move the real panel node into the modal (and back) as raw DOM. Layout
  // effects run before paint and before React's deletion pass removes nodes,
  // so restoring here stays consistent even if the tab changes mid-expansion.
  useLayoutEffect(() => {
    if (expanded) {
      const card = menuRef.current?.closest('.cyber-card');
      const body = modalBodyRef.current;
      if (card instanceof HTMLElement && body && card.parentElement !== body) {
        homeRef.current = { parent: card.parentElement!, next: card.nextSibling };
        card.classList.add('panel-expanded');
        body.appendChild(card);
        // Leaflet/ResponsiveContainer SizeObservers need a resize nudge after a
        // container swap.
        window.dispatchEvent(new Event('resize'));
      }
    } else if (homeRef.current) {
      restoreCard();
      window.dispatchEvent(new Event('resize'));
    }
  }, [expanded]);

  // Restore on unmount (tab switch, etc.) so React never tries to remove a
  // node that has been relocated.
  useLayoutEffect(() => () => {
    if (homeRef.current) restoreCard();
  }, []);

  const handleExport = () => {
    setOpen(false);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const blob = new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${panelId}-export-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const itemClass = 'w-full text-left px-3 py-1.5 text-xs font-mono text-gray-300 hover:text-[#00f5d4] hover:bg-[rgba(0,245,212,0.05)] transition-colors';

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-gray-500 hover:text-[#00f5d4] text-sm px-1 transition-colors"
        title="Panel options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ···
      </button>

      {open && (
        <div
          className="absolute right-0 top-6 z-50 cyber-card border border-[rgba(0,245,212,0.2)] rounded min-w-[150px] py-1 animate-fade-in"
          role="menu"
        >
          <button onClick={() => { setExpanded(true); setOpen(false); }} className={itemClass} role="menuitem">
            ⤢ Expand
          </button>
          {onRefresh && (
            <button onClick={() => { onRefresh(); setOpen(false); }} className={itemClass} role="menuitem">
              ↺ Refresh
            </button>
          )}
          <button onClick={handleExport} className={itemClass} role="menuitem">
            ↓ Export
          </button>
          {onPin && (
            <button
              onClick={() => { if (!expanded) pinFromContext(panelId); setOpen(false); }}
              className={`${itemClass}${expanded ? ' opacity-40 pointer-events-none' : ''}`}
              role="menuitem"
              title={expanded ? 'Collapse first — the panel is displayed in the expanded view' : undefined}
            >
              {pinned ? '⊖ Unpin' : '⊕ Pin to top'}
            </button>
          )}
        </div>
      )}

      {/* Fullscreen expand modal, portaled so the panel node can be moved into
          it without the ancestor/descendant appendChild problem. */}
      {expanded && createPortal(
        <div
          className="fixed inset-0 z-[100] flex flex-col"
          style={{ background: 'var(--backdrop, rgba(5,13,26,0.95))' }}
          role="dialog"
          aria-label={`${title} expanded`}
        >
          <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: 'var(--accent-line, rgba(0,245,212,0.15))' }}>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">{title}</span>
              <span className="font-mono text-[10px] text-gray-600 uppercase tracking-widest">Expanded</span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-400 hover:text-[#ff2d55] font-mono text-lg"
              title="Collapse (Esc)"
            >
              ✕
            </button>
          </div>
          <div ref={modalBodyRef} className="flex-1 overflow-auto p-4 sm:p-6 flex justify-center" />
        </div>,
        document.body,
      )}
    </div>
  );
};

export default PanelMenu;
