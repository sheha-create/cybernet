import React, { useState, useEffect, useCallback } from 'react';
import { useDashboardState } from './hooks/useDashboardState';
import NavBar from './components/NavBar';
import GlobalSearch from './components/GlobalSearch';
import ToastManager from './components/ToastManager';
import AIAdvisor from './components/AIAdvisor';
import CriticalFlash from './components/CriticalFlash';
import DashboardTab from './tabs/DashboardTab';
import DevicesTab from './tabs/DevicesTab';
import AlertsTab from './tabs/AlertsTab';
import ScansTab from './tabs/ScansTab';
import ConfigTab from './tabs/ConfigTab';
import RequireAuth from './auth/RequireAuth';


function App() {
  const state = useDashboardState();
  const [searchOpen, setSearchOpen] = useState(false);





  const {
    activeTab, setActiveTab,
    anomalyActive, darkMode,
    toasts, removeToast,
    criticalFlash,
    alerts, devices, blocklist,
    systemHealth, threatLevel,
  } = state;

  // Cmd+K / Ctrl+K global shortcut
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen(v => !v);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Apply light-mode class to root
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.remove('light-mode');
    } else {
      root.classList.add('light-mode');
    }
  }, [darkMode]);

  const rootClasses = [
    'h-full flex flex-col font-mono',
    anomalyActive ? 'anomaly-active' : '',
  ].filter(Boolean).join(' ');

  return (
    <RequireAuth>
      <div className={rootClasses} style={{ background: 'var(--cyber-bg, #050d1a)' }}>
      <NavBar
        activeTab={activeTab}

        setActiveTab={setActiveTab}
        unreadAlertCount={state.unreadAlertCount}
        darkMode={darkMode}
        setDarkMode={state.setDarkMode}
        anomalyActive={anomalyActive}
        onSearchOpen={() => setSearchOpen(true)}
      />

      {/* Main content */}
      <main className="flex-1 overflow-hidden dot-grid">
        {activeTab === 'dashboard' && <DashboardTab state={state} />}
        {activeTab === 'devices' && <DevicesTab state={state} />}
        {activeTab === 'alerts' && <AlertsTab state={state} />}
        {activeTab === 'scans' && <ScansTab state={state} />}
        {activeTab === 'config' && <ConfigTab state={state} />}
      </main>

      {/* Global overlays */}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        alerts={alerts}
        devices={devices}
        blocklist={blocklist}
      />

      <ToastManager toasts={toasts} removeToast={removeToast} />

      <AIAdvisor
        systemHealth={systemHealth}
        threatLevel={threatLevel}
        anomalyActive={anomalyActive}
        alerts={alerts}
        blocklist={blocklist}
      />

      <CriticalFlash active={criticalFlash} />
      </div>
    </RequireAuth>
  );
}

export default App;

