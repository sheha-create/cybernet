import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { TrafficPoint } from '../../types';
import PanelMenu from '../PanelMenu';

interface TrafficChartPanelProps {
  trafficData: TrafficPoint[];
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="cyber-card border border-[rgba(0,245,212,0.2)] px-3 py-2 font-mono text-xs">
        <div className="text-gray-400 mb-1">{label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ color: p.color }}>
            {p.name}: {p.value}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const TrafficChartPanel: React.FC<TrafficChartPanelProps> = ({ trafficData, onRefresh, onPin }) => {
  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Network Traffic</span>
        <PanelMenu panelId="traffic" title="Network Traffic" data={trafficData} onRefresh={onRefresh} onPin={onPin} />
      </div>

      <div className="flex-1 min-h-0" style={{ minHeight: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trafficData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,245,212,0.06)" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(0,245,212,0.1)' }}
              interval={5}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.5)' }}
            />
            <Line
              type="monotone"
              dataKey="dataIn"
              name="Data In"
              stroke="#00f5d4"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: '#00f5d4' }}
            />
            <Line
              type="monotone"
              dataKey="dataOut"
              name="Data Out"
              stroke="#00f5d4"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              activeDot={{ r: 3, fill: '#00f5d4' }}
            />
            <Line
              type="monotone"
              dataKey="latency"
              name="Latency"
              stroke="#a855f7"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: '#a855f7' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default React.memo(TrafficChartPanel);
