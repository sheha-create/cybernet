import React from 'react';
import type { Device, DeviceStatus } from '../../types';
import { formatIP } from '../../utils/ip';
import PanelMenu from '../PanelMenu';

interface DeviceListPanelProps {
  devices: Device[];
  donutFilter: 'all' | 'active' | 'loopback';
  onSelectDevice: (device: Device) => void;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const STATUS_STYLES: Record<DeviceStatus, string> = {
  active: 'text-[#00ff88] border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.05)]',
  loopback: 'text-gray-400 border-[color:var(--line-3)] bg-[color:var(--line-1)]',
};

const DeviceListPanel: React.FC<DeviceListPanelProps> = ({
  devices, donutFilter, onSelectDevice, onRefresh, onPin,
}) => {
  const filtered = donutFilter === 'all' ? devices : devices.filter(d => d.status === donutFilter);

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">
          Network Interfaces
          <span className="ml-2 text-gray-500">({filtered.length})</span>
        </span>
        <PanelMenu panelId="devices" title="Network Interfaces" data={filtered} onRefresh={onRefresh} onPin={onPin} />
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="text-gray-600 text-[10px] uppercase tracking-wider border-b border-[rgba(0,245,212,0.08)]">
              <th className="pb-1 text-left">Interface</th>
              <th className="pb-1 text-left">IP Address</th>
              <th className="pb-1 text-left">Family</th>
              <th className="pb-1 text-left">MAC</th>
              <th className="pb-1 text-left">Netmask</th>
              <th className="pb-1 text-left">CIDR</th>
              <th className="pb-1 text-left">State</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(device => (
              <tr
                key={device.id}
                onClick={() => onSelectDevice(device)}
                className="border-b border-[rgba(0,245,212,0.04)] cursor-pointer hover:bg-[rgba(0,245,212,0.04)] transition-colors"
              >
                <td className="py-1.5 text-gray-200">{device.name}</td>
                <td className="py-1.5 text-[#00f5d4] break-all">{formatIP(device.ip)}</td>
                <td className="py-1.5">
                  <span className="text-[10px] px-1 py-0.5 rounded border border-[color:var(--line-2)] text-gray-400">
                    {device.family === 'IPv6' ? 'v6' : 'v4'}
                  </span>
                  {device.scope === 'link-local' && (
                    <span className="ml-1 text-[10px] px-1 py-0.5 rounded border border-[rgba(255,204,0,0.3)] text-[#ffcc00]">LL</span>
                  )}
                </td>
                <td className="py-1.5 text-gray-600 text-[10px]">{device.mac || 'N/A'}</td>
                <td className="py-1.5 text-gray-500 text-[10px]">{device.netmask}</td>
                <td className="py-1.5 text-gray-500 text-[10px] break-all">{device.cidr || 'N/A'}</td>
                <td className="py-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[device.status]}`}>
                    {device.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-600">No network interfaces</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default React.memo(DeviceListPanel);
