import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Alert } from '../../types';
import PanelMenu from '../PanelMenu';

interface TerminalPanelProps {
  alerts: Alert[];
  streamState: 'idle' | 'connecting' | 'live' | 'reconnecting';
  onRefresh?: () => void;
  onPin?: (id: string) => void;
}

const SEVERITY_COLOR: Record<Alert['severity'], string> = {
  LOW: '#00f5d4',
  MED: '#ffcc00',
  HIGH: '#ff8c00',
  CRITICAL: '#ff2d55',
};

const TerminalPanel: React.FC<TerminalPanelProps> = ({ alerts, streamState, onRefresh, onPin }) => {
  const [paused, setPaused] = useState(false);
  const [clearedAt, setClearedAt] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousTopId = useRef<string | null>(null);
  const [flash, setFlash] = useState(false);

  // Newest first, so a live detection is visible immediately without scrolling.
  // Capped so a burst of detections cannot stretch the dashboard row; the
  // newest entries are always the ones retained.
  const lines = useMemo(() => alerts
    .filter(alert => !clearedAt || alert.timestamp.getTime() > clearedAt)
    .slice(0, 150), [alerts, clearedAt]);

  useEffect(() => {
    const topId = lines[0]?.id ?? null;
    if (topId && previousTopId.current && topId !== previousTopId.current) {
      setFlash(true);
      const id = window.setTimeout(() => setFlash(false), 700);
      previousTopId.current = topId;
      return () => window.clearTimeout(id);
    }
    previousTopId.current = topId;
  }, [lines]);

  useEffect(() => {
    if (follow && !paused && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [lines, follow, paused]);

  const live = streamState === 'live';

  return (
    <div className="cyber-card p-4 flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Event Log</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border font-mono"
            style={{
              color: live ? '#00ff88' : '#6b7280',
              borderColor: live ? 'rgba(0,255,136,0.35)' : 'rgba(255,255,255,0.1)',
            }}
            title={live ? 'Streaming detections now' : 'Not connected to the event stream'}
          >
            {live ? '● STREAMING' : '○ IDLE'}
          </span>
          {flash && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-[rgba(0,245,212,0.5)] text-[#00f5d4]" style={{ animation: 'pulse 0.7s ease-out' }}>
              NEW
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFollow(v => !v)}
            className={`font-mono text-[10px] px-2 py-0.5 rounded border ${follow
              ? 'border-[rgba(0,245,212,0.4)] text-[#00f5d4]'
              : 'border-[rgba(255,255,255,0.12)] text-gray-500'}`}
            title="Jump to newest event"
          >
            {follow ? 'FOLLOWING' : 'FOLLOW OFF'}
          </button>
          <button
            onClick={() => setPaused(v => !v)}
            className="font-mono text-[10px] px-2 py-0.5 rounded border border-[rgba(0,245,212,0.2)] text-gray-400 hover:text-[#00f5d4]"
          >
            {paused ? 'RESUME' : 'PAUSE'}
          </button>
          <button
            onClick={() => setClearedAt(Date.now())}
            className="font-mono text-[10px] px-2 py-0.5 rounded border border-[rgba(255,45,85,0.2)] text-gray-500 hover:text-[#ff2d55]"
          >
            CLEAR
          </button>
          <PanelMenu panelId="terminal" title="Event Log" data={lines} onRefresh={onRefresh} onPin={onPin} />
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={e => {
          const el = e.currentTarget;
          if (el.scrollTop > 24) setFollow(false);
        }}
        className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed min-h-0 bg-black/60 p-2"
      >
        {paused ? (
          <div className="text-[#ffcc00]">
            Display paused. {lines.length} observed event{lines.length === 1 ? '' : 's'} retained.
          </div>
        ) : lines.length === 0 ? (
          <div className="space-y-1">
            <div className="text-[#00f5d4] opacity-50">
              {live ? 'Streaming. Waiting for security events…' : 'Not connected. Sign in to start monitoring.'}
            </div>
            <div className="text-gray-600 text-[10px] leading-relaxed">
              Detections are recorded when a request to this service matches a traversal or
              injection signature, or exceeds the request-rate threshold.
            </div>
          </div>
        ) : (
          lines.map(alert => (
            <div
              key={alert.id}
              className="break-all"
              style={{ color: SEVERITY_COLOR[alert.severity] }}
            >
              <span className="opacity-50">[{alert.timestamp.toLocaleTimeString()}]</span>{' '}
              <span className="font-bold">{alert.severity}</span>{' '}
              {alert.eventType}{' '}
              <span className="opacity-70">src={alert.sourceIP} port={alert.targetPort}</span>
            </div>
          ))
        )}
      </div>

      <div className="font-mono text-[10px] text-gray-700 border-t border-[rgba(255,255,255,0.06)] pt-1.5">
        {lines.length} event{lines.length === 1 ? '' : 's'} retained · newest first
      </div>
    </div>
  );
};

export default React.memo(TerminalPanel);