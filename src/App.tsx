import { useState, useEffect, useCallback } from 'react';
import { useDashboardState } from './hooks/useDashboardState';
import NavBar from './components/NavBar';
import GlobalSearch from './components/GlobalSearch';
import ToastManager from './components/ToastManager';
import CriticalFlash from './components/CriticalFlash';
import LiveStatusBar from './components/panels/LiveStatusBar';
import DashboardTab from './tabs/DashboardTab';
import DevicesTab from './tabs/DevicesTab';
import AlertsTab from './tabs/AlertsTab';
import ScansTab from './tabs/ScansTab';
import ConfigTab from './tabs/ConfigTab';
import RequireAuth from './auth/RequireAuth.tsx';


function App() {
  const state = useDashboardState();
  const [searchOpen, setSearchOpen] = useState(false);





  const {
    activeTab, setActiveTab,
    anomalyActive, darkMode,
    toasts, removeToast,
    criticalFlash,
    alerts, devices, blocklist,
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
          streamState={state.streamState}
          onSearchOpen={() => setSearchOpen(true)}
        />

        <LiveStatusBar
          streamState={state.streamState}
          backendOnline={state.backendOnline}
          lastFrameAt={state.lastFrameAt}
          alertCount={state.alerts.length}
          criticalCount={alerts.filter(alert => alert.severity === 'CRITICAL').length}
        />

        {/* min-h-0 is required: a flex item defaults to min-height:auto, which would stop
            main from shrinking and let tall dashboards overflow the viewport
            instead of scrolling inside their own tab. */}
        <main className="flex-1 min-h-0 overflow-hidden dot-grid">
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


        <CriticalFlash active={criticalFlash} />
      </div>
    </RequireAuth>
  );
}

export default App;

