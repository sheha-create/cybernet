import React, { useState, useEffect, useRef, useCallback } from 'react';
import PanelMenu from '../PanelMenu';

interface TerminalPanelProps {
  getTerminalLine: () => string;
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ getTerminalLine, onRefresh, onPin }) => {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  pausedRef.current = paused;

  const addLine = useCallback(() => {
    if (pausedRef.current) return;
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const line = `[${ts}] ${getTerminalLine()}`;
    setLines(prev => [...prev.slice(-199), line]);
  }, [getTerminalLine]);

  useEffect(() => {
    const id = setInterval(addLine, 1500);
    return () => clearInterval(id);
  }, [addLine]);

  // Auto-scroll
  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, paused]);

  const handleClear = () => setLines([]);

  return (
    <div className="cyber-card p-4 flex flex-col gap-2 h-full scanline-overlay scanline-moving">
      <div className="flex items-center justify-between relative z-10">
        <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">
          ▶ System Log
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused(v => !v)}
            className={`font-mono text-[10px] px-2 py-0.5 rounded border transition-colors ${
              paused
                ? 'border-[rgba(255,204,0,0.4)] text-[#ffcc00] bg-[rgba(255,204,0,0.08)]'
                : 'border-[rgba(0,245,212,0.2)] text-gray-400 hover:text-[#00f5d4]'
            }`}
          >
            {paused ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
          <button
            onClick={handleClear}
            className="font-mono text-[10px] px-2 py-0.5 rounded border border-[rgba(255,45,85,0.2)] text-gray-500 hover:text-[#ff2d55] transition-colors"
          >
            CLEAR
          </button>
          <PanelMenu panelId="terminal" title="System Log" onRefresh={onRefresh} onPin={onPin} />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed relative z-10 min-h-0"
        style={{
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 2,
          padding: '8px',
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className="text-[#00ff41] opacity-90 hover:opacity-100 transition-opacity whitespace-pre-wrap break-all"
            style={{ textShadow: '0 0 4px rgba(0,255,65,0.4)' }}
          >
            {line}
          </div>
        ))}
        {lines.length === 0 && (
          <div className="text-[#00ff41] opacity-40">Waiting for events...</div>
        )}
      </div>
    </div>
  );
};

export default React.memo(TerminalPanel);
