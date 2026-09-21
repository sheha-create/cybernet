import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3001;

dotenv.config({ path: path.join(__dirname, '.env') });
const ABUSEIPDB_API_KEY = process.env.ABUSEIPDB_API_KEY || '';

const dbPath = path.join(__dirname, 'data', 'visits.sqlite');
await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
const db = await open({ filename: dbPath, driver: sqlite3.Database });
await db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    country TEXT,
    city TEXT,
    isp TEXT,
    asn TEXT,
    abuse_score INTEGER,
    latitude REAL,
    longitude REAL,
    timestamp TEXT,
    flagged INTEGER,
    request_path TEXT,
    user_agent TEXT
  )
`);

if (!ABUSEIPDB_API_KEY) {
  console.warn('Warning: AbuseIPDB API key not found in .env');
}

function getSystemMetrics() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();

  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const cpuUsage = 100 - Math.floor((idle / total) * 100);
  const usedMem = totalMem - freeMem;
  const memUsage = Math.round((usedMem / totalMem) * 100);

  let storageUsage = 50;
  try {
    if (process.platform === 'win32') {
      const output = execSync('wmic logicaldisk get size,freespace', { encoding: 'utf8' });
      const lines = output.split('\n').filter(line => line.trim());
      if (lines.length > 1) {
        const parts = lines[1].trim().split(/\s+/);
        if (parts.length >= 2) {
          const total = Number(parts[0]);
          const free = Number(parts[1]);
          if (total > 0) {
            storageUsage = Math.round(((total - free) / total) * 100);
          }
        }
      }
    } else {
      const output = execSync('df / | tail -1', { encoding: 'utf8' });
      const parts = output.split(/\s+/);
      if (parts.length >= 5) {
        storageUsage = Number(parts[4]);
      }
    }
  } catch {
    // ignore
  }

  return {
    cpuUsage: Math.max(5, Math.min(99, cpuUsage)),
    memoryUsage: Math.max(5, Math.min(99, memUsage)),
    storageUsage: Math.max(10, Math.min(99, storageUsage)),
    uptime: Math.floor(uptime),
    nodeCount: cpus.length,
    systemHealth: Math.max(60, Math.min(99, 100 - (cpuUsage + memUsage) / 4)),
  };
}

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const devices = [];
  let localIP = 'Unknown';

  for (const [name, addrs] of Object.entries(interfaces)) {
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

function getSystemInfo() {
  return {
    platform: process.platform,
    arch: os.arch(),
    hostname: os.hostname(),
    release: os.release(),
    cpuCount: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    loadavg: os.loadavg(),
  };
}

function getProcesses() {
  const processes = [];
  try {
    let output = '';
    if (process.platform === 'win32') {
      output = execSync('tasklist /v /fo csv | findstr /V "Name" | head -10', {
        encoding: 'utf8',
        shell: 'powershell',
      });
    } else {
      output = execSync('ps aux --sort=-%mem | head -11', { encoding: 'utf8' });
    }

    const lines = output.split('\n').filter(line => line.trim());
    lines.forEach((line, idx) => {
      if (idx > 0 && line.trim()) {
        processes.push({
          id: `proc-${idx}`,
          name: line.split(/\s+/)[1] || 'process',
          pid: idx,
          memory: Math.floor(Math.random() * 200),
        });
      }
    });
  } catch {
    // ignore
  }

  return processes.slice(0, 10);
}

const requestLog = new Map();

function normalizeIp(raw) {
  if (!raw) return '0.0.0.0';
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return String(candidate).split(',')[0].trim().replace(/^::ffff:/, '').replace(/^\[|\]$/g, '') || '0.0.0.0';
}

function cleanupRequests(ip) {
  const window = 60 * 1000;
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(ts => now - ts < window);
  requestLog.set(ip, timestamps);
  return timestamps;
}

function isDatacenterASN(asn, org, usageType) {
  const value = `${asn || ''} ${org || ''} ${usageType || ''}`.toLowerCase();
  return /datacenter|amazon|google|microsoft|digitalocean|cloudflare|linode|hetzner|ovh|vultr|aws|azure|oracle|ibm/.test(value);
}

async function lookupIpData(ip) {
  const geo = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
    signal: AbortSignal.timeout(5000),
  }).then(res => res.ok ? res.json() : {}).catch(() => ({}));

  const abuse = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`, {
    headers: {
      Accept: 'application/json',
      Key: ABUSEIPDB_API_KEY,
    },
    signal: AbortSignal.timeout(5000),
  }).then(res => res.ok ? res.json() : {}).catch(() => ({}));

  const abuseData = abuse?.data || {};
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

const sseClients = new Set();

function broadcast(message) {
  const payload = JSON.stringify(message);

  // Broadcast to WebSockets (backward compatibility)
  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  });

  // Broadcast to SSE clients
  const sseData = `event: ${message.type || 'alert'}\ndata: ${payload}\n\n`;
  sseClients.forEach(res => {
    try {
      res.write(sseData);
    } catch {
      sseClients.delete(res);
    }
  });
}

function buildSeverity(abuseScore, isDatacenter, rateExceeded) {
  if (abuseScore > 80) return 'CRITICAL';
  if (abuseScore > 50 || rateExceeded || isDatacenter) return 'HIGH';
  return 'MED';
}

function detectAlertType(abuseScore, isDatacenter, rateExceeded) {
  if (rateExceeded) return 'Rate Limit Exceeded';
  if (abuseScore > 25) return 'AbuseIPDB';
  if (isDatacenter) return 'Datacenter IP';
  return 'Suspicious IP';
}

app.use(express.json());

app.use(async (req, res, next) => {
  const ip = normalizeIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
  const timestamps = cleanupRequests(ip);
  timestamps.push(Date.now());
  requestLog.set(ip, timestamps);
  const requestRate = timestamps.length;

  const report = await lookupIpData(ip);
  const flagged = report.abuseScore > 25 || requestRate > 20 || report.isDatacenter;

  await db.run(
    'INSERT INTO visits (ip, country, city, isp, asn, abuse_score, latitude, longitude, timestamp, flagged, request_path, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ip,
    report.country,
    report.city,
    report.isp,
    report.asn,
    report.abuseScore,
    report.latitude,
    report.longitude,
    new Date().toISOString(),
    flagged ? 1 : 0,
    req.originalUrl,
    req.headers['user-agent'] || ''
  );

  if (flagged) {
    broadcast({
      type: 'alert',
      severity: buildSeverity(report.abuseScore, report.isDatacenter, requestRate > 20),
      alertType: detectAlertType(report.abuseScore, report.isDatacenter, requestRate > 20),
      sourceIP: ip,
      country: report.country,
      isp: report.isp,
      abuseScore: report.abuseScore,
      port: req.socket.remotePort || 0,
      timestamp: new Date().toISOString(),
      live: true,
    });
  }

  next();
});

app.use(express.static(path.join(__dirname, 'dist')));

app.post('/api/lookup/:ip', async (req, res) => {
  const ip = String(req.params.ip || '').replace(/^::ffff:/, '').trim();
  if (!ip) {
    return res.status(400).json({ error: 'IP address required' });
  }

  const report = await lookupIpData(ip);
  return res.json({
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
});

app.get('/api/visits', async (_req, res) => {
  const rows = await db.all(
    'SELECT id, ip, country, city, isp, asn, abuse_score AS abuseScore, latitude, longitude, timestamp, flagged FROM visits ORDER BY timestamp DESC LIMIT 200'
  );
  res.json(rows.map(row => ({
    ...row,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    flagged: Boolean(row.flagged),
  })));
});

app.get('/api/stats', async (_req, res) => {
  const total = await db.get('SELECT COUNT(*) AS count FROM visits');
  const uniqueIPs = await db.get('SELECT COUNT(DISTINCT ip) AS count FROM visits');
  const flagged = await db.get('SELECT COUNT(*) AS count FROM visits WHERE flagged = 1');
  const topCountries = await db.all(
    'SELECT country, COUNT(*) AS count FROM visits GROUP BY country ORDER BY count DESC LIMIT 5'
  );

  res.json({
    totalVisits: total?.count || 0,
    uniqueIps: uniqueIPs?.count || 0,
    flaggedCount: flagged?.count || 0,
    topCountries: topCountries.map(item => ({ country: item.country || 'Unknown', count: item.count })),
  });
});

app.get('/api/system/metrics', (req, res) => {
  res.json(getSystemMetrics());
});

app.get('/api/system/info', (req, res) => {
  res.json(getSystemInfo());
});

app.get('/api/network/info', (req, res) => {
  res.json(getNetworkInfo());
});

app.get('/api/network/devices', (req, res) => {
  res.json(getNetworkInfo().interfaces);
});

app.get('/api/processes', (req, res) => {
  res.json(getProcesses());
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    ...getSystemMetrics(),
  });
});

app.get('/api/alerts', async (_req, res) => {
  const rows = await db.all(
    'SELECT id, ip, country, city, isp, asn, abuse_score AS abuseScore, latitude, longitude, timestamp, flagged FROM visits WHERE flagged = 1 ORDER BY timestamp DESC LIMIT 100'
  );
  res.json(rows.map(row => ({
    ...row,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    flagged: Boolean(row.flagged),
  })));
});

app.get(['/sse/metrics', '/api/sse/metrics'], (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial metrics immediately
  const initialData = {
    type: 'metrics',
    timestamp: new Date().toISOString(),
    ...getSystemMetrics(),
  };
  res.write(`event: metrics\ndata: ${JSON.stringify(initialData)}\n\n`);

  sseClients.add(res);

  const interval = setInterval(() => {
    try {
      const data = {
        type: 'metrics',
        timestamp: new Date().toISOString(),
        ...getSystemMetrics(),
      };
      res.write(`event: metrics\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clearInterval(interval);
      sseClients.delete(res);
    }
  }, 3000);

  req.on('close', () => {
    clearInterval(interval);
    sseClients.delete(res);
  });
});

// SPA fallback - serve index.html for all unmatched routes
if (process.env.NODE_ENV !== 'production') {
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/sse')) return next();
    return res.redirect(`http://localhost:5173${req.originalUrl}`);
  });
} else {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// ─── WebSocket Real-time Updates ──────────────────────────────────

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send metrics every 3 seconds
  const interval = setInterval(() => {
    try {
      const data = {
        type: 'metrics',
        timestamp: new Date(),
        ...getSystemMetrics(),
      };
      ws.send(JSON.stringify(data));
    } catch (err) {
      console.error('WebSocket send error:', err);
    }
  }, 3000);

  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    clearInterval(interval);
  });
});

// ─── Start Server ─────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║        CYBERNET System Monitor             ║
║        Server Running                      ║
╚════════════════════════════════════════════╝

📊 Web Interface:  http://localhost:${PORT}/
🔌 WebSocket:     ws://localhost:${PORT}/
🖥  System:       ${os.hostname()}
📡 Platform:      ${process.platform} ${os.arch()}
💻 CPUs:          ${os.cpus().length}x ${os.cpus()[0].model}

API Endpoints:
  GET /api/health           - System health status
  GET /api/system/metrics   - CPU/Memory/Storage stats
  GET /api/system/info      - System information
  GET /api/network/info     - Network interfaces
  GET /api/network/devices  - Connected devices
  GET /api/processes        - Running processes

  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down gracefully...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});
