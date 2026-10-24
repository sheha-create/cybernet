import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { Device } from '../../types';
import PanelMenu from '../PanelMenu';

interface DonutChartPanelProps {
  devices: Device[];
  donutFilter: 'all' | 'active' | 'loopback';
  setDonutFilter: (f: 'all' | 'active' | 'loopback') => void;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const COLORS = {
  active: '#00f5d4',
  loopback: '#6b7280',
};

const FILTERS = ['all', 'active', 'loopback'] as const;

const DonutChartPanel: React.FC<DonutChartPanelProps> = ({ devices, donutFilter, setDonutFilter, onRefresh, onPin }) => {
  const active = devices.filter(d => d.status === 'active').length;
  const loopback = devices.filter(d => d.status === 'loopback').length;
  const total = devices.length;

  const data = [
    { name: 'Routable', value: active, key: 'active' as const },
    { name: 'Loopback', value: loopback, key: 'loopback' as const },
  ].filter(d => d.value > 0);

  const counts = { all: total, active, loopback };

  const CustomTooltip = ({ active: isActive, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) => {
    if (isActive && payload && payload.length) {
      return (
        <div className="cyber-card border border-[rgba(0,245,212,0.2)] px-2 py-1 font-mono text-xs">
          <span className="text-gray-300">{payload[0].name}: </span>
          <span className="text-[#00f5d4]">{payload[0].value}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="cyber-card p-4 flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Interface Split</span>
        <PanelMenu panelId="donut" title="Interface Split" data={data} onRefresh={onRefresh} onPin={onPin} />
      </div>

      <div className="flex-1 relative" style={{ minHeight: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={60}
              paddingAngle={3}
              dataKey="value"
              onClick={(entry: { key: 'active' | 'loopback' }) => setDonutFilter(entry.key)}
              style={{ cursor: 'pointer' }}
            >
              {data.map(entry => (
                <Cell
                  key={entry.key}
                  fill={COLORS[entry.key]}
                  opacity={donutFilter === 'all' || donutFilter === entry.key ? 1 : 0.3}
                  stroke={donutFilter === entry.key ? COLORS[entry.key] : 'transparent'}
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="font-mono text-xl font-bold text-[#00f5d4]">{total}</div>
            <div className="font-mono text-[10px] text-gray-500 uppercase">INTERFACES</div>
          </div>
        </div>
      </div>

      {/* Legend / filter buttons */}
      <div className="flex gap-2 justify-center flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setDonutFilter(f)}
            className={`font-mono text-[10px] px-2 py-0.5 rounded border transition-colors ${
              donutFilter === f
                ? f === 'all' ? 'border-[rgba(0,245,212,0.5)] text-[#00f5d4] bg-[color:var(--accent-line)]'
                  : f === 'active' ? 'border-[rgba(0,245,212,0.5)] text-[#00f5d4] bg-[color:var(--accent-line)]'
                  : 'border-[rgba(107,114,128,0.5)] text-gray-300 bg-[rgba(107,114,128,0.1)]'
                : 'border-[color:var(--line-2)] text-gray-500 hover:text-gray-300'
            }`}
          >
            {f === 'all' ? `ALL ${counts.all}` : `${f === 'active' ? 'ROUTABLE' : 'LOOPBACK'} ${counts[f]}`}
          </button>
        ))}
      </div>
    </div>
  );
};

export default React.memo(DonutChartPanel);
