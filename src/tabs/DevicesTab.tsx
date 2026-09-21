import React, { useState } from 'react';
import type { DashboardState } from '../hooks/useDashboardState';
import type { Device } from '../types';
import DeviceListPanel from '../components/panels/DeviceListPanel';
import DeviceDetailSlider from '../components/DeviceDetailSlider';

interface DevicesTabProps {
  state: DashboardState;
}

const DevicesTab: React.FC<DevicesTabProps> = ({ state }) => {
  const { devices, donutFilter, setDonutFilter, isolateDevice, pinPanel } = state;
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  return (
    <div className="flex h-full overflow-hidden p-3">
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
        onIsolate={(id) => {
          isolateDevice(id);
          setSelectedDevice(prev => prev ? { ...prev, status: prev.status === 'isolated' ? 'secured' : 'isolated' } : null);
        }}
      />
    </div>
  );
};

export default DevicesTab;
