export type ThreatLevel = 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
export type DeviceStatus = 'secured' | 'at-risk' | 'isolated';
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
  hostname: string;
  os: OSType;
  macPrefix: string;
  lastSeen: Date;
  status: DeviceStatus;
  connectionHistory: number[]; // last 20 connection counts
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
  time: string; // HH:MM
  dataIn: number;
  dataOut: number;
  latency: number;
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
