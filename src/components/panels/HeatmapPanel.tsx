import React, { useState } from 'react';
import type { HeatmapCell } from '../../types';
import { interpolateHeatmapColor } from '../../utils/logic';
import PanelMenu from '../PanelMenu';

interface HeatmapPanelProps {
  heatmapData: HeatmapCell[][];
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HeatmapPanel: React.FC<HeatmapPanelProps> = ({ heatmapData, onRefresh, onPin }) => {
  const [tooltip, setTooltip] = useState<{ cell: HeatmapCell; x: number; y: number } | null>(null);

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full relative">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Attack Heatmap</span>
        <PanelMenu panelId="heatmap" title="Attack Heatmap" data={heatmapData} onRefresh={onRefresh} onPin={onPin} />
      </div>

      <div className="flex-1 overflow-auto">
        {/* Hour labels */}
        <div className="flex mb-1 ml-8">
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="font-mono text-[11px] text-gray-600 flex-1 text-center"
              style={{ minWidth: 0 }}
            >
              {h % 4 === 0 ? String(h).padStart(2, '0') : ''}
            </div>
          ))}
        </div>

        {/* Grid */}
        {heatmapData.map((row, dayIdx) => (
          <div key={dayIdx} className="flex items-center mb-0.5">
            <div className="font-mono text-[10px] text-gray-600 w-8 flex-shrink-0 text-right pr-1">
              {DAY_LABELS[dayIdx]}
            </div>
            {row.map(cell => {
              const color = interpolateHeatmapColor(cell.count);
              return (
                <div
                  key={cell.hour}
                  className="flex-1 cursor-pointer transition-transform hover:scale-110"
                  style={{
                    height: 14,
                    background: color,
                    margin: '0 0.5px',
                    borderRadius: 1,
                    minWidth: 0,
                  }}
                  onMouseEnter={e => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    setTooltip({ cell, x: rect.left, y: rect.top });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </div>
        ))}

        {/* Color scale legend */}
        <div className="flex items-center gap-2 mt-2">
          <span className="font-mono text-[10px] text-gray-600">Low</span>
          <div
            className="flex-1 h-2 rounded"
            style={{
              background: 'linear-gradient(to right, #0a1628, #00f5d4, #ff2d55)',
            }}
          />
          <span className="font-mono text-[10px] text-gray-600">High</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 cyber-card border border-[rgba(0,245,212,0.3)] px-2 py-1.5 font-mono text-xs pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
        >
          <div className="text-[#00f5d4]">{DAY_LABELS[tooltip.cell.day]} {String(tooltip.cell.hour).padStart(2, '0')}:00</div>
          <div className="text-gray-300">Count: {tooltip.cell.count}</div>
          <div className="text-gray-500 truncate max-w-[160px]">{tooltip.cell.topAttackType}</div>
        </div>
      )}
    </div>
  );
};

export default React.memo(HeatmapPanel);
