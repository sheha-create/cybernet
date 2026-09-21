import React, { useState, useEffect } from 'react';
import type { DashboardState } from '../hooks/useDashboardState';

interface NavBarProps {
  activeTab: DashboardState['activeTab'];
  setActiveTab: DashboardState['setActiveTab'];
  unreadAlertCount: number;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  anomalyActive: boolean;
  onSearchOpen: () => void;
}

const TABS: Array<{ id: DashboardState['activeTab']; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'devices', label: 'Devices' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'scans', label: 'Scans' },
  { id: 'config', label: 'Config' },
];

const NavBar: React.FC<NavBarProps> = ({
  activeTab, setActiveTab, unreadAlertCount, darkMode, setDarkMode, anomalyActive, onSearchOpen,
}) => {
  const [status, setStatus] = useState<'ONLINE' | 'ANOMALY'>('ONLINE');

  useEffect(() => {
    setStatus(anomalyActive ? 'ANOMALY' : 'ONLINE');
    const id = setInterval(() => {
      setStatus(anomalyActive ? 'ANOMALY' : 'ONLINE');
    }, 10000);
    return () => clearInterval(id);
  }, [anomalyActive]);

  return (
    <nav className="cyber-card flex items-center justify-between px-4 py-2 border-b border-[rgba(0,245,212,0.15)] flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <span
          className="font-mono font-bold text-lg tracking-widest"
          style={{ color: '#00f5d4', textShadow: '0 0 12px rgba(0,245,212,0.8), 0 0 24px rgba(0,245,212,0.4)' }}
        >
          ⬡ CYBERNET
        </span>
        <span
          className={`text-xs font-mono px-2 py-0.5 rounded border ${
            status === 'ANOMALY'
              ? 'text-[#ff2d55] border-[rgba(255,45,85,0.4)] bg-[rgba(255,45,85,0.1)] animate-pulse-red'
              : 'text-[#00ff88] border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.05)]'
          }`}
        >
          ● {status}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative font-mono text-xs uppercase tracking-widest px-3 py-2 transition-colors ${
              activeTab === tab.id
                ? 'text-[#00f5d4]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
            {tab.id === 'alerts' && unreadAlertCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-[#ff2d55] text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {unreadAlertCount > 99 ? '99+' : unreadAlertCount}
              </span>
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00f5d4]" style={{ boxShadow: '0 0 6px rgba(0,245,212,0.8)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSearchOpen}
          className="font-mono text-xs text-gray-400 hover:text-[#00f5d4] border border-[rgba(0,245,212,0.2)] px-2 py-1 rounded transition-colors flex items-center gap-1"
          title="Search (Cmd+K)"
        >
          <span>⌘K</span>
        </button>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="font-mono text-xs text-gray-400 hover:text-[#00f5d4] border border-[rgba(0,245,212,0.2)] px-2 py-1 rounded transition-colors"
          title="Toggle dark/light mode"
        >
          {darkMode ? '☀' : '🌙'}
        </button>
      </div>
    </nav>
  );
};

export default React.memo(NavBar);
