import React, { useEffect, useRef, useState } from 'react';
import type { DashboardState } from '../hooks/useDashboardState';
import type { StreamState } from '../hooks/useBackendData';
import { useAuth } from '../auth/AuthContext';

interface NavBarProps {
  activeTab: DashboardState['activeTab'];
  setActiveTab: DashboardState['setActiveTab'];
  unreadAlertCount: number;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  onSearchOpen: () => void;
  streamState: StreamState;
}

const TABS: Array<{ id: DashboardState['activeTab']; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬛' },
  { id: 'devices',   label: 'Devices',   icon: '◈' },
  { id: 'alerts',    label: 'Alerts',    icon: '⚠' },
  { id: 'scans',     label: 'Scans',     icon: '◎' },
  { id: 'config',    label: 'Config',    icon: '⚙' },
];

const STREAM_BADGE: Record<StreamState, { text: string; color: string; borderColor: string; bg: string }> = {
  idle:         { text: 'SIGNED OUT',  color: '#6b7280', borderColor: 'rgba(255,255,255,0.1)',  bg: 'transparent' },
  connecting:   { text: 'CONNECTING',  color: '#ffcc00', borderColor: 'rgba(255,204,0,0.3)',    bg: 'rgba(255,204,0,0.05)' },
  live:         { text: 'LIVE',        color: '#00ff88', borderColor: 'rgba(0,255,136,0.35)',   bg: 'rgba(0,255,136,0.06)' },
  reconnecting: { text: 'RECONNECTING',color: '#ffcc00', borderColor: 'rgba(255,204,0,0.3)',    bg: 'rgba(255,204,0,0.05)' },
};

function useClockTick() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useUptime() {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(elapsed / 3_600_000);
  const m = Math.floor((elapsed % 3_600_000) / 60_000);
  const s = Math.floor((elapsed % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const NavBar: React.FC<NavBarProps> = ({
  activeTab, setActiveTab, unreadAlertCount, darkMode, setDarkMode, onSearchOpen, streamState,
}) => {
  const { user, logout } = useAuth();
  const badge  = STREAM_BADGE[streamState];
  const now    = useClockTick();
  const uptime = useUptime();

  // Rendered in UTC to match the label. Showing local time under a "UTC" caption
  // would be factually wrong on any machine not set to UTC.
  const clock = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const hh = String(clock.getHours()).padStart(2, '0');
  const mm = String(clock.getMinutes()).padStart(2, '0');
  const ss = String(clock.getSeconds()).padStart(2, '0');

  const isLive = streamState === 'live';

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0 px-3 sm:px-4 flex-shrink-0"
      style={{
        background: 'linear-gradient(180deg, rgba(6,18,36,0.98) 0%, rgba(8,20,38,0.95) 100%)',
        borderBottom: '1px solid rgba(0,245,212,0.15)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.4), 0 0 40px rgba(0,245,212,0.04)',
        // min-height, not height: the tab strip wraps to a second row on narrow
        // viewports and a fixed height would clip it into the content below.
        minHeight: 48,
        position: 'relative',
        zIndex: 50,
      }}
    >
      {/* Subtle top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(0,245,212,0.5) 30%, rgba(0,245,212,0.5) 70%, transparent)',
        pointerEvents: 'none',
      }} />

      {/* ── LEFT: Logo + stream status + clock ── */}
      <div className="flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="font-mono font-bold text-base tracking-[0.2em]"
            style={{
              color: '#00f5d4',
              textShadow: '0 0 10px rgba(0,245,212,0.9), 0 0 24px rgba(0,245,212,0.4)',
              letterSpacing: '0.25em',
            }}
          >
            ⬡ CYBERNET
          </span>
          <span
            className="font-mono text-[10px] tracking-widest px-1.5 py-0.5 rounded"
            style={{ color: 'rgba(0,245,212,0.45)', border: '1px solid rgba(0,245,212,0.12)', background: 'rgba(0,245,212,0.04)' }}
          >
            v2
          </span>
        </div>

        {/* Connection status */}
        <div
          className="flex items-center gap-1.5 font-mono text-[10px] px-2 py-1 rounded"
          style={{
            color: badge.color,
            borderColor: badge.borderColor,
            background: badge.bg,
            border: `1px solid ${badge.borderColor}`,
            letterSpacing: '0.08em',
          }}
        >
          {isLive ? (
            <span
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#00ff88',
                boxShadow: '0 0 6px rgba(0,255,136,0.9)',
                display: 'inline-block',
                animation: 'live-pulse 1.2s var(--ease-in-out-soft) infinite',
                flexShrink: 0,
              }}
            />
          ) : (
            <span style={{ color: badge.color, fontSize: 8 }}>○</span>
          )}
          {badge.text}
        </div>

        {/* Real-time clock */}
        <div
          className="hidden sm:flex items-center gap-1 font-mono text-[11px]"
          style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}
        >
          <span style={{ color: '#00f5d4', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.08em' }}>
            {hh}:{mm}:{ss}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>UTC</span>
        </div>

        {/* Session timer, explicitly labelled so it is not mistaken for host uptime */}
        <div
          className="hidden lg:flex items-center gap-1.5 font-mono text-[10px]"
          style={{ color: 'rgba(255,255,255,0.25)' }}
          title="Time this dashboard has been open. Host uptime is shown in System Overview."
        >
          <span>SESSION</span>
          <span style={{ color: 'rgba(0,245,212,0.55)', fontVariantNumeric: 'tabular-nums' }}>{uptime}</span>
        </div>
      </div>

      {/* Tabs. Kept in normal flow rather than absolutely centred, so they cannot
          overlap the status cluster or controls on a narrow viewport. */}
      <div
        className="tab-scroll order-3 w-full lg:order-none lg:w-auto flex-1 lg:flex-none"
        style={{ justifyContent: 'center' }}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const isAlerts = tab.id === 'alerts';
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative font-mono text-[11px] uppercase tracking-widest px-3 h-12 flex items-center gap-1.5 transition-all duration-150"
              style={{
                color: isActive ? '#00f5d4' : 'rgba(255,255,255,0.35)',
                background: isActive ? 'rgba(0,245,212,0.05)' : 'transparent',
                borderBottom: isActive ? '2px solid #00f5d4' : '2px solid transparent',
                boxShadow: isActive ? '0 -2px 12px rgba(0,245,212,0.15) inset' : 'none',
              }}
            >
              <span style={{ fontSize: 10, opacity: 0.6 }}>{tab.icon}</span>
              {tab.label}
              {isAlerts && unreadAlertCount > 0 && (
                <span
                  className="absolute -top-0 right-0.5 flex items-center justify-center text-white font-bold"
                  style={{
                    background: '#ff2d55',
                    fontSize: 8,
                    minWidth: 14,
                    height: 14,
                    borderRadius: 7,
                    padding: '0 3px',
                    boxShadow: '0 0 8px rgba(255,45,85,0.7)',
                    animation: 'pulse-red 1s var(--ease-in-out-soft) infinite',
                  }}
                >
                  {unreadAlertCount > 99 ? '99+' : unreadAlertCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── RIGHT: User + controls ── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {user && (
          <div
            className="flex items-center gap-2 font-mono text-[10px] px-2 py-1 rounded"
            style={{
              color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(0,245,212,0.15)',
              background: 'rgba(0,245,212,0.04)',
            }}
          >
            {/* Avatar circle */}
            <div
              className="flex items-center justify-center text-[11px] font-bold flex-shrink-0"
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(0,245,212,0.3), rgba(0,245,212,0.1))',
                border: '1px solid rgba(0,245,212,0.4)',
                color: '#00f5d4',
              }}
            >
              {(user.email || user.displayName || 'U')[0].toUpperCase()}
            </div>
            <span
              className="max-w-[100px] truncate hidden md:inline"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              {user.email || user.displayName || 'User'}
            </span>
            <button
              onClick={logout}
              className="font-mono text-[10px] uppercase tracking-widest transition-colors hover:underline"
              style={{ color: 'rgba(255,45,85,0.7)', marginLeft: 2 }}
              title="Sign Out"
            >
              Exit
            </button>
          </div>
        )}

        <button
          onClick={onSearchOpen}
          className="font-mono text-[10px] flex items-center gap-1 transition-colors px-2 py-1 rounded"
          style={{
            color: 'rgba(255,255,255,0.35)',
            border: '1px solid rgba(0,245,212,0.15)',
            background: 'transparent',
          }}
          title="Global Search (Cmd+K)"
        >
          <span style={{ fontSize: 10 }}>⌕</span>
          <span>⌘K</span>
        </button>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className="font-mono text-[11px] transition-colors px-2 py-1 rounded"
          style={{
            color: 'rgba(255,255,255,0.35)',
            border: '1px solid rgba(0,245,212,0.15)',
            background: 'transparent',
          }}
          title="Toggle light/dark mode"
        >
          {darkMode ? '☀' : '🌙'}
        </button>
      </div>
    </nav>
  );
};

export default React.memo(NavBar);
