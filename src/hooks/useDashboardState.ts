import { useState, useEffect, useCallback, useRef } from 'react';
import type { Alert, Device, BlocklistEntry, TrafficPoint, HeatmapCell, Toast, ThreatLevel, OSType, DeviceStatus, VisitRecord } from '../types';
import { computeThreatLevel, computeAnomalyDelta, serializeBlocklistEntry, deserializeBlocklistEntry } from '../utils/logic';
import type { IPThreatData } from '../utils/threatIntel';
import { generateThreatsFromIP } from '../utils/threatIntel';
import { useSystemMetrics, useNetworkInfo, useSystemInfo, useBackendStats, useBackendVisits } from './useBackendData';

function loadMyIP(): string {
  try { return localStorage.getItem('cybernet_my_ip') ?? ''; } catch { return ''; }
}
function saveMyIP(ip: string): void {
  try { localStorage.setItem('cybernet_my_ip', ip); } catch { /* ignore */ }
}

// ─── Data pools ────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  'Brute Force', 'Port Scan', 'SQL Injection Attempt', 'DDoS Signature Detected',
  'Malware C2 Beacon', 'Credential Stuffing', 'Zero-Day Exploit Attempt', 'ARP Spoofing',
  'DNS Tunneling', 'ICMP Flood', 'SYN Flood', 'XSS Attempt', 'CSRF Attack',
  'Directory Traversal', 'Command Injection', 'LDAP Injection', 'XML Injection',
  'Buffer Overflow', 'Privilege Escalation', 'Lateral Movement',
];

const SOURCE_IPS = [
  '185.220.101.45', '45.33.32.156', '198.51.100.23', '203.0.113.77', '91.108.4.12',
  '77.88.55.66', '104.21.14.101', '162.158.92.3', '172.67.68.228', '1.179.112.21',
  '5.188.206.14', '31.184.198.23', '37.49.226.10', '45.142.212.100', '51.15.43.205',
  '62.210.180.229', '80.82.77.139', '82.221.105.6', '89.248.167.131', '91.121.87.161',
  '92.63.197.153', '94.102.49.190', '95.85.10.227', '103.21.244.0', '103.31.4.0',
  '104.16.0.0', '108.162.192.0', '131.0.72.1', '141.101.64.0', '162.158.0.0',
  '172.64.0.0', '173.245.48.0', '188.114.96.0', '190.93.240.0', '197.234.240.0',
  '198.41.128.0', '199.27.128.0', '205.251.192.0', '216.58.192.0', '220.181.38.148',
  '59.24.3.173', '117.50.11.11', '123.125.71.29', '180.76.15.143', '202.46.34.74',
  '210.140.131.145', '218.30.103.62', '221.194.47.208', '223.5.5.5', '8.8.8.8',
];

const TARGET_PORTS = [22, 80, 443, 3306, 5432, 8080, 8443, 21, 25, 53, 3389, 1433, 27017, 6379, 9200];

const GEO_COORDS: Array<{ lat: number; lng: number }> = [
  { lat: 35.6762, lng: 139.6503 },  // Tokyo
  { lat: 55.7558, lng: 37.6173 },   // Moscow
  { lat: 39.9042, lng: 116.4074 },  // Beijing
  { lat: 6.5244, lng: 3.3792 },     // Lagos
  { lat: -23.5505, lng: -46.6333 }, // São Paulo
  { lat: 48.8566, lng: 2.3522 },    // Paris
  { lat: 51.5074, lng: -0.1278 },   // London
  { lat: 40.7128, lng: -74.0060 },  // New York
  { lat: 37.7749, lng: -122.4194 }, // San Francisco
  { lat: 1.3521, lng: 103.8198 },   // Singapore
  { lat: -33.8688, lng: 151.2093 }, // Sydney
  { lat: 19.0760, lng: 72.8777 },   // Mumbai
  { lat: 25.2048, lng: 55.2708 },   // Dubai
  { lat: 52.5200, lng: 13.4050 },   // Berlin
  { lat: 41.9028, lng: 12.4964 },   // Rome
  { lat: 37.5665, lng: 126.9780 },  // Seoul
  { lat: 22.3193, lng: 114.1694 },  // Hong Kong
  { lat: -34.6037, lng: -58.3816 }, // Buenos Aires
  { lat: 30.0444, lng: 31.2357 },   // Cairo
  { lat: 55.6761, lng: 12.5683 },   // Copenhagen
];

const TERMINAL_TEMPLATES = [
  (ip: string, port: number) => `kernel: [UFW BLOCK] IN=eth0 SRC=${ip} DST=10.0.0.1 PROTO=TCP DPT=${port} FLAGS=SYN`,
  (ip: string, port: number) => `sshd[1234]: Failed password for root from ${ip} port ${port} ssh2`,
  (ip: string, port: number) => `nginx: ${ip} - - [access] "GET /admin HTTP/1.1" 403 - port ${port}`,
  (ip: string, port: number) => `snort[5678]: [1:2001219:20] ET SCAN Potential SSH Scan ${ip}:${port}`,
  (ip: string, port: number) => `fail2ban.actions: Ban ${ip} (port ${port}) after 5 failures`,
  (ip: string, port: number) => `iptables: DROP IN=eth0 SRC=${ip} DST=192.168.1.1 DPT=${port} PROTO=UDP`,
  (ip: string, port: number) => `suricata: ALERT tcp ${ip}:${port} -> 10.0.0.1:443 [**] [1:2100498:7] GPL ATTACK_RESPONSE id check returned root`,
  (ip: string, port: number) => `auditd: type=SYSCALL msg=audit(1234567890.123:456): arch=x86_64 syscall=connect a0=${ip} a1=${port}`,
  (ip: string, port: number) => `kernel: nf_conntrack: table full, dropping packet from ${ip}:${port}`,
  (ip: string, port: number) => `postfix/smtpd[9012]: NOQUEUE: reject: RCPT from ${ip}[${ip}]:${port}`,
  (ip: string, port: number) => `apache2: [error] [client ${ip}] ModSecurity: Access denied with code 403 (phase 2) port ${port}`,
  (ip: string, port: number) => `ossec: Rule: 5712 (level 10) -> 'SSHD brute force trying to get access to the system.' Src IP: ${ip}:${port}`,
  (ip: string, port: number) => `zeek: [conn] ${ip} -> 10.0.0.1:${port} proto=tcp state=S0 duration=0.001`,
  (ip: string, port: number) => `wazuh: alert: SQL injection attempt detected from ${ip} targeting port ${port}`,
  (ip: string, port: number) => `crowdstrike: Process blocked: malicious network connection to ${ip}:${port}`,
  (ip: string, port: number) => `pf: block in on em0: ${ip}.${port} > 192.168.1.1.443: Flags [S]`,
  (ip: string, port: number) => `cisco-asa: %ASA-4-106023: Deny tcp src outside:${ip}/${port} dst inside:10.0.0.1/443`,
  (ip: string, port: number) => `fortinet: date=2024 devname=FGT action=deny srcip=${ip} srcport=${port} dstport=443`,
  (ip: string, port: number) => `checkpoint: drop rule=5 src=${ip} dst=10.0.0.1 proto=tcp sport=${port} dport=443`,
  (ip: string, port: number) => `paloalto: THREAT,vulnerability,${ip},10.0.0.1,${port},443,tcp,CVE-2024-1234`,
  (ip: string, port: number) => `ids: [Priority: 1] {TCP} ${ip}:${port} -> 10.0.0.1:443 EXPLOIT attempt`,
  (ip: string, port: number) => `kernel: audit: type=1400 avc: denied { connect } for pid=1234 comm="curl" name="${ip}" port=${port}`,
  (ip: string, port: number) => `syslog: CRIT [firewall] Blocked inbound connection from ${ip}:${port} - rule #42`,
  (ip: string, port: number) => `nginx: [warn] ${ip} - rate limit exceeded on port ${port} - 429 Too Many Requests`,
  (ip: string, port: number) => `haproxy: ${ip}:${port} [01/Jan/2024:00:00:00.000] frontend~ backend/server 0/0/1/0/1 403 0 - - ---- 1/1/0/0/0 0/0 "GET /api/v1/admin"`,
  (ip: string, port: number) => `tripwire: Integrity check failed: /etc/passwd modified - connection from ${ip}:${port}`,
  (ip: string, port: number) => `rkhunter: Warning: Possible rootkit: ${ip} connected to port ${port}`,
  (ip: string, port: number) => `lynis: [warning] Suspicious network connection detected: ${ip}:${port}`,
  (ip: string, port: number) => `aide: File /etc/shadow changed - remote access from ${ip}:${port}`,
  (ip: string, port: number) => `samhain: CRIT [2024-01-01 00:00:00] file_changed: /bin/bash - src ${ip}:${port}`,
  (ip: string, port: number) => `splunk: index=security sourcetype=firewall action=blocked src_ip=${ip} src_port=${port}`,
  (ip: string, port: number) => `elastic: {"@timestamp":"2024-01-01","event.action":"blocked","source.ip":"${ip}","source.port":${port}}`,
  (ip: string, port: number) => `graylog: ALERT network_threat src=${ip}:${port} dst=10.0.0.1:443 rule=BLOCK_KNOWN_BAD`,
  (ip: string, port: number) => `qradar: Low Level Category: Firewall Deny, Source: ${ip}:${port}, Destination: 10.0.0.1:443`,
  (ip: string, port: number) => `arcsight: CEF:0|Security|Firewall|1.0|100|Blocked|7|src=${ip} spt=${port} dst=10.0.0.1 dpt=443`,
  (ip: string, port: number) => `sentinel: SecurityAlert: Suspicious IP ${ip} attempted connection on port ${port}`,
  (ip: string, port: number) => `defender: Blocked malicious IP ${ip}:${port} - ThreatIntelligence match`,
  (ip: string, port: number) => `carbonblack: Process blocked: network connection to ${ip}:${port} - policy violation`,
  (ip: string, port: number) => `cylance: THREAT: ${ip}:${port} - Malicious network activity detected`,
  (ip: string, port: number) => `darktrace: Unusual connection: ${ip}:${port} - anomaly score 0.97`,
  (ip: string, port: number) => `vectra: Detected: C2 communication to ${ip}:${port} - confidence HIGH`,
  (ip: string, port: number) => `exabeam: UEBA alert: Abnormal network behavior from ${ip}:${port}`,
  (ip: string, port: number) => `securonix: ThreatModel: Lateral Movement detected - ${ip}:${port}`,
  (ip: string, port: number) => `logrhythm: AIE Rule: Brute Force Authentication - ${ip}:${port}`,
  (ip: string, port: number) => `rapid7: Vulnerability scan detected from ${ip}:${port} - blocking`,
  (ip: string, port: number) => `qualys: External scan attempt from ${ip}:${port} - policy violation`,
  (ip: string, port: number) => `tenable: Nessus scan detected: ${ip}:${port} - auto-blocked`,
  (ip: string, port: number) => `nmap: Scan detected from ${ip}:${port} - SYN stealth scan`,
  (ip: string, port: number) => `masscan: Mass scan detected from ${ip}:${port} - rate: 1000 pps`,
  (ip: string, port: number) => `zmap: Internet-wide scan from ${ip}:${port} - blocked at perimeter`,
];

const DEVICE_SEED: Array<{ hostname: string; ip: string; os: OSType; macPrefix: string }> = [
  { hostname: 'WORKSTATION-01', ip: '192.168.1.101', os: 'windows', macPrefix: 'A4:C3:F0' },
  { hostname: 'WORKSTATION-02', ip: '192.168.1.102', os: 'windows', macPrefix: 'B8:27:EB' },
  { hostname: 'WORKSTATION-03', ip: '192.168.1.103', os: 'windows', macPrefix: 'DC:A6:32' },
  { hostname: 'srv-db-prod', ip: '192.168.1.10', os: 'linux', macPrefix: '00:1A:2B' },
  { hostname: 'srv-web-01', ip: '192.168.1.11', os: 'linux', macPrefix: '00:1B:44' },
  { hostname: 'srv-web-02', ip: '192.168.1.12', os: 'linux', macPrefix: '00:1C:55' },
  { hostname: 'srv-mail', ip: '192.168.1.13', os: 'linux', macPrefix: '00:1D:66' },
  { hostname: 'srv-vpn', ip: '192.168.1.14', os: 'linux', macPrefix: '00:1E:77' },
  { hostname: 'MacBook-Pro-CEO', ip: '192.168.1.201', os: 'macos', macPrefix: 'F0:18:98' },
  { hostname: 'MacBook-Air-Dev', ip: '192.168.1.202', os: 'macos', macPrefix: 'AC:DE:48' },
  { hostname: 'iPhone-Admin', ip: '192.168.1.150', os: 'ios', macPrefix: '3C:22:FB' },
  { hostname: 'Android-Tablet-01', ip: '192.168.1.151', os: 'android', macPrefix: '40:4E:36' },
  { hostname: 'ROUTER-CORE', ip: '192.168.1.1', os: 'router', macPrefix: 'C8:3A:35' },
  { hostname: 'SWITCH-FLOOR1', ip: '192.168.1.2', os: 'router', macPrefix: 'E8:65:D4' },
  { hostname: 'IoT-Camera-01', ip: '192.168.1.220', os: 'iot', macPrefix: '00:12:34' },
  { hostname: 'IoT-Camera-02', ip: '192.168.1.221', os: 'iot', macPrefix: '00:12:35' },
  { hostname: 'IoT-Thermostat', ip: '192.168.1.222', os: 'iot', macPrefix: '00:12:36' },
  { hostname: 'LAPTOP-DEV-01', ip: '192.168.1.130', os: 'linux', macPrefix: '08:00:27' },
  { hostname: 'LAPTOP-DEV-02', ip: '192.168.1.131', os: 'windows', macPrefix: '08:00:28' },
  { hostname: 'srv-backup', ip: '192.168.1.15', os: 'linux', macPrefix: '00:1F:88' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function drift(current: number, min: number, max: number, delta: number): number {
  const next = current + (Math.random() - 0.5) * delta * 2;
  return Math.max(min, Math.min(max, next));
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function generateAlert(myIP?: string): Alert {
  const severity: ThreatLevel = Math.random() < 0.7
    ? (Math.random() < 0.5 ? 'LOW' : 'MED')
    : (Math.random() < 0.5 ? 'HIGH' : 'CRITICAL');
  const geo = Math.random() > 0.3 ? pick(GEO_COORDS) : undefined;
  // If myIP is set, inject it as source ~25% of the time so it appears in the feed
  const useMyIP = !!myIP && Math.random() < 0.25;
  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date(),
    eventType: pick(EVENT_TYPES),
    severity,
    sourceIP: useMyIP ? myIP! : pick(SOURCE_IPS),
    targetPort: pick(TARGET_PORTS),
    read: false,
    lat: geo?.lat,
    lng: geo?.lng,
  };
}

function generateTrafficPoint(): TrafficPoint {
  return {
    time: nowHHMM(),
    dataIn: Math.round(rand(50, 500)),
    dataOut: Math.round(rand(30, 300)),
    latency: Math.round(rand(5, 120)),
  };
}

function generateInitialTraffic(): TrafficPoint[] {
  const pts: TrafficPoint[] = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 5000);
    pts.push({
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      dataIn: Math.round(rand(50, 500)),
      dataOut: Math.round(rand(30, 300)),
      latency: Math.round(rand(5, 120)),
    });
  }
  return pts;
}

function generateHeatmap(): HeatmapCell[][] {
  const grid: HeatmapCell[][] = [];
  for (let day = 0; day < 7; day++) {
    const row: HeatmapCell[] = [];
    for (let hour = 0; hour < 24; hour++) {
      row.push({
        hour,
        day,
        count: Math.round(rand(0, 100)),
        topAttackType: pick(EVENT_TYPES),
      });
    }
    grid.push(row);
  }
  return grid;
}

function seedDevices(): Device[] {
  return DEVICE_SEED.map((d, i) => {
    const statuses: DeviceStatus[] = ['secured', 'secured', 'secured', 'at-risk', 'isolated'];
    return {
      id: `device-${i}`,
      ip: d.ip,
      hostname: d.hostname,
      os: d.os,
      macPrefix: d.macPrefix,
      lastSeen: new Date(Date.now() - Math.random() * 3600000),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      connectionHistory: Array.from({ length: 20 }, () => Math.round(rand(0, 100))),
    };
  });
}

function loadBlocklist(): BlocklistEntry[] {
  try {
    const raw = localStorage.getItem('cybernet_blocklist');
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return arr.map(deserializeBlocklistEntry).map(e => ({
      ...e,
      status: new Date() > e.expiresAt ? 'expired' : 'active',
    }));
  } catch {
    return [];
  }
}

function saveBlocklist(entries: BlocklistEntry[]): void {
  try {
    localStorage.setItem('cybernet_blocklist', JSON.stringify(entries.map(serializeBlocklistEntry)));
  } catch {
    // ignore storage errors
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useDashboardState() {
  const [systemHealth, setSystemHealth] = useState(94);
  const [myIP, setMyIPState] = useState<string>(loadMyIP);
  const [myIPThreatData, setMyIPThreatData] = useState<IPThreatData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>(() => Array.from({ length: 5 }, () => generateAlert(loadMyIP())));
  const [devices, setDevices] = useState<Device[]>(seedDevices);
  const [blocklist, setBlocklistState] = useState<BlocklistEntry[]>(loadBlocklist);
  const [trafficData, setTrafficData] = useState<TrafficPoint[]>(generateInitialTraffic);
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[][]>(generateHeatmap);
  const [cpuUsage, setCpuUsage] = useState(() => rand(30, 70));
  const [memoryUsage, setMemoryUsage] = useState(() => rand(40, 75));
  const [storageUsage, setStorageUsage] = useState(() => rand(50, 80));
  const [nodeCount, setNodeCount] = useState(20);
  const [visitStats, setVisitStats] = useState({ totalVisits: 0, uniqueIps: 0, flaggedCount: 0, topCountries: [] as { country: string; count: number }[] });
  const [visitRecords, setVisitRecords] = useState<VisitRecord[]>([]);
  const [anomalyActive, setAnomalyActive] = useState(false);
  const [donutFilter, setDonutFilter] = useState<'all' | 'secured' | 'at-risk' | 'isolated'>('all');
  const [darkMode, setDarkMode] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [criticalFlash, setCriticalFlash] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'devices' | 'alerts' | 'scans' | 'config'>('dashboard');
  const [pinnedPanels, setPinnedPanels] = useState<string[]>([]);

  // Keep a ref so intervals always have the latest myIP
  const myIPRef = useRef<string>(myIP);
  useEffect(() => { myIPRef.current = myIP; }, [myIP]);

  // Backend integration: use real system metrics, live alerts, network info, stats, and visits
  const handleLiveAlert = useCallback((payload: any) => {
    const alert: Alert = {
      id: `live-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(payload.timestamp),
      eventType: payload.alertType || 'LIVE ALERT',
      severity: payload.severity || 'MED',
      sourceIP: payload.sourceIP || '0.0.0.0',
      targetPort: payload.port || 0,
      read: false,
      live: true,
    };
    setAlerts(prev => [alert, ...prev].slice(0, 200));
    if (alert.severity === 'CRITICAL') {
      setCriticalFlash(true);
      setTimeout(() => setCriticalFlash(false), 200);
    }
  }, []);

  const { metrics, hasBackend } = useSystemMetrics(handleLiveAlert);
  const { networkInfo, devices: backendDevices } = useNetworkInfo();
  const systemInfo = useSystemInfo();
  const backendStats = useBackendStats();
  const backendVisits = useBackendVisits();

  // When backend metrics are available, override the simulated values
  useEffect(() => {
    if (hasBackend && metrics) {
      setCpuUsage(metrics.cpuUsage);
      setMemoryUsage(metrics.memoryUsage);
      setStorageUsage(metrics.storageUsage);
      setNodeCount(metrics.nodeCount);
      setSystemHealth(metrics.systemHealth ?? 94);
    }
  }, [hasBackend, metrics]);

  // Replace device list with backend-discovered devices when provided
  useEffect(() => {
    if (backendDevices && backendDevices.length > 0) {
      setDevices(() => backendDevices.map((d: any, i: number) => ({
        id: d.id ?? `device-back-${i}`,
        ip: d.ip ?? d.address ?? '0.0.0.0',
        hostname: d.hostname ?? d.name ?? `device-${i}`,
        os: d.os ?? 'unknown',
        macPrefix: d.mac ? d.mac.slice(0, 8).toUpperCase() : '00:00:00',
        lastSeen: new Date(),
        status: 'secured' as DeviceStatus,
        connectionHistory: Array.from({ length: 20 }, () => Math.round(rand(0, 100))),
      })));
    }
  }, [backendDevices]);

  const setMyIP = useCallback((ip: string) => {
    saveMyIP(ip);
    setMyIPState(ip);
    myIPRef.current = ip;
  }, []);

  // Declare addToast early so other callbacks can use it
  const addToast = useCallback((message: string, type: Toast['type'], undoFn?: () => void) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, type, undoFn }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  /**
   * Load real threat data for an IP and update dashboard
   */
  const loadThreatDataForIP = useCallback((ip: string, threatData: IPThreatData) => {
    setMyIP(ip);
    setMyIPThreatData(threatData);
    
    // Generate initial alerts based on threat data
    const threatAlerts = generateThreatsFromIP(threatData);
    const initialAlerts: Alert[] = threatAlerts.map((ta, idx) => ({
      id: `alert-${Date.now()}-${idx}`,
      timestamp: ta.timestamp,
      eventType: ta.type,
      severity: ta.severity,
      sourceIP: ip,
      targetPort: Math.floor(Math.random() * 65535),
      read: false,
      lat: threatData.latitude,
      lng: threatData.longitude,
    }));
    
    // Replace alerts with threat-based ones
    setAlerts(prev => [
      ...initialAlerts,
      ...prev.filter(a => a.sourceIP !== ip).slice(0, 20),
    ].slice(0, 50));
    
    // Add toast notification
    const riskLevel = threatData.abuseScore > 75 ? 'CRITICAL' : 
                      threatData.abuseScore > 50 ? 'HIGH' : 
                      threatData.abuseScore > 25 ? 'MEDIUM' : 'LOW';
    addToast(`IP ${ip} loaded: ${threatData.threatTypes.join(', ') || 'Clean'} (${riskLevel})`, 'info');
  }, [setMyIP, addToast]);

  // Derived: alerts that match the tracked IP
  const myIPAlerts = myIP ? alerts.filter(a => a.sourceIP === myIP) : [];

  useEffect(() => {
    setVisitStats(backendStats);
  }, [backendStats]);

  useEffect(() => {
    setVisitRecords(backendVisits);
  }, [backendVisits]);

  // Refs for anomaly engine
  const alertTimestampsRef = useRef<number[]>([]);
  const trafficBaselineRef = useRef<number[]>([]);
  const rolling60sRef = useRef<number>(0);

  // Derived: threat level from alert rate
  const alertRate = (() => {
    const now = Date.now();
    const recent = alertTimestampsRef.current.filter(t => now - t < 60000);
    return recent.length; // alerts per minute
  })();
  const threatLevel: ThreatLevel = computeThreatLevel(alertRate);

  const unreadAlertCount = alerts.filter(a => !a.read).length;

  // ─── Blocklist persistence ──────────────────────────────────────────────────
  const setBlocklist = useCallback((entries: BlocklistEntry[] | ((prev: BlocklistEntry[]) => BlocklistEntry[])) => {
    setBlocklistState(prev => {
      const next = typeof entries === 'function' ? entries(prev) : entries;
      saveBlocklist(next);
      return next;
    });
  }, []);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const addToBlocklist = useCallback((ip: string, reason: string, durationHours: number) => {
    const now = new Date();
    const entry: BlocklistEntry = {
      id: `bl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ip,
      reason,
      addedAt: now,
      expiresAt: new Date(now.getTime() + durationHours * 3600000),
      status: 'active',
    };
    setBlocklist(prev => [entry, ...prev]);
  }, [setBlocklist]);

  const removeFromBlocklist = useCallback((ids: string[]) => {
    setBlocklist(prev => prev.filter(e => !ids.includes(e.id)));
  }, [setBlocklist]);

  const isolateDevice = useCallback((deviceId: string) => {
    setDevices(prev => prev.map(d =>
      d.id === deviceId
        ? { ...d, status: d.status === 'isolated' ? 'secured' : 'isolated' as DeviceStatus }
        : d
    ));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const markAlertsRead = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }, []);

  const pinPanel = useCallback((panelId: string) => {
    setPinnedPanels(prev =>
      prev.includes(panelId) ? prev.filter(p => p !== panelId) : [panelId, ...prev]
    );
  }, []);

  const refreshPanel = useCallback((panelId: string) => {
    if (panelId === 'traffic') setTrafficData(generateInitialTraffic());
    if (panelId === 'heatmap') setHeatmapData(generateHeatmap());
    if (panelId === 'overview') setSystemHealth(prev => drift(prev, 60, 100, 5));
  }, []);

  // ─── Intervals ─────────────────────────────────────────────────────────────

  // Alert injection every 4s
  useEffect(() => {
    const id = setInterval(() => {
      const alert = generateAlert(myIPRef.current || undefined);
      alertTimestampsRef.current = [
        ...alertTimestampsRef.current.filter(t => Date.now() - t < 60000),
        Date.now(),
      ];
      setAlerts(prev => [alert, ...prev].slice(0, 200));
      if (alert.severity === 'CRITICAL') {
        setCriticalFlash(true);
        setTimeout(() => setCriticalFlash(false), 200);
      }
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // System health drift every 15s
  useEffect(() => {
    const id = setInterval(() => {
      setSystemHealth(prev => drift(prev, 60, 100, 2));
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // Traffic rolling window every 5s
  useEffect(() => {
    const id = setInterval(() => {
      const pt = generateTrafficPoint();
      setTrafficData(prev => [...prev.slice(-23), pt]);
      // Update anomaly engine
      const sum = pt.dataIn + pt.dataOut;
      rolling60sRef.current = sum;
      trafficBaselineRef.current = [...trafficBaselineRef.current.slice(-59), sum];
      if (trafficBaselineRef.current.length >= 10) {
        const baseline = trafficBaselineRef.current.reduce((a, b) => a + b, 0) / trafficBaselineRef.current.length;
        const rolling = rolling60sRef.current;
        setAnomalyActive(computeAnomalyDelta(rolling, baseline));
      }
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Heatmap update every 30s
  useEffect(() => {
    const id = setInterval(() => {
      setHeatmapData(generateHeatmap());
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // CPU/Memory/Storage drift every 3s
  useEffect(() => {
    const id = setInterval(() => {
      setCpuUsage(prev => drift(prev, 5, 99, 8));
      setMemoryUsage(prev => drift(prev, 20, 95, 5));
      setStorageUsage(prev => drift(prev, 40, 95, 2));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Node count drift every 20s
  useEffect(() => {
    const id = setInterval(() => {
      setNodeCount(prev => Math.max(15, Math.min(25, prev + (Math.random() > 0.5 ? 1 : -1))));
    }, 20000);
    return () => clearInterval(id);
  }, []);

  // Blocklist expiry check every 10s
  useEffect(() => {
    const id = setInterval(() => {
      setBlocklist(prev => prev.map(e => ({
        ...e,
        status: new Date() > e.expiresAt ? 'expired' : 'active',
      })));
    }, 10000);
    return () => clearInterval(id);
  }, [setBlocklist]);

  return {
    // State
    systemHealth,
    threatLevel,
    alerts,
    unreadAlertCount,
    myIP,
    myIPThreatData,
    myIPAlerts,
    devices,
    blocklist,
    trafficData,
    heatmapData,
    cpuUsage,
    memoryUsage,
    storageUsage,
    nodeCount,
    anomalyActive,
    donutFilter,
    darkMode,
    toasts,
    criticalFlash,
    activeTab,
    pinnedPanels,
    visitStats,
    visitRecords,
    // Actions
    setMyIP,
    loadThreatDataForIP,
    addToBlocklist,
    removeFromBlocklist,
    isolateDevice,
    setDonutFilter,
    setDarkMode,
    addToast,
    removeToast,
    markAlertsRead,
    setActiveTab,
    pinPanel,
    refreshPanel,
    // Terminal data helper
    getTerminalLine: () => {
      const ip = myIPRef.current ? (Math.random() < 0.2 ? myIPRef.current : pick(SOURCE_IPS)) : pick(SOURCE_IPS);
      const port = pick(TARGET_PORTS);
      const template = pick(TERMINAL_TEMPLATES);
      return template(ip, port);
    },
  };
}

export type DashboardState = ReturnType<typeof useDashboardState>;
