import React from 'react';
import PanelMenu from '../PanelMenu';

interface CoreMapPanelProps {
  cpuModel: string;
  perCore: number[];
  source: 'agent' | 'server';
  hostname?: string | null;
  onPin?: (id: string) => void;
}

function coreColor(usage: number): string {
  if (usage >= 85) return '#ff2d55';
  if (usage >= 60) return '#ffcc00';
  if (usage > 0) return '#00f5d4';
  return 'rgba(255,255,255,0.15)';
}

const CoreMapPanel: React.FC<CoreMapPanelProps> = ({ cpuModel, perCore, source, hostname, onPin }) => {
  const cores = perCore.length ? perCore : [];
  const peak = cores.length ? Math.max(...cores) : 0;
  const mean = cores.length ? Math.round(cores.reduce((sum, v) => sum + v, 0) / cores.length) : 0;

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Core Load Map</span>
          <div className="font-mono text-[10px] text-gray-500 mt-1 truncate">
            {hostname ?? 'this host'} · {cores.length} logical core{cores.length === 1 ? '' : 's'}
          </div>
        </div>
        <PanelMenu panelId="corecpu" title="Core Load Map" data={cores} onPin={onPin} />
      </div>

      {cores.length > 0 ? (
        <>
          <div className="flex-1 min-h-0 flex items-end gap-1">
            {cores.map((usage, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end">
                <span className="font-mono text-[10px] text-gray-400 tabular-nums">{usage}</span>
                <div
                  className="w-full rounded-t transition-all duration-500"
                  style={{
                    height: `${Math.max(2, usage)}%`,
                    background: `linear-gradient(to top, ${coreColor(usage)}22, ${coreColor(usage)})`,
                    boxShadow: usage > 0 ? `0 0 6px ${coreColor(usage)}66` : 'none',
                  }}
                  title={`Core ${index}: ${usage}%`}
                />
                <span className="font-mono text-[10px] text-gray-500 tabular-nums">{index}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-[rgba(255,255,255,0.08)] pt-2 font-mono text-[11px]">
            <div>
              <div className="text-gray-500">MEAN</div>
              <div className="text-[#00f5d4] tabular-nums">{mean}%</div>
            </div>
            <div>
              <div className="text-gray-500">PEAK CORE</div>
              <div className="text-[#ffcc00] tabular-nums">{peak}%</div>
            </div>
            <div className="truncate">
              <div className="text-gray-500">SOURCE</div>
              <div className={source === 'agent' ? 'text-[#00ff88]' : 'text-gray-400'}>
                {source === 'agent' ? 'YOUR PC' : 'SERVER HOST'}
              </div>
            </div>
          </div>

          <div className="font-mono text-[10px] text-gray-600 truncate" title={cpuModel}>
            {cpuModel}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center font-mono text-[10px] text-gray-600 text-center px-4">
          Waiting for the first sample from your collector agent.
        </div>
      )}
    </div>
  );
};

export default React.memo(CoreMapPanel);
