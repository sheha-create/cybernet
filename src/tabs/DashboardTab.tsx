import React from 'react';
import type { DashboardState } from '../hooks/useDashboardState';
import OverviewPanel from '../components/panels/OverviewPanel';
import DonutChartPanel from '../components/panels/DonutChartPanel';
import SystemStatusBar from '../components/panels/SystemStatusBar';
import TrafficChartPanel from '../components/panels/TrafficChartPanel';
import TerminalPanel from '../components/panels/TerminalPanel';
import GeoMapPanel from '../components/panels/GeoMapPanel';
import HeatmapPanel from '../components/panels/HeatmapPanel';
import IPLookupPanel from '../components/panels/IPLookupPanel';
import MyIPPanel from '../components/panels/MyIPPanel';

interface DashboardTabProps {
  state: DashboardState;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ state }) => {
  const {
    systemHealth, threatLevel, nodeCount,
    devices, donutFilter, setDonutFilter,
    trafficData, heatmapData,
    cpuUsage, memoryUsage, storageUsage,
    alerts, addToBlocklist, addToast,
    myIP, myIPAlerts,
    pinPanel, refreshPanel,
    loadThreatDataForIP,
    getTerminalLine,
    visitStats,
    visitRecords,
  } = state;

  return (
    <div className="flex flex-col gap-3 h-full overflow-auto p-3">
      {/* Top row */}
      <div className="grid grid-cols-3 gap-3" style={{ minHeight: 180 }}>
        <OverviewPanel
          systemHealth={systemHealth}
          nodeCount={nodeCount}
          threatLevel={threatLevel}
          totalVisits={visitStats.totalVisits}
          uniqueIps={visitStats.uniqueIps}
          flaggedCount={visitStats.flaggedCount}
          topCountries={visitStats.topCountries}
          onRefresh={() => refreshPanel('overview')}
          onPin={pinPanel}
        />
        <DonutChartPanel
          devices={devices}
          donutFilter={donutFilter}
          setDonutFilter={setDonutFilter}
          onRefresh={() => refreshPanel('donut')}
          onPin={pinPanel}
        />
        <SystemStatusBar
          cpuUsage={cpuUsage}
          memoryUsage={memoryUsage}
          storageUsage={storageUsage}
          nodeCount={nodeCount}
          threatLevel={threatLevel}
        />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-2 gap-3" style={{ minHeight: 220 }}>
        <TrafficChartPanel
          trafficData={trafficData}
          onRefresh={() => refreshPanel('traffic')}
          onPin={pinPanel}
        />
        <TerminalPanel
          getTerminalLine={getTerminalLine}
          onPin={pinPanel}
        />
      </div>

      {/* Bottom row */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)', minHeight: 260 }}>
        <GeoMapPanel
          alerts={alerts}
          visits={visitRecords}
          addToBlocklist={addToBlocklist}
          addToast={addToast}
          onPin={pinPanel}
        />
        <HeatmapPanel
          heatmapData={heatmapData}
          onRefresh={() => refreshPanel('heatmap')}
          onPin={pinPanel}
        />
        <IPLookupPanel
          onPin={pinPanel}
          onIPTracked={loadThreatDataForIP}
        />
        <MyIPPanel
          myIP={myIP}
          myIPAlerts={myIPAlerts}
          onPin={pinPanel}
        />
      </div>
    </div>
  );
};

export default DashboardTab;
