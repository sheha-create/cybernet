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

/**
 * Slot around each dashboard panel. Pinned panels move to the front of their
 * grid row via CSS `order`, which keeps React's DOM tree stable — no node
 * shuffling — while still visibly reordering the layout.
 */
const PanelSlot: React.FC<{ id: string; pinned: boolean; children: React.ReactNode }> = ({ id, pinned, children }) => (
  <div
    data-panel-id={id}
    className={`min-h-0 min-w-0 ${pinned ? 'panel-pinned' : ''}`}
    style={{ order: pinned ? -1 : undefined }}
  >
    {children}
  </div>
);

const DashboardTab: React.FC<DashboardTabProps> = ({ state }) => {
  const {
    systemHealth, threatLevel, nodeCount,
    devices, donutFilter, setDonutFilter,
    trafficData, heatmapData,
    telemetry,
    alerts,
    pinPanel, refreshPanel,
    panelPins,
    visitStats,
    userIp,
    hostname,
    backendOnline,
  } = state;

  const isPinned = panelPins.isPinned;

  return (
    <div className="flex flex-col gap-3 h-full overflow-auto p-3">
      {/* Top row: collapses 3 -> 2 -> 1 as the viewport narrows */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 min-h-[260px]">
        <PanelSlot id="overview" pinned={isPinned('overview')}>
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
        </PanelSlot>
        <PanelSlot id="donut" pinned={isPinned('donut')}>
          <DonutChartPanel
            devices={devices}
            donutFilter={donutFilter}
            setDonutFilter={setDonutFilter}
            onRefresh={() => refreshPanel('donut')}
            onPin={pinPanel}
          />
        </PanelSlot>
        <PanelSlot id="systemstatus" pinned={false}>
          <SystemStatusBar
            cpuUsage={telemetry.cpuUsage}
            memoryUsage={telemetry.memoryUsage}
            storageUsage={telemetry.storageUsage ?? 0}
            nodeCount={nodeCount}
            threatLevel={threatLevel}
          />
        </PanelSlot>
      </div>

      {/* Middle row */}
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 h-[340px] xl:h-[400px]">
        <PanelSlot id="coremap" pinned={false}>
          <CoreMapPanel
            cpuModel={telemetry.cpuModel}
            perCore={telemetry.cpuCores}
            source={telemetry.source}
            hostname={telemetry.hostname}
            onPin={pinPanel}
          />
        </PanelSlot>
        <PanelSlot id="terminal" pinned={isPinned('terminal')}>
          <TerminalPanel
            alerts={alerts}
            streamState={state.streamState}
            onRefresh={() => refreshPanel('terminal')}
            onPin={pinPanel}
          />
        </PanelSlot>
      </div>

      {/* Traffic row */}
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 h-[340px] xl:h-[400px]">
        <PanelSlot id="traffic" pinned={false}>
          <TrafficChartPanel trafficData={trafficData} onPin={pinPanel} />
        </PanelSlot>
        <PanelSlot id="geo" pinned={false}>
          <GeoMapPanel onPin={pinPanel} />
        </PanelSlot>
      </div>

      {/* Bottom row */}
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 h-[340px] xl:h-[400px]">
        <PanelSlot id="heatmap" pinned={isPinned('heatmap')}>
          <HeatmapPanel
            heatmapData={heatmapData}
            onRefresh={() => refreshPanel('heatmap')}
            onPin={pinPanel}
          />
        </PanelSlot>
        <PanelSlot id="iplookup" pinned={false}>
          <IPLookupPanel onPin={pinPanel} />
        </PanelSlot>
      </div>
    </div>
  );
};

export default DashboardTab;
