import React, { useState } from 'react';
import type { DashboardState } from '../hooks/useDashboardState';
import type { Device } from '../types';
import DeviceListPanel from '../components/panels/DeviceListPanel';
import DeviceDetailSlider from '../components/DeviceDetailSlider';

interface DevicesTabProps {
  state: DashboardState;
}

const DevicesTab: React.FC<DevicesTabProps> = ({ state }) => {
  const { devices, donutFilter, pinPanel } = state;
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  return (
    <div className="flex h-full min-h-0 overflow-hidden p-3">
      <div className="flex-1 overflow-hidden" style={{ marginRight: selectedDevice ? 320 : 0, transition: 'margin-right 0.3s ease-out' }}>
        <DeviceListPanel
          devices={devices}
          donutFilter={donutFilter}
          onSelectDevice={setSelectedDevice}
          onPin={pinPanel}
        />
      </div>
      <DeviceDetailSlider
        device={selectedDevice}
        onClose={() => setSelectedDevice(null)}
      />
    </div>
  );
};

export default DevicesTab;
