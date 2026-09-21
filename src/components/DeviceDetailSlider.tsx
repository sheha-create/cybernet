import React from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { Device, OSType } from '../types';

interface DeviceDetailSliderProps {
  device: Device | null;
  onClose: () => void;
  onIsolate: (deviceId: string) => void;
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

const STATUS_COLORS = {
  secured: '#00ff88',
  'at-risk': '#ffcc00',
  isolated: '#ff2d55',
};

const DeviceDetailSlider: React.FC<DeviceDetailSliderProps> = ({ device, onClose, onIsolate }) => {
  const sparkData = device?.connectionHistory.map((v, i) => ({ i, v })) ?? [];

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 w-80 cyber-card border-l border-[rgba(0,245,212,0.2)] flex flex-col"
      style={{
        transform: device ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease-out',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,245,212,0.1)]">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Device Profile</span>
        <button onClick={onClose} className="text-gray-500 hover:text-[#ff2d55] font-mono text-sm transition-colors">✕</button>
      </div>

      {device && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* OS + Hostname */}
          <div className="flex items-center gap-3">
            <span className="text-3xl">{OS_ICONS[device.os]}</span>
            <div>
              <div className="font-mono text-sm text-gray-200">{device.hostname}</div>
              <div className="font-mono text-xs text-[#00f5d4]">{device.ip}</div>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2">
            {[
              ['OS', device.os.toUpperCase()],
              ['MAC', `${device.macPrefix}:xx:xx`],
              ['Last Seen', device.lastSeen.toLocaleString()],
              ['Status', device.status.toUpperCase()],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between font-mono text-xs">
                <span className="text-gray-500">{k}</span>
                <span style={{ color: k === 'Status' ? STATUS_COLORS[device.status] : '#e0e0e0' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Connection history sparkline */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-600 mb-2">Connection History</div>
            <div style={{ height: 60 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkData}>
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="#00f5d4"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Tooltip
                    contentStyle={{ background: '#0a1628', border: '1px solid rgba(0,245,212,0.2)', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                    labelStyle={{ display: 'none' }}
                    itemStyle={{ color: '#00f5d4' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Isolate button */}
          <button
            onClick={() => onIsolate(device.id)}
            className={`w-full font-mono text-xs py-2 rounded border transition-colors ${
              device.status === 'isolated'
                ? 'border-[rgba(0,255,136,0.3)] text-[#00ff88] hover:bg-[rgba(0,255,136,0.08)]'
                : 'border-[rgba(255,45,85,0.3)] text-[#ff2d55] hover:bg-[rgba(255,45,85,0.08)]'
            }`}
          >
            {device.status === 'isolated' ? '✓ Remove Isolation' : '⊘ Isolate Device'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DeviceDetailSlider;
