import React, { useEffect, useState } from 'react';
import type { StreamState } from '../../hooks/useBackendData';

interface LiveStatusBarProps {
  streamState: StreamState;
  backendOnline: boolean;
  lastFrameAt: number | null;
  alertCount: number;
  criticalCount: number;
}

const STREAM_LABEL: Record<StreamState, string> = {
  idle: 'SIGN IN TO MONITOR',
  connecting: 'CONNECTING',
  live: 'LIVE',
  reconnecting: 'RECONNECTING',
};

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function frameAge(lastFrameAt: number | null, now: number): string {
  if (!lastFrameAt) return 'no frames yet';
  const seconds = Math.max(0, Math.round((now - lastFrameAt) / 1000));
  if (seconds < 2) return 'updated just now';
  if (seconds < 60) return `updated ${seconds}s ago`;
  return `updated ${Math.round(seconds / 60)}m ago`;
}

const LiveStatusBar: React.FC<LiveStatusBarProps> = ({
  streamState, backendOnline, lastFrameAt, alertCount, criticalCount,
}) => {
  const now = useNow();

  const live = streamState === 'live';
  const dotColor = live ? 'var(--sev-low)' : backendOnline ? 'var(--sev-med)' : 'var(--sev-critical)';
  const textColor = live ? 'var(--sev-low)' : backendOnline ? 'var(--sev-med)' : 'var(--sev-critical)';

  return (
    <div className="flex items-center gap-3 px-3 py-1 border-b border-[color:var(--accent-line)] font-mono text-[10px] shrink-0" style={{ background: 'var(--statusbar-bg, rgba(0,0,0,0.25))' }}>
      <span className="flex items-center gap-1.5" style={{ color: textColor }}>
        <span
          className={live ? 'animate-pulse' : ''}
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
            display: 'inline-block',
          }}
        />
        <span style={{ letterSpacing: '0.08em' }}>{STREAM_LABEL[streamState]}</span>
      </span>

      <span className="text-gray-600">{frameAge(lastFrameAt, now)}</span>

      <span className="text-gray-600">
        alerts <span className="text-gray-300">{alertCount}</span>
      </span>

      {criticalCount > 0 && (
        <span style={{ color: 'var(--sev-critical)' }}>
          {criticalCount} critical
        </span>
      )}

      <span className="ml-auto text-gray-700" title="Only detections recorded against your account are shown.">
        scoped to your account
      </span>
    </div>
  );
};

export default LiveStatusBar;