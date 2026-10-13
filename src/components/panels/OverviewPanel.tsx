import React, { useEffect, useRef, useState } from 'react';
import type { ThreatLevel } from '../../types';
import PanelMenu from '../PanelMenu';

interface OverviewPanelProps {
  systemHealth: number;
  nodeCount: number;
  threatLevel: ThreatLevel;
  totalVisits: number;
  uniqueIps: number;
  flaggedCount: number;
  topSources: Array<{ source: string; count: number }>;
  userIp?: string;
  hostname?: string;
  backendOnline?: boolean;
  observedAt?: string | null;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const SEVERITY_STYLES: Record<ThreatLevel, string> = {
  LOW:      'text-[#00ff88] border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.08)]',
  MED:      'text-[#ffcc00] border-[rgba(255,204,0,0.3)] bg-[rgba(255,204,0,0.08)]',
  HIGH:     'text-orange-400 border-[rgba(255,100,0,0.3)] bg-[rgba(255,100,0,0.08)]',
  CRITICAL: 'text-[#ff2d55] border-[rgba(255,45,85,0.3)] bg-[rgba(255,45,85,0.08)] animate-pulse-red',
};

/** Animated integer counter */
function useCountUp(target: number, duration = 600) {
  const [display, setDisplay] = useState(target);
  const rafRef  = useRef<number>(0);
  const prevRef = useRef(target);

  useEffect(() => {
    const start    = prevRef.current;
    const diff     = target - start;
    const startTs  = performance.now();
    if (diff === 0) return;

    const step = (ts: number) => {
      const t = Math.min(1, (ts - startTs) / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
      setDisplay(Math.round(start + diff * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
        prevRef.current = target;
      }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}

/** Mini sparkline SVG */
function Sparkline({ values, color, width = 64, height = 24 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min   = Math.min(...values);
  const max   = Math.max(...values);
  const range = max - min || 1;
  const pts   = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const last     = pts[pts.length - 1].split(',');

  return (
    <svg width={width} height={height} style={{ overflow: 'visible', flexShrink: 0 }}>
      {/* Area fill */}
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0}   />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${height} ${polyline} ${width},${height}`}
        fill="url(#spark-fill)"
        stroke="none"
      />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 2px ${color})` }}
      />
      {/* Latest value dot */}
      <circle
        cx={parseFloat(last[0])}
        cy={parseFloat(last[1])}
        r={2.5}
        fill={color}
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
    </svg>
  );
}

const HISTORY_SIZE = 20;

const OverviewPanel: React.FC<OverviewPanelProps> = ({
  systemHealth, nodeCount, threatLevel, totalVisits, uniqueIps, flaggedCount,
  topSources, userIp, hostname, backendOnline, observedAt, onRefresh, onPin,
}) => {
  // Track health history for sparkline
  const [healthHistory, setHealthHistory] = useState<number[]>([systemHealth]);
  const prevHealth = useRef(systemHealth);
  const [animKey,   setAnimKey]   = useState(0);
  const [trend,     setTrend]     = useState<'up' | 'down' | 'flat'>('flat');

  useEffect(() => {
    if (prevHealth.current !== systemHealth) {
      const dir = systemHealth > prevHealth.current ? 'up' : 'down';
      setTrend(dir);
      setAnimKey(k => k + 1);
      setHealthHistory(h => [...h.slice(-(HISTORY_SIZE - 1)), systemHealth]);
      prevHealth.current = systemHealth;
    }
  }, [systemHealth]);

  // Animated counters
  const displayVisits  = useCountUp(totalVisits);
  const displayUnique  = useCountUp(uniqueIps);
  const displayFlagged = useCountUp(flaggedCount);

  // SVG radial arc with gradient
  const size      = 124;
  const cx        = size / 2;
  const cy        = size / 2;
  const r         = 46;
  const strokeW   = 9;
  const startAngle = -220;
  const endAngle   = 40;
  const totalAng   = endAngle - startAngle;
  const healthAng  = startAngle + (systemHealth / 100) * totalAng;

  function polarToXY(angle: number, radius: number) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }
  function arcPath(start: number, end: number, radius: number) {
    const s    = polarToXY(start, radius);
    const e    = polarToXY(end,   radius);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const healthColor = systemHealth > 80 ? '#00f5d4' : systemHealth > 55 ? '#ffcc00' : '#ff2d55';
  const shieldActive = systemHealth > 55 && threatLevel !== 'CRITICAL';

  const trendIcon  = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor = trend === 'up' ? '#00ff88' : trend === 'down' ? '#ff2d55' : '#6b7280';

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">System Overview</span>
          {backendOnline && <span className="live-badge">LIVE</span>}
        </div>
        <PanelMenu panelId="overview" title="System Overview" onRefresh={onRefresh} onPin={onPin} />
      </div>

      {hostname && (
        <div className="font-mono text-[10px] text-gray-500 -mt-1 truncate">
          Host: <span className="text-gray-300">{hostname}</span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Radial gauge */}
        <div className="relative flex-shrink-0 flex flex-col items-center">
          <svg width={size} height={size} key={animKey}>
            <defs>
              <linearGradient id="health-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor={healthColor} stopOpacity="0.6" />
                <stop offset="100%" stopColor={healthColor} stopOpacity="1" />
              </linearGradient>
              <filter id="gauge-glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Track */}
            <path d={arcPath(startAngle, endAngle, r)} fill="none"
              stroke="rgba(0,245,212,0.07)" strokeWidth={strokeW} strokeLinecap="round" />

            {/* Glow layer */}
            <path d={arcPath(startAngle, healthAng, r)} fill="none"
              stroke={healthColor} strokeWidth={strokeW + 4} strokeLinecap="round"
              opacity={0.15}
              style={{ transition: 'all 0.8s ease-out' }}
            />

            {/* Active arc */}
            <path d={arcPath(startAngle, healthAng, r)} fill="none"
              stroke="url(#health-grad)" strokeWidth={strokeW} strokeLinecap="round"
              filter="url(#gauge-glow)"
              style={{ transition: 'all 0.8s ease-out' }}
            />

            {/* Center: value + trend */}
            <text x={cx} y={cy - 8} textAnchor="middle" fill={healthColor}
              fontSize="22" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
              {systemHealth}
            </text>
            <text x={cx} y={cy + 8} textAnchor="middle" fill="rgba(255,255,255,0.3)"
              fontSize="8" fontFamily="JetBrains Mono, monospace">
              HEALTH %
            </text>
            <text x={cx + 22} y={cy - 5} textAnchor="middle" fill={trendColor}
              fontSize="11" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
              {trendIcon}
            </text>
          </svg>

          {/* Health sparkline below gauge */}
          <div className="mt-1">
            <Sparkline values={healthHistory} color={healthColor} width={72} height={18} />
          </div>

          {/* Shield status */}
          <div
            className="mt-2 font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded text-center"
            style={{
              color:       shieldActive ? '#00ff88' : '#ff2d55',
              border:      `1px solid ${shieldActive ? 'rgba(0,255,136,0.3)' : 'rgba(255,45,85,0.3)'}`,
              background:  shieldActive ? 'rgba(0,255,136,0.06)' : 'rgba(255,45,85,0.06)',
              textShadow:  `0 0 6px ${shieldActive ? 'rgba(0,255,136,0.5)' : 'rgba(255,45,85,0.5)'}`,
              minWidth:    72,
            }}
          >
            {shieldActive ? '⬡ SHIELD ACTIVE' : '⚠ COMPROMISED'}
          </div>
        </div>

        {/* Stats grid */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'INTERFACES',   val: nodeCount,         raw: true,  color: '#00f5d4' },
              { label: 'TOTAL VISITS', val: displayVisits,     raw: false, color: '#00f5d4' },
              { label: 'UNIQUE IPS',   val: displayUnique,     raw: false, color: '#00f5d4' },
              { label: 'FLAGGED',      val: displayFlagged,    raw: false, color: '#ff6b9d' },
            ].map(({ label, val, raw, color }) => (
              <div key={label}
                className="flex flex-col gap-0.5 px-2 py-1.5 rounded"
                style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}
              >
                <span className="font-mono text-[10px] text-gray-500 uppercase tracking-widest">{label}</span>
                <span
                  className="font-mono text-sm font-bold metric-value animate-count-up"
                  key={val}
                  style={{ color, textShadow: `0 0 8px ${color}50` }}
                >
                  {raw ? val : val.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between px-2 py-1 rounded"
            style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
            <span className="font-mono text-[10px] text-gray-500 uppercase">THREAT LEVEL</span>
            <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${SEVERITY_STYLES[threatLevel]}`}>
              {threatLevel}
            </span>
          </div>

          <div className="flex items-center justify-between px-2 py-1 rounded"
            style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
            <span className="font-mono text-[10px] text-gray-500 uppercase">YOUR IP</span>
            <span className="font-mono text-[10px] text-[#00f5d4]">{userIp || '—'}</span>
          </div>

          <div className="flex items-center justify-between px-2 py-1 rounded"
            style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
            <span className="font-mono text-[10px] text-gray-500 uppercase">COLLECTOR</span>
            <span className={`font-mono text-[10px] ${backendOnline ? 'text-[#00ff88]' : 'text-[#ff2d55]'}`}
              style={{ textShadow: backendOnline ? '0 0 6px rgba(0,255,136,0.5)' : '0 0 6px rgba(255,45,85,0.5)' }}>
              {backendOnline ? '● CONNECTED' : '○ OFFLINE'}
            </span>
          </div>

          {observedAt && (
            <div className="font-mono text-[10px] text-gray-600 px-1">
              Last sample: {new Date(observedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Top sources */}
      <div className="border-t border-[rgba(255,255,255,0.06)] pt-2">
        <div className="font-mono text-[10px] text-gray-500 uppercase tracking-widest mb-2">Top Detected Sources</div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] text-gray-200">
          {topSources.length > 0 ? topSources.map(source => (
            <div key={source.source}
              className="flex items-center justify-between px-2 py-1 rounded"
              style={{ border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.018)' }}
            >
              <span className="truncate text-gray-400">{source.source}</span>
              <span className="text-[#00f5d4] font-bold ml-2 flex-shrink-0">{source.count}</span>
            </div>
          )) : (
            <div className="text-gray-600 col-span-2">No detected sources</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(OverviewPanel);
