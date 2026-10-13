import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentRecord, AgentSample, Device, HeatmapCell, HostInfo, ScanReport } from '../types';
import { useAuthContext } from '../auth/AuthProvider';
import { apiUrl } from '../utils/api';

export interface BackendStats {
  totalVisits: number;
  uniqueIps: number;
  flaggedCount: number;
  topSources: Array<{ source: string; count: number }>;
}

export interface BackendAlert {
  id: number;
  sourceIP: string;
  alertType: string;
  severity: 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
  port: number;
  timestamp: string;
  live: boolean;
  userId?: string;
}

export interface VisitRecord {
  id: number;
  ip: string;
  eventType: string;
  severity: 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
  requestPath: string;
  requestMethod: string;
  targetPort: number;
  requestCount: number;
  timestamp: string;
}

export interface SystemMetrics {
  cpuUsage: number;
  cpuCores: number[];
  cpuModel: string;
  memoryUsage: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  storageUsage: number | null;
  systemHealth: number | null;
  nodeCount: number;
  uptime: number;
  networkInBps: number;
  networkOutBps: number;
  networkAvailable: boolean;
}

const EMPTY_METRICS: SystemMetrics = {
  cpuUsage: 0, cpuCores: [], cpuModel: 'Unknown',
  memoryUsage: 0, totalMemoryBytes: 0, freeMemoryBytes: 0,
  storageUsage: null, systemHealth: null,
  nodeCount: 0, uptime: 0, networkInBps: 0, networkOutBps: 0, networkAvailable: false,
};

async function authedFetch(
  url: string,
  getIdToken: () => Promise<string | null>,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // Generous enough for geolocation lookups on the server, which can take several
  // seconds on a cold cache.
  return fetch(apiUrl(url), { ...init, signal: init.signal ?? AbortSignal.timeout(20_000), headers });
}

export type StreamState = 'idle' | 'connecting' | 'live' | 'reconnecting';

export function useSystemMetrics(onAlert?: (alert: BackendAlert) => void) {
  const { user, getIdToken } = useAuthContext();
  const [metrics, setMetrics] = useState<SystemMetrics>(EMPTY_METRICS);
  const [hasBackend, setHasBackend] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number>();

  useEffect(() => {
    // Nothing is started until a session exists, so no unauthenticated traffic
    // is generated and the stream is never opened for a signed-out visitor.
    if (!user) {
      setHasBackend(false);
      setStreamState('idle');
      return;
    }

    let active = true;
    let connecting = false;
    let attempts = 0;

    const connect = async () => {
      if (!active || connecting) return;
      connecting = true;
      setStreamState(attempts === 0 ? 'connecting' : 'reconnecting');
      eventSourceRef.current?.close();
      try {
        const token = await getIdToken();
        if (!active || !token) return;
        const source = new EventSource(apiUrl(`/sse/metrics?token=${encodeURIComponent(token)}`));
        source.addEventListener('open', () => {
          if (!active) return;
          attempts = 0;
          setStreamState('live');
        });
        source.addEventListener('metrics', event => {
          if (!active) return;
          setLastFrameAt(Date.now());
          try {
            setMetrics(JSON.parse((event as MessageEvent).data) as SystemMetrics);
          } catch { /* Ignore malformed stream entries. */ }
        });
        source.addEventListener('alert', event => {
          try { onAlert?.(JSON.parse((event as MessageEvent).data) as BackendAlert); } catch { /* Ignore malformed stream entries. */ }
        });
        source.onerror = () => {
          source.close();
          if (!active) return;
          attempts += 1;
          setHasBackend(false);
          setStreamState('reconnecting');
          // Back off so a downed backend is not hammered with reconnects.
          const delay = Math.min(30_000, 2_000 * 2 ** Math.min(attempts, 4));
          reconnectTimeoutRef.current = window.setTimeout(connect, delay);
        };
        eventSourceRef.current = source;
      } finally {
        connecting = false;
      }
    };

    const check = async () => {
      try {
        const response = await authedFetch('/api/health', getIdToken);
        if (!response.ok || !active) return;
        setHasBackend(true);
        await connect();
      } catch {
        if (active) setHasBackend(false);
      }
    };

    check();
    return () => {
      active = false;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
    };
  }, [user, onAlert, getIdToken]);

  return { metrics, hasBackend, streamState, lastFrameAt };
}

function usePolling<T>(url: string, initialValue: T, intervalMs: number, getIdToken: () => Promise<string | null>) {
  const { user } = useAuthContext();
  const [value, setValue] = useState<T>(initialValue);
  useEffect(() => {
    if (!user) return;
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      // Skip a tick rather than queueing a second request behind a slow one.
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await authedFetch(url, getIdToken);
        if (response.ok && active) setValue(await response.json() as T);
      } catch { /* Preserve the last successful observation. */ }
      finally { inFlight = false; }
    };
    refresh();
    const interval = window.setInterval(refresh, intervalMs);
    return () => { active = false; window.clearInterval(interval); };
  }, [user, url, intervalMs, getIdToken]);
  return value;
}

export function useNetworkInfo() {
  const { getIdToken } = useAuthContext();
  const networkInfo = usePolling<{ hostname: string; interfaces: Device[] }>(
    '/api/network/info',
    { hostname: 'Detecting...', interfaces: [] },
    10_000,
    getIdToken,
  );
  return { networkInfo, devices: networkInfo.interfaces };
}

export function useHostInfo() {
  const { getIdToken } = useAuthContext();
  return usePolling<HostInfo | null>('/api/host', null, 30_000, getIdToken);
}

export function useBackendStats() {
  const { getIdToken } = useAuthContext();
  return usePolling<BackendStats>('/api/stats', { totalVisits: 0, uniqueIps: 0, flaggedCount: 0, topSources: [] }, 10_000, getIdToken);
}

export function useBackendAlerts() {
  const { getIdToken } = useAuthContext();
  return usePolling<BackendAlert[]>('/api/alerts', [], 10_000, getIdToken);
}

export function useBackendVisits() {
  const { getIdToken } = useAuthContext();
  return usePolling<VisitRecord[]>('/api/visits', [], 10_000, getIdToken);
}

export function useBackendHeatmap() {
  const { getIdToken } = useAuthContext();
  return usePolling<HeatmapCell[][]>('/api/heatmap', Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) => ({ day, hour, count: 0, topAttackType: 'No detected events' }))), 30_000, getIdToken);
}

export function useUserIp() {
  const { getIdToken } = useAuthContext();
  const [ip, setIp] = useState<string>('Detecting...');
  useEffect(() => {
    let active = true;
    const fetchIp = async () => {
      try {
        const response = await authedFetch('/api/user/ip', getIdToken);
        if (response.ok && active) {
          const data = await response.json();
          setIp(data.ip);
        }
      } catch {
        if (active) setIp('Unavailable');
      }
    };
    fetchIp();
    const interval = window.setInterval(fetchIp, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [getIdToken]);
  return ip;
}

export function useAgentMetrics(intervalMs = 5_000) {
  const { user, getIdToken } = useAuthContext();
  const [agents, setAgents] = useState<AgentSample[]>([]);

  useEffect(() => {
    if (!user) {
      setAgents([]);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const response = await authedFetch('/api/agent/metrics', getIdToken);
        if (!response.ok || !active) return;
        const data = await response.json() as { agents: AgentSample[] };
        if (active) setAgents(data.agents ?? []);
      } catch { /* Keep the last successful observation. */ }
    };
    refresh();
    const interval = window.setInterval(refresh, intervalMs);
    return () => { active = false; window.clearInterval(interval); };
  }, [user, getIdToken, intervalMs]);

  return agents;
}

export function useAgentRegistry() {
  const { user, getIdToken } = useAuthContext();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const response = await authedFetch('/api/agent/list', getIdToken);
      if (!response.ok) return;
      setAgents(await response.json() as AgentRecord[]);
    } catch { /* Ignore transient listing failures. */ }
  }, [user, getIdToken]);

  useEffect(() => { refresh(); }, [refresh]);

  const issueToken = useCallback(async (label: string) => {
    setBusy(true);
    setError('');
    try {
      const response = await authedFetch('/api/agent/token', getIdToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!response.ok) throw new Error('Could not issue a token');
      const created = await response.json() as { id: string; label: string; token: string; createdAt: string };
      await refresh();
      return created;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not issue a token');
      return null;
    } finally {
      setBusy(false);
    }
  }, [getIdToken, refresh]);

  const revoke = useCallback(async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const response = await authedFetch('/api/agent/revoke', getIdToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error('Could not revoke the token');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke the token');
    } finally {
      setBusy(false);
    }
  }, [getIdToken, refresh]);

  return { agents, issueToken, revoke, busy, error, refresh };
}

const EMPTY_SCAN: ScanReport = {
  available: false,
  scannedAt: null,
  findings: [],
  summary: null,
  attacks: { total: 0, high: 0, critical: 0, last24h: 0 },
};

export function useSecurityScan(intervalMs = 15_000) {
  const { user, getIdToken } = useAuthContext();
  const [report, setReport] = useState<ScanReport>(EMPTY_SCAN);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setReport(EMPTY_SCAN);
      return;
    }
    setLoading(true);
    try {
      const response = await authedFetch('/api/scan/analyze', getIdToken);
      if (!mountedRef.current) return;
      if (!response.ok) {
        setError(`Scan failed (${response.status})`);
        return;
      }
      const data = await response.json() as ScanReport;
      if (!mountedRef.current) return;
      setReport({ ...EMPTY_SCAN, ...data });
      setError('');
    } catch {
      if (mountedRef.current) setError('Scan request failed');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, getIdToken]);

  useEffect(() => {
    if (!user) {
      setReport(EMPTY_SCAN);
      return;
    }
    refresh();
    const interval = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(interval);
  }, [user, refresh, intervalMs]);

  return { report, loading, error, refresh };
}
