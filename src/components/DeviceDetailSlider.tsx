import React from 'react';
import type { Device } from '../types';

interface DeviceDetailSliderProps {
  device: Device | null;
  onClose: () => void;
}

const STATUS_COLORS = {
  active: 'var(--accent)',
  loopback: '#9ca3af',
};

const DeviceDetailSlider: React.FC<DeviceDetailSliderProps> = ({ device, onClose }) => {
  return (
    <div
      className="fixed inset-y-0 right-0 z-40 w-80 cyber-card border-l border-[rgba(0,245,212,0.2)] flex flex-col"
      style={{
        transform: device ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease-out',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--accent-line)]">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Interface Detail</span>
        <button onClick={onClose} className="text-gray-500 hover:text-[#ff2d55] font-mono text-sm transition-colors">✕</button>
      </div>

      {device && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔌</span>
            <div>
              <div className="font-mono text-sm text-gray-200">{device.name}</div>
              <div className="font-mono text-xs text-[#00f5d4]">{device.ip}</div>
            </div>
          </div>

          <div className="space-y-2">
            {[
              ['Interface', device.name],
              ['IP Address', device.ip],
              ['MAC', device.mac || 'N/A'],
              ['Netmask', device.netmask],
              ['CIDR', device.cidr || 'N/A'],
              ['Address Family', device.family],
              ['State', device.status.toUpperCase()],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 font-mono text-xs">
                <span className="text-gray-500 shrink-0">{k}</span>
                <span
                  className="text-right break-all"
                  style={{ color: k === 'State' ? STATUS_COLORS[device.status] : 'var(--value-ink)' }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>

          <div className="font-mono text-[10px] text-gray-600 leading-relaxed border-t border-[color:var(--line-2)] pt-3">
            Values reported directly by the host operating system for this machine's
            network interface. No external device discovery is performed.
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceDetailSlider;
