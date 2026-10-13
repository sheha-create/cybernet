import React from 'react';
import type { DashboardState } from '../hooks/useDashboardState';
import OverviewPanel from '../components/panels/OverviewPanel';
import DonutChartPanel from '../components/panels/DonutChartPanel';
import SystemStatusBar from '../components/panels/SystemStatusBar';
import CoreMapPanel from '../components/panels/CoreMapPanel';
import TrafficChartPanel from '../components/panels/TrafficChartPanel';
import TerminalPanel from '../components/panels/TerminalPanel';
import GeoMapPanel from '../components/panels/GeoMapPanel';
import HeatmapPanel from '../components/panels/HeatmapPanel';
import IPLookupPanel from '../components/panels/IPLookupPanel';

interface DashboardTabProps {
  state: DashboardState;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ state }) => {
  const {
    systemHealth, threatLevel, nodeCount,
    devices, donutFilter, setDonutFilter,
    trafficData, heatmapData,
    telemetry,
    alerts,
    pinPanel, refreshPanel,
    visitStats,
    userIp,
    hostname,
    backendOnline,
  } = state;

  return (
    <div className="flex flex-col gap-3 h-full overflow-auto p-3">
      {/* Top row: collapses 3 -> 2 -> 1 as the viewport narrows */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 min-h-[260px]">
        <OverviewPanel
          systemHealth={systemHealth}
          nodeCount={nodeCount}
          threatLevel={threatLevel}
          totalVisits={visitStats.totalVisits}
          uniqueIps={visitStats.uniqueIps}
          flaggedCount={visitStats.flaggedCount}
          topSources={visitStats.topSources}
          userIp={userIp}
          hostname={hostname}
          backendOnline={backendOnline}
          observedAt={telemetry.observedAt}
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
          cpuUsage={telemetry.cpuUsage}
          memoryUsage={telemetry.memoryUsage}
          storageUsage={telemetry.storageUsage ?? 0}
          nodeCount={nodeCount}
          threatLevel={threatLevel}
        />
      </div>

      {/* Middle row */}
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 h-[340px] xl:h-[400px]">
        <CoreMapPanel
          cpuModel={telemetry.cpuModel}
          perCore={telemetry.cpuCores}
          source={telemetry.source}
          hostname={telemetry.hostname}
          onPin={pinPanel}
        />
        <TerminalPanel alerts={alerts} streamState={state.streamState} onPin={pinPanel} />
      </div>

      {/* Traffic row */}
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 h-[340px] xl:h-[400px]">
        <TrafficChartPanel
          trafficData={trafficData}
          onRefresh={() => refreshPanel('traffic')}
          onPin={pinPanel}
        />
        <GeoMapPanel onPin={pinPanel} />
      </div>

      {/* Bottom row */}
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 h-[340px] xl:h-[400px]">
        <HeatmapPanel
          heatmapData={heatmapData}
          onRefresh={() => refreshPanel('heatmap')}
          onPin={pinPanel}
        />
        <IPLookupPanel onPin={pinPanel} />
      </div>
    </div>
  );
};

export default DashboardTab;
