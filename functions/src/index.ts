import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import os from 'os';
import { execSync } from 'child_process';

admin.initializeApp();

type Metrics = {
  cpuUsage: number;
  memoryUsage: number;
  storageUsage: number;
  uptime: number;
  nodeCount: number;
  systemHealth: number;
};

function getSystemMetrics(): Metrics {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();

  let totalIdle = 0;
  let totalTick = 0;
  cpus.forEach((cpu) => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const cpuUsage = 100 - ~~(100 * (idle as number) / (total as number));

  const usedMem = totalMem - freeMem;
  const memUsage = Math.round((usedMem / totalMem) * 100);

  let storageUsage = 50;
  try {
    if (process.platform === 'win32') {
      const output = execSync('wmic logicaldisk get size,freespace', { encoding: 'utf8' });
      const lines = output.split('\n').filter((l) => l.trim());
      if (lines.length > 1) {
        const parts = lines[1].trim().split(/\s+/);
        if (parts.length >= 2) {
          const total = parseInt(parts[0]);
          const free = parseInt(parts[1]);
          if (total > 0) storageUsage = Math.round(((total - free) / total) * 100);
        }
      }
    } else {
      const output = execSync('df / | tail -1', { encoding: 'utf8' });
      const parts = output.split(/\s+/);
      if (parts.length >= 5) storageUsage = parseInt(parts[4]);
    }
  } catch {
    // keep default
  }

  return {
    cpuUsage: Math.max(5, Math.min(99, cpuUsage)),
    memoryUsage: memUsage,
    storageUsage: Math.max(40, Math.min(95, storageUsage)),
    uptime: Math.floor(uptime),
    nodeCount: cpus.length,
    systemHealth: Math.max(60, 100 - (cpuUsage + memUsage) / 4),
  };
}

async function requireAuth(req: functions.https.Request): Promise<admin.auth.DecodedIdToken> {
  const auth = req.headers.authorization;
  let token: string | undefined;

  if (auth && auth.startsWith('Bearer ')) {
    token = auth.substring('Bearer '.length);
  } else if (typeof req.query.token === 'string' && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    throw new functions.https.HttpsError('unauthenticated', 'Missing Bearer or query token');
  }

  return admin.auth().verifyIdToken(token);
}

function isDatacenterASN(asn?: string, org?: string, usageType?: string): boolean {
  const value = `${asn || ''} ${org || ''} ${usageType || ''}`.toLowerCase();
  return /datacenter|amazon|google|microsoft|digitalocean|cloudflare|linode|hetzner|ovh|vultr|aws|azure|oracle|ibm/.test(value);
}

async function lookupIpData(ip: string) {
  const apiKey = process.env.ABUSEIPDB_API_KEY || '';

  const geo: any = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
    signal: AbortSignal.timeout(5000),
  }).then(res => res.ok ? res.json() : {}).catch(() => ({}));

  let abuseData: any = {};
  if (apiKey) {
    const abuse = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`, {
      headers: {
        Accept: 'application/json',
        Key: apiKey,
      },
      signal: AbortSignal.timeout(5000),
    }).then(res => res.ok ? res.json() : {}).catch(() => ({}));
    abuseData = (abuse as any)?.data || {};
  }

  const abuseScore = Number(abuseData.abuseConfidenceScore || 0);
  const country = geo.country_name || geo.country || 'Unknown';
  const city = geo.city || 'Unknown';
  const isp = geo.org || geo.isp || 'Unknown';
  const asn = geo.asn || abuseData.asn || '';
  const latitude = geo.latitude != null ? Number(geo.latitude) : null;
  const longitude = geo.longitude != null ? Number(geo.longitude) : null;
  const usageType = abuseData.usageType || geo.org || 'Unknown';
  const isDataCenter = isDatacenterASN(asn, isp, usageType);

  return {
    ip,
    country,
    city,
    isp,
    asn,
    abuseScore,
    totalReports: Number(abuseData.totalReports || 0),
    latitude,
    longitude,
    usageType,
    isVPN: Boolean(abuseData.isVpn || abuseData.isVPN),
    isProxy: Boolean(abuseData.isProxy || abuseData.is_proxy),
    isBogon: Boolean(abuseData.isBogon),
    isDatacenter: isDataCenter,
    isResidential: Boolean(String(usageType).toLowerCase().includes('residential')),
    isMobile: Boolean(abuseData.isMobile),
  };
}

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const devices: any[] = [];
  let localIP = 'Unknown';

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        localIP = addr.address;
        devices.push({
          id: `iface-${name}`,
          hostname: name,
          ip: addr.address,
          mac: addr.mac,
          os: 'router',
          status: 'secured',
          lastSeen: new Date(),
        });
      }
    }
  }

  return { localIP, interfaces: devices };
}

function getProcesses() {
  return [
    { id: 'proc-1', name: 'node', pid: 1, memory: 42 },
    { id: 'proc-2', name: 'firebase-functions', pid: 2, memory: 65 },
    { id: 'proc-3', name: 'systemd', pid: 3, memory: 18 },
  ];
}

export const api = functions.https.onRequest(async (req, res) => {
  try {
    // Enable CORS headers for Cloud Function direct calls
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    await requireAuth(req);

    const path = req.path;

    // IP Lookup endpoint (supports /api/lookup/:ip or /lookup/:ip)
    const lookupMatch = path.match(/\/(?:api\/)?lookup\/(.+)$/);
    if (lookupMatch) {
      const ip = decodeURIComponent(lookupMatch[1]).replace(/^::ffff:/, '').trim();
      if (!ip) {
        res.status(400).json({ error: 'IP address required' });
        return;
      }
      const report = await lookupIpData(ip);
      res.json({
        ip: report.ip,
        country_name: report.country,
        city: report.city,
        org: report.isp,
        asn: report.asn,
        timezone: report.usageType,
        latitude: report.latitude,
        longitude: report.longitude,
        abuseScore: report.abuseScore,
        totalReports: report.totalReports,
        usageType: report.usageType,
        isVPN: report.isVPN,
        isProxy: report.isProxy,
        isBogon: report.isBogon,
        isDatacenter: report.isDatacenter,
        isResidential: report.isResidential,
        isMobile: report.isMobile,
        threatTypes: [
          report.abuseScore > 75 ? 'High Risk' : report.abuseScore > 50 ? 'Elevated Risk' : report.abuseScore > 25 ? 'Flagged' : 'Clean',
          report.isVPN ? 'VPN' : null,
          report.isProxy ? 'Proxy' : null,
          report.isDatacenter ? 'Datacenter' : null,
        ].filter(Boolean),
      });
      return;
    }

    if (path.endsWith('/api/health') || path.endsWith('/health')) {
      const metrics = getSystemMetrics();
      res.json({ status: 'ok', timestamp: new Date().toISOString(), ...metrics });
      return;
    }

    if (path.endsWith('/api/system/metrics') || path.endsWith('/system/metrics')) {
      res.json(getSystemMetrics());
      return;
    }

    if (path.endsWith('/api/system/info') || path.endsWith('/system/info')) {
      res.json({
        platform: process.platform,
        arch: os.arch(),
        hostname: os.hostname(),
        release: os.release(),
        cpuCount: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
        loadavg: (os as any).loadavg ? (os as any).loadavg() : [0, 0, 0],
      });
      return;
    }

    if (path.endsWith('/api/network/info') || path.endsWith('/network/info')) {
      res.json(getNetworkInfo());
      return;
    }

    if (path.endsWith('/api/network/devices') || path.endsWith('/network/devices')) {
      res.json(getNetworkInfo().interfaces);
      return;
    }

    if (path.endsWith('/api/processes') || path.endsWith('/processes')) {
      res.json(getProcesses());
      return;
    }

    if (path.endsWith('/api/visits') || path.endsWith('/visits')) {
      try {
        const snapshot = await admin.firestore().collection('visits').orderBy('timestamp', 'desc').limit(200).get();
        const visits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(visits);
      } catch {
        res.json([]);
      }
      return;
    }

    if (path.endsWith('/api/stats') || path.endsWith('/stats')) {
      try {
        const snapshot = await admin.firestore().collection('visits').limit(500).get();
        const docs = snapshot.docs.map(d => d.data());
        const totalVisits = docs.length;
        const uniqueIps = new Set(docs.map(d => d.ip)).size;
        const flaggedCount = docs.filter(d => d.flagged).length;
        const countryCounts: Record<string, number> = {};
        docs.forEach(d => {
          const c = d.country || 'Unknown';
          countryCounts[c] = (countryCounts[c] || 0) + 1;
        });
        const topCountries = Object.entries(countryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([country, count]) => ({ country, count }));

        res.json({ totalVisits, uniqueIps, flaggedCount, topCountries });
      } catch {
        res.json({ totalVisits: 0, uniqueIps: 0, flaggedCount: 0, topCountries: [] });
      }
      return;
    }

    if (path.endsWith('/api/alerts') || path.endsWith('/alerts')) {
      try {
        const snapshot = await admin.firestore().collection('visits').where('flagged', '==', 1).orderBy('timestamp', 'desc').limit(100).get();
        const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(alerts);
      } catch {
        res.json([]);
      }
      return;
    }

    res.status(404).json({ error: 'Not found' });
  } catch (e: any) {
    const status = e?.code === 'unauthenticated' ? 401 : 403;
    res.status(status).json({ error: e?.message ?? 'Auth/route error' });
  }
});

export const sse = functions.https.onRequest(async (req, res) => {
  try {
    await requireAuth(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial metrics immediately
    const initialData = {
      type: 'metrics',
      timestamp: new Date().toISOString(),
      ...getSystemMetrics(),
    };
    res.write(`event: metrics\n`);
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);

    const interval = setInterval(() => {
      const data = {
        type: 'metrics',
        timestamp: new Date().toISOString(),
        ...getSystemMetrics(),
      };
      res.write(`event: metrics\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }, 3000);

    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  } catch (e: any) {
    res.status(401).end();
  }
});

