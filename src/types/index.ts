export type ThreatLevel = 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
export type DeviceStatus = 'active' | 'loopback';
export type OSType = 'windows' | 'linux' | 'macos' | 'android' | 'ios' | 'router' | 'iot';

export interface Alert {
  id: string;
  timestamp: Date;
  eventType: string;
  severity: ThreatLevel;
  sourceIP: string;
  targetPort: number;
  read: boolean;
  live?: boolean;
  lat?: number;
  lng?: number;
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

export interface Device {
id: string;
    ip: string;
    name: string;
    mac: string | null;
    netmask: string;
    family: 'IPv4' | 'IPv6';
    scope: 'global' | 'link-local';
    cidr: string | null;
    internal: boolean;
    status: DeviceStatus;
  }

export interface HostInfo {
  hostname: string;
  platform: string;
  osRelease: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  uptimeSeconds: number;
  loadAverage: number[];
  runtimeVersion: string;
}

export interface AgentSample {
  agentId: string;
  label: string;
  hostname: string | null;
  platform: string | null;
  osRelease: string | null;
  cpuUsage: number;
  cpuCores: number[];
  cpuModel: string | null;
  memoryUsage: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  storageUsage: number | null;
  uptimeSeconds: number;
  networkInBps: number;
  networkOutBps: number;
  primaryIp: string | null;
  interfaceCount: number;
  localIps: string[];
  listeningPorts: ListeningPort[];
  firewall: FirewallState | null;
  observedAt: string;
  receivedAt: string;
  online: boolean;
}

export interface AgentRecord {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export interface ListeningPort {
  port: number;
  address: string;
  exposed: boolean;
}

export interface FirewallState {
  supported: boolean;
  enabled: boolean;
  detail: string | null;
}

export interface ScanFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MED' | 'LOW' | 'INFO';
  category: string;
  title: string;
  detail: string;
}

export interface ScanReport {
  available: boolean;
  reason?: string;
  agentId?: string;
  label?: string;
  hostname?: string | null;
  platform?: string | null;
  osRelease?: string | null;
  scannedAt: string | null;
  findings: ScanFinding[];
  summary: {
    totalPorts: number;
    exposedPorts: number;
    localOnlyPorts: number;
    highestSeverity: ScanFinding['severity'];
    criticalCount: number;
    highCount: number;
  } | null;
  attacks: {
    total: number;
    high: number;
    critical: number;
    last24h: number;
  };
}

export interface BlocklistEntry {
  id: string;
  ip: string;
  reason: string;
  addedAt: Date;
  expiresAt: Date;
  status: 'active' | 'expired';
}

export interface TrafficPoint {
  time: string;
  dataIn: number;
  dataOut: number;
}

export interface HeatmapCell {
  hour: number;   // 0–23
  day: number;    // 0–6
  count: number;
  topAttackType: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  undoFn?: () => void;
}

export interface IPLookupResult {
  ip: string;
  country: string;
  city: string;
  isp: string;
  asn: string;
  timezone: string;
  lat: number;
  lng: number;
  threatScore: number;
}

export interface RealIPData {
  ip: string;
  // Geolocation (ip-api.com)
  country: string;
  countryCode: string;
  regionName: string;
  city: string;
  zip: string;
  lat: number;
  lng: number;
  timezone: string;
  isp: string;
  org: string;
  asn: string;
  asnName: string;
  reverse: string;
  mobile: boolean;
  proxy: boolean;
  hosting: boolean;
  // Threat Intelligence (Shodan InternetDB — free, no API key)
  ports: number[];
  cves: string[];
  tags: string[];
  hostnames: string[];
  cpes: string[];
}
