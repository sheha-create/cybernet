import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { Device } from '../../types';
import PanelMenu from '../PanelMenu';

interface DonutChartPanelProps {
  devices: Device[];
  donutFilter: 'all' | 'secured' | 'at-risk' | 'isolated';
  setDonutFilter: (f: 'all' | 'secured' | 'at-risk' | 'isolated') => void;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const COLORS = {
  secured: '#00ff88',
  'at-risk': '#ffcc00',
  isolated: '#ff2d55',
};

const DonutChartPanel: React.FC<DonutChartPanelProps> = ({ devices, donutFilter, setDonutFilter, onRefresh, onPin }) => {
  const [displayDevices, setDisplayDevices] = useState(devices);

  useEffect(() => {
    const id = setInterval(() => {
      setDisplayDevices([...devices]);
    }, 8000);
    return () => clearInterval(id);
  }, [devices]);

  const secured = displayDevices.filter(d => d.status === 'secured').length;
  const atRisk = displayDevices.filter(d => d.status === 'at-risk').length;
  const isolated = displayDevices.filter(d => d.status === 'isolated').length;
  const total = displayDevices.length;

  const data = [
    { name: 'Secured', value: secured, key: 'secured' as const },
    { name: 'At Risk', value: atRisk, key: 'at-risk' as const },
    { name: 'Isolated', value: isolated, key: 'isolated' as const },
  ].filter(d => d.value > 0);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) => {
    if (active && payload && payload.length) {
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
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Device Status</span>
        <PanelMenu panelId="donut" title="Device Status" data={data} onRefresh={onRefresh} onPin={onPin} />
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
              onClick={(entry: { key: 'secured' | 'at-risk' | 'isolated' }) => setDonutFilter(entry.key)}
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
            <div className="font-mono text-[9px] text-gray-500 uppercase">DEVICES</div>
          </div>
        </div>
      </div>

      {/* Legend / filter buttons */}
      <div className="flex gap-2 justify-center flex-wrap">
        {(['all', 'secured', 'at-risk', 'isolated'] as const).map(f => (
          <button
            key={f}
            onClick={() => setDonutFilter(f)}
            className={`font-mono text-[10px] px-2 py-0.5 rounded border transition-colors ${
              donutFilter === f
                ? f === 'all' ? 'border-[rgba(0,245,212,0.5)] text-[#00f5d4] bg-[rgba(0,245,212,0.1)]'
                  : f === 'secured' ? 'border-[rgba(0,255,136,0.5)] text-[#00ff88] bg-[rgba(0,255,136,0.1)]'
                  : f === 'at-risk' ? 'border-[rgba(255,204,0,0.5)] text-[#ffcc00] bg-[rgba(255,204,0,0.1)]'
                  : 'border-[rgba(255,45,85,0.5)] text-[#ff2d55] bg-[rgba(255,45,85,0.1)]'
                : 'border-[rgba(255,255,255,0.1)] text-gray-500 hover:text-gray-300'
            }`}
          >
            {f === 'all' ? 'ALL' : f === 'secured' ? `✓ ${secured}` : f === 'at-risk' ? `⚠ ${atRisk}` : `⊘ ${isolated}`}
          </button>
        ))}
      </div>
    </div>
  );
};

export default React.memo(DonutChartPanel);
