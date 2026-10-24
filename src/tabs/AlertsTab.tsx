import React from 'react';
import type { DashboardState } from '../hooks/useDashboardState';
import ThreatFeedPanel from '../components/panels/ThreatFeedPanel';

interface AlertsTabProps {
  state: DashboardState;
}

const AlertsTab: React.FC<AlertsTabProps> = ({ state }) => {
  const { alerts, unreadAlertCount, addToBlocklist, addToast, markAlertsRead, pinPanel, refreshPanel } = state;

  return (
    <div className="h-full p-3 overflow-auto flex flex-col min-h-0">
      <ThreatFeedPanel
        alerts={alerts}
        unreadAlertCount={unreadAlertCount}
        addToBlocklist={addToBlocklist}
        addToast={addToast}
        markAlertsRead={markAlertsRead}
        onRefresh={() => refreshPanel('threatfeed')}
        onPin={pinPanel}
      />
    </div>
  );
};

export default AlertsTab;
