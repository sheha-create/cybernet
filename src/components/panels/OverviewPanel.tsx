import React, { useEffect, useRef } from 'react';
import type { ThreatLevel } from '../../types';
import PanelMenu from '../PanelMenu';

interface OverviewPanelProps {
  systemHealth: number;
  nodeCount: number;
  threatLevel: ThreatLevel;
  totalVisits: number;
  uniqueIps: number;
  flaggedCount: number;
  topCountries: Array<{ country: string; count: number }>;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const SEVERITY_STYLES: Record<ThreatLevel, string> = {
  LOW: 'text-[#00ff88] border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.08)]',
  MED: 'text-[#ffcc00] border-[rgba(255,204,0,0.3)] bg-[rgba(255,204,0,0.08)]',
  HIGH: 'text-orange-400 border-[rgba(255,100,0,0.3)] bg-[rgba(255,100,0,0.08)]',
  CRITICAL: 'text-[#ff2d55] border-[rgba(255,45,85,0.3)] bg-[rgba(255,45,85,0.08)] animate-pulse-red',
};

const OverviewPanel: React.FC<OverviewPanelProps> = ({ systemHealth, nodeCount, threatLevel, onRefresh, onPin }) => {
  const prevHealth = useRef(systemHealth);
  const [animKey, setAnimKey] = React.useState(0);

  useEffect(() => {
    if (prevHealth.current !== systemHealth) {
      setAnimKey(k => k + 1);
      prevHealth.current = systemHealth;
    }
  }, [systemHealth]);

  // SVG radial arc
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = 46;
  const strokeWidth = 8;
  const startAngle = -220;
  const endAngle = 40;
  const totalAngle = endAngle - startAngle;
  const healthAngle = startAngle + (systemHealth / 100) * totalAngle;

  function polarToXY(angle: number, radius: number) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arcPath(start: number, end: number, radius: number) {
    const s = polarToXY(start, radius);
    const e = polarToXY(end, radius);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const healthColor = systemHealth > 80 ? '#00f5d4' : systemHealth > 60 ? '#ffcc00' : '#ff2d55';

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">System Overview</span>
        <PanelMenu panelId="overview" title="System Overview" onRefresh={onRefresh} onPin={onPin} />
      </div>

      <div className="flex items-center gap-4">
        {/* Radial arc meter */}
        <div className="relative flex-shrink-0">
          <svg width={size} height={size} key={animKey}>
            {/* Background arc */}
            <path
              d={arcPath(startAngle, endAngle, r)}
              fill="none"
              stroke="rgba(0,245,212,0.1)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {/* Health arc */}
            <path
              d={arcPath(startAngle, healthAngle, r)}
              fill="none"
              stroke={healthColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 6px ${healthColor})`,
                transition: 'all 0.8s ease-out',
              }}
            />
            {/* Center text */}
            <text x={cx} y={cy - 4} textAnchor="middle" fill={healthColor} fontSize="20" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
              {systemHealth}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="JetBrains Mono, monospace">
              HEALTH %
            </text>
          </svg>
        </div>

        {/* Stats */}
        <div className="flex flex-col gap-2 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-gray-500">NODES ONLINE</span>
              <span className="font-mono text-sm text-[#00f5d4] animate-tick-up" key={nodeCount}>
                {nodeCount}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-gray-500">TOTAL VISITS</span>
              <span className="font-mono text-sm text-[#00f5d4]">{totalVisits}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-gray-500">UNIQUE IPS</span>
              <span className="font-mono text-sm text-[#00f5d4]">{uniqueIps}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-gray-500">FLAGGED</span>
              <span className="font-mono text-sm text-[#ff6b9d]">{flaggedCount}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-gray-500">THREAT LEVEL</span>
            <span className={`font-mono text-xs px-2 py-0.5 rounded border ${SEVERITY_STYLES[threatLevel]}`}>
              {threatLevel}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-gray-500">STATUS</span>
            <span className="font-mono text-xs text-[#00ff88]">● ACTIVE</span>
          </div>
        </div>
      </div>
      <div className="border-t border-[rgba(255,255,255,0.08)] pt-3">
        <div className="font-mono text-[10px] text-gray-500 uppercase tracking-widest mb-2">Top countries</div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-200">
          {topCountries.length > 0 ? topCountries.map(country => (
            <div key={country.country} className="flex items-center justify-between px-2 py-1 rounded border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]">
              <span>{country.country}</span>
              <span className="text-[#00f5d4]">{country.count}</span>
            </div>
          )) : (
            <div className="text-gray-500 col-span-2">No countries available</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(OverviewPanel);
