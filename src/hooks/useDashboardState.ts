import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Alert, BlocklistEntry, Device, Toast, TrafficPoint, ThreatLevel } from '../types';
import { computeThreatLevel, deserializeBlocklistEntry, serializeBlocklistEntry } from '../utils/logic';
import { useAgentMetrics, useBackendAlerts, useBackendHeatmap, useBackendStats, useBackendVisits, useHostInfo, useNetworkInfo, useSecurityScan, useSystemMetrics, useUserIp } from './useBackendData';

const THEME_KEY = 'cybernet_theme';
const PINS_KEY = 'cybernet_pinned_panels';

function loadTheme(): boolean {
  // Deliberately matches the pre-paint script in index.html so the initial
  // React state agrees with whatever class was already applied.
  try { return localStorage.getItem(THEME_KEY) !== 'light'; } catch { return true; }
}

function persistTheme(dark: boolean) {
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* storage unavailable */ }
}

function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    return raw ? (JSON.parse(raw) as string[]).filter(id => typeof id === 'string') : [];
  } catch { return []; }
}

function persistPins(ids: string[]) {
  try { localStorage.setItem(PINS_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
}

function loadBlocklist(): BlocklistEntry[] {
  try {
    const raw = localStorage.getItem('cybernet_blocklist');
    return raw ? (JSON.parse(raw) as string[]).map(deserializeBlocklistEntry) : [];
  } catch { return []; }
}

function persistBlocklist(entries: BlocklistEntry[]) {
  try { localStorage.setItem('cybernet_blocklist', JSON.stringify(entries.map(serializeBlocklistEntry))); } catch { /* Browser storage can be unavailable. */ }
}

function toAlert(event: { id: number; timestamp: string; alertType: string; severity: Alert['severity']; sourceIP: string; port: number; live: boolean }): Alert {
  return {
    id: `event-${event.id}`,
    timestamp: new Date(event.timestamp),
    eventType: event.alertType,
    severity: event.severity,
    sourceIP: event.sourceIP,
    targetPort: event.port || 0,
    read: !event.live,
    live: event.live,
  };
}

export function useDashboardState() {
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
  const [blocklist, setBlocklistState] = useState<BlocklistEntry[]>(loadBlocklist);
  const [donutFilter, setDonutFilter] = useState<'all' | 'active' | 'loopback'>('all');
  const [darkMode, setDarkModeState] = useState<boolean>(loadTheme);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [criticalFlash, setCriticalFlash] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'devices' | 'alerts' | 'scans' | 'config'>('dashboard');
  const [pinnedPanels, setPinnedPanels] = useState<string[]>(loadPins);
  const [trafficData, setTrafficData] = useState<TrafficPoint[]>([]);
  const [focusedDeviceIp, setFocusedDeviceIp] = useState<string | null>(null);

  const setDarkMode = useCallback((value: boolean | ((previous: boolean) => boolean)) => {
    setDarkModeState(previous => {
      const next = typeof value === 'function' ? value(previous) : value;
      persistTheme(next);
      return next;
    });
  }, []);

  const onLiveAlert = useCallback((event: Parameters<typeof toAlert>[0]) => {
    const alert = toAlert({ ...event, live: true });
    setLiveAlerts(previous => [alert, ...previous.filter(item => item.id !== alert.id)].slice(0, 200));
    if (alert.severity === 'CRITICAL') {
      setCriticalFlash(true);
      window.setTimeout(() => setCriticalFlash(false), 200);
    }
  }, []);

  const { metrics, hasBackend, streamState, lastFrameAt } = useSystemMetrics(onLiveAlert);
  const { networkInfo, devices: observedInterfaces, refresh: refreshNetwork } = useNetworkInfo();
  const { hostInfo } = useHostInfo();
  const { alerts: storedAlerts, refresh: refreshAlerts } = useBackendAlerts();
  const { stats: visitStats, refresh: refreshStats } = useBackendStats();
  const { visits: visitRecords } = useBackendVisits();
  const { heatmap: heatmapData, refresh: refreshHeatmap } = useBackendHeatmap();
  const { ip: userIp, refresh: refreshUserIp } = useUserIp();
  const { agents: agentSamples, refresh: refreshAgents } = useAgentMetrics();
  const scan = useSecurityScan();

  const primaryAgent = useMemo(
    () => agentSamples.find(agent => agent.online) ?? agentSamples[0] ?? null,
    [agentSamples],
  );

  // When the collector agent is live, its figures describe the user's own machine,
  // so they take precedence over the server host's counters.
  const telemetry = useMemo(() => {
    if (!primaryAgent) {
      return {
        source: 'server' as const,
        cpuUsage: metrics.cpuUsage,
        cpuCores: metrics.cpuCores,
        cpuModel: metrics.cpuModel,
        memoryUsage: metrics.memoryUsage,
        totalMemoryBytes: metrics.totalMemoryBytes,
        freeMemoryBytes: metrics.freeMemoryBytes,
        storageUsage: metrics.storageUsage,
        networkInBps: metrics.networkInBps,
        networkOutBps: metrics.networkOutBps,
        networkAvailable: metrics.networkAvailable,
        hostname: networkInfo.hostname,
        observedAt: null as string | null,
      };
    }
    return {
      source: 'agent' as const,
      cpuUsage: primaryAgent.cpuUsage,
      cpuCores: primaryAgent.cpuCores,
      cpuModel: primaryAgent.cpuModel ?? 'Unknown',
      memoryUsage: primaryAgent.memoryUsage,
      totalMemoryBytes: primaryAgent.totalMemoryBytes,
      freeMemoryBytes: primaryAgent.freeMemoryBytes,
      storageUsage: primaryAgent.storageUsage,
      networkInBps: primaryAgent.networkInBps,
      networkOutBps: primaryAgent.networkOutBps,
      networkAvailable: true,
      hostname: primaryAgent.hostname,
      observedAt: primaryAgent.observedAt,
    };
  }, [primaryAgent, metrics, networkInfo.hostname]);

  const systemHealth = useMemo(() => {
    const factors = [telemetry.cpuUsage, telemetry.memoryUsage, telemetry.storageUsage]
      .filter((value): value is number => value !== null && value !== undefined);
    if (!factors.length) return 0;
    return Math.max(0, Math.round(100 - factors.reduce((sum, value) => sum + value, 0) / factors.length));
  }, [telemetry]);

  const alerts = useMemo(() => {
    const historical = storedAlerts.map(toAlert);
    const byId = new Map([...liveAlerts, ...historical].map(alert => [alert.id, alert]));
    return [...byId.values()].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [liveAlerts, storedAlerts]);

  const devices = useMemo<Device[]>(
    () => observedInterfaces.map(interfaceInfo => ({
      id: interfaceInfo.id,
      ip: interfaceInfo.ip,
      name: interfaceInfo.name,
      mac: interfaceInfo.mac,
      netmask: interfaceInfo.netmask,
      family: interfaceInfo.family === 'IPv6' ? 'IPv6' : 'IPv4',
      scope: interfaceInfo.scope === 'link-local' ? 'link-local' : 'global',
      cidr: interfaceInfo.cidr,
      internal: interfaceInfo.internal,
      status: interfaceInfo.internal ? 'loopback' : 'active',
    })),
    [observedInterfaces],
  );

  useEffect(() => {
    if (!telemetry.networkAvailable) return;
    setTrafficData(previous => [...previous.slice(-59), {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      dataIn: telemetry.networkInBps,
      dataOut: telemetry.networkOutBps,
    }]);
  }, [telemetry.networkAvailable, telemetry.networkInBps, telemetry.networkOutBps]);

  const recentAlertRate = alerts.filter(alert => Date.now() - alert.timestamp.getTime() < 60_000).length;
  const threatLevel: ThreatLevel = computeThreatLevel(recentAlertRate);
  const unreadAlertCount = alerts.filter(alert => !alert.read).length;

  // Driven by an actual CRITICAL detection in the last 60 seconds, rather than a
  // constant that could never fire.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);
  const anomalyActive = useMemo(
    () => alerts.some(alert => alert.severity === 'CRITICAL' && nowTick - alert.timestamp.getTime() < 60_000),
    [alerts, nowTick],
  );

  const setBlocklist = useCallback((updater: BlocklistEntry[] | ((previous: BlocklistEntry[]) => BlocklistEntry[])) => {
    setBlocklistState(previous => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      persistBlocklist(next);
      return next;
    });
  }, []);

  const addToast = useCallback((message: string, type: Toast['type'], undoFn?: () => void) => {
    const id = `toast-${Date.now()}`;
    setToasts(previous => [...previous, { id, message, type, undoFn }]);
    window.setTimeout(() => setToasts(previous => previous.filter(toast => toast.id !== id)), 4_000);
  }, []);

  const addToBlocklist = useCallback((ip: string, reason: string, durationHours: number) => {
    const addedAt = new Date();
    setBlocklist(previous => [{ id: `rule-${Date.now()}`, ip, reason, addedAt, expiresAt: new Date(addedAt.getTime() + durationHours * 3_600_000), status: 'active' }, ...previous]);
  }, [setBlocklist]);

    const removeFromBlocklist = useCallback((ids: string[]) => setBlocklist(previous => previous.filter(entry => !ids.includes(entry.id))), [setBlocklist]);
  const removeToast = useCallback((id: string) => setToasts(previous => previous.filter(toast => toast.id !== id)), []);
  const markAlertsRead = useCallback(() => setLiveAlerts(previous => previous.map(alert => ({ ...alert, read: true }))), []);

  const pinPanel = useCallback((panelId: string) => setPinnedPanels(previous => {
    const next = previous.includes(panelId)
      ? previous.filter(id => id !== panelId)
      : [panelId, ...previous];
    persistPins(next);
    return next;
  }), []);

  // Manual refresh endpoints, keyed by panel id. Panels fed directly by the
  // SSE stream (traffic chart, core map) don't need one — their data changes
  // continuously anyway.
  const refresherRef = useRef<Record<string, (() => void) | undefined>>({});
  refresherRef.current = {
    overview: refreshStats,
    donut: refreshNetwork,
    devicelist: refreshNetwork,
    heatmap: refreshHeatmap,
    threatfeed: refreshAlerts,
    terminal: refreshAlerts,
    agent: refreshAgents,
    userip: refreshUserIp,
    scan: scan.refresh,
  };

  const refreshPanel = useCallback((panelId: string) => {
    const refresh = refresherRef.current[panelId];
    if (!refresh) return false;
    refresh();
    return true;
  }, []);

  const focusDevice = useCallback((ip: string) => setFocusedDeviceIp(ip), []);
  const clearFocusedDevice = useCallback(() => setFocusedDeviceIp(null), []);

  const panelPins = useMemo(() => ({
    isPinned: (panelId: string) => pinnedPanels.includes(panelId),
    pinPanel,
  }), [pinnedPanels, pinPanel]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setBlocklist(previous => previous.map(entry => ({ ...entry, status: new Date() > entry.expiresAt ? 'expired' : 'active' })));
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [setBlocklist]);

  return {
    systemHealth, threatLevel, alerts, unreadAlertCount, devices, blocklist, trafficData, heatmapData,
    telemetry, agentSamples, scan,
    nodeCount: metrics.nodeCount, anomalyActive, donutFilter, darkMode, toasts, criticalFlash,
    activeTab, pinnedPanels, visitStats, visitRecords, userIp, hostInfo, hostname: networkInfo.hostname,
    backendOnline: hasBackend, streamState, lastFrameAt,
    addToBlocklist, removeFromBlocklist, setDonutFilter, setDarkMode, addToast,
    removeToast, markAlertsRead, setActiveTab, pinPanel, refreshPanel,
    focusedDeviceIp, focusDevice, clearFocusedDevice,
    panelPins,
  };
}

export type DashboardState = ReturnType<typeof useDashboardState>;
