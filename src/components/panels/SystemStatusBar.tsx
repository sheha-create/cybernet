import React from 'react';
import type { ThreatLevel } from '../../types';

interface SystemStatusBarProps {
  cpuUsage: number;
  memoryUsage: number;
  storageUsage: number;
  nodeCount: number;
  threatLevel: ThreatLevel;
}

interface MetricCardProps {
  label: string;
  value: number | string;
  unit?: string;
  danger?: boolean;
  color?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, unit = '%', danger, color }) => {
  const displayColor = danger ? '#ff2d55' : (color ?? '#00f5d4');
  return (
    <div className="cyber-card px-3 py-2 flex flex-col gap-1 flex-1 min-w-0">
      <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500">{label}</span>
      <div className="flex items-end gap-1">
        <span
          className="font-mono text-lg font-bold transition-numeric"
          style={{
            color: displayColor,
            textShadow: `0 0 8px ${displayColor}80`,
            transition: 'color 0.3s ease, text-shadow 0.3s ease',
          }}
        >
          {typeof value === 'number' ? Math.round(value) : value}
        </span>
        <span className="font-mono text-xs text-gray-600 mb-0.5">{unit}</span>
      </div>
      {typeof value === 'number' && (
        <div className="h-1 bg-[rgba(255,255,255,0.05)] rounded overflow-hidden">
          <div
            className="h-full rounded transition-all duration-500"
            style={{
              width: `${Math.min(100, value)}%`,
              background: danger ? '#ff2d55' : displayColor,
              boxShadow: `0 0 4px ${danger ? '#ff2d55' : displayColor}80`,
            }}
          />
        </div>
      )}
    </div>
  );
};

const THREAT_COLORS: Record<ThreatLevel, string> = {
  LOW: '#00ff88',
  MED: '#ffcc00',
  HIGH: '#ff8c00',
  CRITICAL: '#ff2d55',
};

const SystemStatusBar: React.FC<SystemStatusBarProps> = ({
  cpuUsage, memoryUsage, storageUsage, nodeCount, threatLevel,
}) => {
  return (
    <div className="flex gap-2 h-full">
      <MetricCard
        label="CPU"
        value={cpuUsage}
        danger={cpuUsage > 85}
      />
      <MetricCard
        label="Memory"
        value={memoryUsage}
        danger={memoryUsage > 85}
      />
      <MetricCard
        label="Storage"
        value={storageUsage}
        color="#a855f7"
      />
      <MetricCard
        label="Nodes"
        value={nodeCount}
        unit=""
        color="#00f5d4"
      />
      <div className="cyber-card px-3 py-2 flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500">Threat</span>
        <span
          className="font-mono text-sm font-bold"
          style={{
            color: THREAT_COLORS[threatLevel],
            textShadow: `0 0 8px ${THREAT_COLORS[threatLevel]}80`,
          }}
        >
          {threatLevel}
        </span>
      </div>
    </div>
  );
};

export default React.memo(SystemStatusBar);
