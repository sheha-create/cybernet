import React from 'react';
import type { Device, OSType, DeviceStatus } from '../../types';
import PanelMenu from '../PanelMenu';

interface DeviceListPanelProps {
  devices: Device[];
  donutFilter: 'all' | 'secured' | 'at-risk' | 'isolated';
  onSelectDevice: (device: Device) => void;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const OS_ICONS: Record<OSType, string> = {
  windows: '🪟',
  linux: '🐧',
  macos: '🍎',
  android: '🤖',
  ios: '📱',
  router: '🔀',
  iot: '🔌',
};

const STATUS_STYLES: Record<DeviceStatus, string> = {
  secured: 'text-[#00ff88] border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.05)]',
  'at-risk': 'text-[#ffcc00] border-[rgba(255,204,0,0.3)] bg-[rgba(255,204,0,0.05)]',
  isolated: 'text-[#ff2d55] border-[rgba(255,45,85,0.3)] bg-[rgba(255,45,85,0.05)]',
};

function formatLastSeen(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const DeviceListPanel: React.FC<DeviceListPanelProps> = ({
  devices, donutFilter, onSelectDevice, onRefresh, onPin,
}) => {
  const filtered = donutFilter === 'all' ? devices : devices.filter(d => d.status === donutFilter);

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">
          Devices
          <span className="ml-2 text-gray-500">({filtered.length})</span>
        </span>
        <PanelMenu panelId="devices" title="Devices" data={filtered} onRefresh={onRefresh} onPin={onPin} />
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="text-gray-600 text-[10px] uppercase tracking-wider border-b border-[rgba(0,245,212,0.08)]">
              <th className="pb-1 text-left">OS</th>
              <th className="pb-1 text-left">Hostname</th>
              <th className="pb-1 text-left">IP</th>
              <th className="pb-1 text-left">MAC</th>
              <th className="pb-1 text-left">Last Seen</th>
              <th className="pb-1 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(device => (
              <tr
                key={device.id}
                onClick={() => onSelectDevice(device)}
                className="border-b border-[rgba(0,245,212,0.04)] cursor-pointer hover:bg-[rgba(0,245,212,0.04)] transition-colors"
              >
                <td className="py-1.5 text-base">{OS_ICONS[device.os]}</td>
                <td className="py-1.5 text-gray-200">{device.hostname}</td>
                <td className="py-1.5 text-[#00f5d4]">{device.ip}</td>
                <td className="py-1.5 text-gray-600 text-[10px]">{device.macPrefix}:xx:xx</td>
                <td className="py-1.5 text-gray-500 text-[10px]">{formatLastSeen(device.lastSeen)}</td>
                <td className="py-1.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[device.status]}`}>
                    {device.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-600">No devices</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default React.memo(DeviceListPanel);
