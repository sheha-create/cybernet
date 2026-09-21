import { useState, useEffect, useRef } from 'react';
import { useAuthedFetch } from '../auth/api';
import { useAuthContext } from '../auth/AuthProvider';

export interface BackendStats {
  totalVisits: number;
  uniqueIps: number;
  flaggedCount: number;
  topCountries: Array<{ country: string; count: number }>;
}

export interface VisitRecord {
  id: number;
  ip: string;
  country: string;
  city: string;
  isp: string;
  asn: string;
  abuseScore: number;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  flagged: boolean;
}

export function useSystemMetrics(onAlert?: (alert: any) => void) {
  const authedFetch = useAuthedFetch();
  const { getIdToken } = useAuthContext();
  const [metrics, setMetrics] = useState({
    cpuUsage: 50,
    memoryUsage: 60,
    storageUsage: 70,
    systemHealth: 85,
    nodeCount: 4,
    uptime: 0,
  });

  const [hasBackend, setHasBackend] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number>();

  useEffect(() => {
    let isMounted = true;

    const checkBackend = async () => {
      try {
        const res = await authedFetch('/api/health', { signal: AbortSignal.timeout(2000) });
        if (res.ok && isMounted) {
          setHasBackend(true);
          await connectSSE();
          fetchMetrics();
        }
      } catch {
        if (isMounted) setHasBackend(false);
      }
    };

    checkBackend();

    return () => {
      isMounted = false;
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await authedFetch('/api/system/metrics', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        setMetrics(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  };

  const connectSSE = async () => {
    try {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const token = await getIdToken();
      const sseUrl = token ? `/sse/metrics?token=${encodeURIComponent(token)}` : '/sse/metrics';
      const eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        console.log('SSE connection established for real-time metrics & alerts');
      };

      eventSource.addEventListener('metrics', event => {
        try {
          const data = JSON.parse(event.data);
          setMetrics({
            cpuUsage: data.cpuUsage,
            memoryUsage: data.memoryUsage,
            storageUsage: data.storageUsage,
            systemHealth: data.systemHealth,
            nodeCount: data.nodeCount,
            uptime: data.uptime,
          });
        } catch (err) {
          console.error('SSE metrics parse error:', err);
        }
      });

      eventSource.addEventListener('alert', event => {
        try {
          const data = JSON.parse(event.data);
          if (onAlert) {
            onAlert(data);
          }
        } catch (err) {
          console.error('SSE alert parse error:', err);
        }
      });

      eventSource.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'metrics') {
            setMetrics({
              cpuUsage: data.cpuUsage,
              memoryUsage: data.memoryUsage,
              storageUsage: data.storageUsage,
              systemHealth: data.systemHealth,
              nodeCount: data.nodeCount,
              uptime: data.uptime,
            });
          } else if (data.type === 'alert' && onAlert) {
            onAlert(data);
          }
        } catch (err) {
          console.error('SSE generic message parse error:', err);
        }
      };

      eventSource.onerror = err => {
        console.error('SSE connection error:', err);
        eventSource.close();
        if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(connectSSE, 5000);
      };

      eventSourceRef.current = eventSource;
    } catch (err) {
      console.error('SSE connection failed:', err);
    }
  };

  return { metrics, hasBackend };
}

export function useNetworkInfo() {
  const authedFetch = useAuthedFetch();
  const [networkInfo, setNetworkInfo] = useState({ localIP: 'Unknown', interfaces: [] as any[] });
  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    const fetchNetworkInfo = async () => {
      try {
        const res = await authedFetch('/api/network/info', { signal: AbortSignal.timeout(3000) });
        if (res.ok) setNetworkInfo(await res.json());
      } catch (err) {
        console.error('Failed to fetch network info:', err);
      }
    };

    const fetchDevices = async () => {
      try {
        const res = await authedFetch('/api/network/devices', { signal: AbortSignal.timeout(3000) });
        if (res.ok) setDevices(await res.json());
      } catch (err) {
        console.error('Failed to fetch devices:', err);
      }
    };

    fetchNetworkInfo();
    fetchDevices();

    const interval = window.setInterval(() => {
      fetchNetworkInfo();
      fetchDevices();
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  return { networkInfo, devices };
}

export function useSystemInfo() {
  const authedFetch = useAuthedFetch();
  const [systemInfo, setSystemInfo] = useState({
    platform: 'unknown',
    arch: 'unknown',
    hostname: 'unknown',
    release: 'unknown',
    cpuCount: 0,
    totalMemory: 0,
    freeMemory: 0,
    uptime: 0,
    loadavg: [0, 0, 0],
  });

  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const res = await authedFetch('/api/system/info', { signal: AbortSignal.timeout(3000) });
        if (res.ok) setSystemInfo(await res.json());
      } catch (err) {
        console.error('Failed to fetch system info:', err);
      }
    };

    fetchSystemInfo();
    const interval = window.setInterval(fetchSystemInfo, 30000);
    return () => window.clearInterval(interval);
  }, []);

  return systemInfo;
}

export function useBackendStats() {
  const authedFetch = useAuthedFetch();
  const [stats, setStats] = useState<BackendStats>({ totalVisits: 0, uniqueIps: 0, flaggedCount: 0, topCountries: [] });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await authedFetch('/api/stats', { signal: AbortSignal.timeout(3000) });
        if (res.ok) setStats(await res.json());
      } catch (err) {
        console.error('Failed to fetch backend stats:', err);
      }
    };

    fetchStats();
    const interval = window.setInterval(fetchStats, 30000);
    return () => window.clearInterval(interval);
  }, []);

  return stats;
}

export function useBackendVisits() {
  const authedFetch = useAuthedFetch();
  const [visits, setVisits] = useState<VisitRecord[]>([]);

  useEffect(() => {
    const fetchVisits = async () => {
      try {
        const res = await authedFetch('/api/visits', { signal: AbortSignal.timeout(3000) });
        if (res.ok) setVisits(await res.json());
      } catch (err) {
        console.error('Failed to fetch backend visits:', err);
      }
    };

    fetchVisits();
    const interval = window.setInterval(fetchVisits, 15000);
    return () => window.clearInterval(interval);
  }, []);

  return visits;
}
