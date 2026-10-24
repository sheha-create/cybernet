import express from 'express';
import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { execFile, execFileSync, spawn } from 'child_process';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT || 3001);
const REQUEST_RATE_LIMIT = Number(process.env.REQUEST_RATE_LIMIT || 30);
const EVENT_RETENTION_DAYS = Number(process.env.EVENT_RETENTION_DAYS || 30);
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'logs');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'security-events.sqlite');

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be a valid TCP port');

await fs.promises.mkdir(path.dirname(DB_PATH), { recursive: true });
await fs.promises.mkdir(LOG_DIR, { recursive: true });

// The NDJSON stream is an append-only audit log; nothing reads it back (SQLite is
// the source of truth for queries). On Railway the container filesystem is only
// 1 GB, so an uncapped stream would fill the disk and get the service killed.
// It is therefore size-bounded and keeps a single rotated generation.
const LOG_FILE = path.join(LOG_DIR, 'security-events.ndjson');
const LOG_MAX_BYTES = Number(process.env.LOG_MAX_BYTES || 5 * 1024 * 1024);
let logBytes = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0;
let logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
logStream.on('error', error => process.stderr.write(`log stream error: ${error.message}\n`));

let rotating = false;
async function rotateLogIfNeeded() {
  if (rotating || logBytes < LOG_MAX_BYTES) return;
  rotating = true;
  const previous = logStream;
  try {
    await new Promise(resolve => previous.end(resolve));
    await fs.promises.rm(`${LOG_FILE}.1`, { force: true });
    await fs.promises.rename(LOG_FILE, `${LOG_FILE}.1`);
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    logStream.on('error', error => process.stderr.write(`log stream error: ${error.message}\n`));
    logBytes = 0;
  } catch (error) {
    // Never let logging failure take the service down.
    process.stderr.write(`log rotation failed: ${error.message}\n`);
  } finally {
    rotating = false;
  }
}

function log(level, event, details = {}) {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...details });
  process.stdout.write(`${entry}\n`);
  const line = `${entry}\n`;
  logBytes += Buffer.byteLength(line);
  logStream.write(line);
  if (logBytes >= LOG_MAX_BYTES) void rotateLogIfNeeded();
}

// Firebase Admin for token verification
let firebaseAdminAuth = null;

function readServiceAccount() {
  // A private key contains real newlines, which do not survive a plain environment
  // variable on most platforms. Base64 is the reliable form for deployed runtimes.
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (encoded) {
    try {
      return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch (error) {
      log('warn', 'service_account_base64_invalid', { message: error.message });
    }
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // The normal case: a JSON document whose newlines are already "\n" escapes.
    return JSON.parse(raw);
  } catch {
    // Fallback for runtimes that delivered the key with real newlines inside the
    // string literal, which is what a naive env var often produces.
    return JSON.parse(raw.replace(/\n/g, '\\n'));
  }
}

try {
  const serviceAccount = readServiceAccount();
  if (serviceAccount) {
    const adminApp = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
    firebaseAdminAuth = getAuth(adminApp);
  } else {
    log('warn', 'firebase_admin_not_configured', {
      message: 'Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_BASE64. Agent tokens will be rejected until then.',
    });
  }
} catch (e) {
  log('warn', 'firebase_admin_init_failed', { message: String(e) });
}

const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
await db.exec(`
  CREATE TABLE IF NOT EXISTS security_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_ip TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    request_path TEXT NOT NULL,
    request_method TEXT NOT NULL,
    target_port INTEGER,
    request_count INTEGER NOT NULL DEFAULT 1,
    details TEXT NOT NULL DEFAULT '{}',
    timestamp TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS security_events_timestamp_idx ON security_events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS security_events_source_ip_idx ON security_events(source_ip, timestamp DESC);
`);
// Migration: add user_id column if it doesn't exist
try {
  await db.exec('ALTER TABLE security_events ADD COLUMN user_id TEXT');
} catch (e) {
  // Column already exists, ignore
}
try {
  await db.exec('CREATE INDEX IF NOT EXISTS security_events_user_id_idx ON security_events(user_id, timestamp DESC)');
} catch (e) {
  // Index already exists or column doesn't exist
}

await db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    revoked_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS agents_token_hash_idx ON agents(token_hash);
  CREATE INDEX IF NOT EXISTS agents_user_id_idx ON agents(user_id);
`);

await db.exec(`
  CREATE TABLE IF NOT EXISTS agent_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    hostname TEXT,
    platform TEXT,
    cpu_usage REAL,
    cpu_cores TEXT,
    cpu_model TEXT,
    memory_usage REAL,
    total_memory_bytes INTEGER,
    free_memory_bytes INTEGER,
    storage_usage REAL,
    uptime_seconds INTEGER,
    network_in_bps REAL,
    network_out_bps REAL,
    primary_ip TEXT,
    interface_count INTEGER,
    local_ips TEXT,
    os_release TEXT,
    listening_ports TEXT,
    firewall TEXT,
    observed_at TEXT NOT NULL,
    received_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS agent_samples_agent_idx ON agent_samples(agent_id, received_at DESC);
  CREATE INDEX IF NOT EXISTS agent_samples_user_idx ON agent_samples(user_id, received_at DESC);
`);

for (const [column, definition] of [
  ['os_release', 'TEXT'],
  ['listening_ports', 'TEXT'],
  ['firewall', 'TEXT'],
]) {
  try {
    await db.exec(`ALTER TABLE agent_samples ADD COLUMN ${column} ${definition}`);
  } catch {
    // Column already present.
  }
}

// Middleware to extract the Firebase user from the ID token on the request.
// It never invents a user: an absent, malformed or unverifiable token leaves
// req.user as null, and every data route rejects that with 401.
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  if (!firebaseAdminAuth) {
    log('warn', 'auth_unavailable', {
      message: 'Cannot verify ID tokens because the Firebase Admin service account is not loaded.',
    });
    req.user = null;
    return next();
  }

  try {
    const decoded = await firebaseAdminAuth.verifyIdToken(authHeader.slice('Bearer '.length));
    req.user = { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    req.user = null;
  }
  next();
}

function normalizeIp(raw) {
  if (!raw) return '0.0.0.0';
  const value = Array.isArray(raw) ? raw[0] : raw;
  let cleaned = String(value).split(',')[0].trim();

  // Bracketed IPv6 from a Host header, e.g. [::1]:3001
  const bracketed = cleaned.match(/^\[(.+)\](?::\d+)?$/);
  if (bracketed) cleaned = bracketed[1];
  cleaned = cleaned.replace(/^\[|\]$/g, '');

  if (!cleaned) return '0.0.0.0';

  // Drop a zone identifier such as fe80::1%eth0.
  const zone = cleaned.indexOf('%');
  if (zone !== -1) cleaned = cleaned.slice(0, zone);

  // A v4-mapped address genuinely denotes the same host, so collapse it to IPv4 to
  // avoid recording the same machine twice. Real IPv6 (including ::1) is kept as-is so
  // the connection family stays visible instead of being hidden behind IPv4.
  const mapped = cleaned.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped && isValidIpv4(mapped[1])) return mapped[1];

  return cleaned.toLowerCase();
}

function isLoopback(ip) {
  const value = String(ip).toLowerCase();
  if (value === '127.0.0.1' || value === '::1' || value === 'localhost') return true;
  if (/^127\./.test(value)) return true;
  const expanded = expandIPv6Address(value);
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
  return false;
}

function isTelemetryRequest(req) {
  return req.path === '/api/health'
    || req.path === '/api/system/metrics'
    || req.path === '/api/stats'
    || req.path === '/api/visits'
    || req.path === '/api/heatmap'
    || req.path === '/api/user/ip'
    || req.path === '/api/host'
    || req.path === '/api/threats/geo'
    || req.path === '/api/ip/intel'
    || req.path === '/api/scan/analyze'
    || req.path.startsWith('/api/agent/')
    || req.path.startsWith('/sse/');
}

function getWindow(ip) {
  const now = Date.now();
  const timestamps = (requestWindows.get(ip) || []).filter(timestamp => now - timestamp < 60_000);
  timestamps.push(now);
  requestWindows.set(ip, timestamps);
  return timestamps.length;
}

const app = express();
const server = http.createServer(app);
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true');

// ---------------------------------------------------------------------------
// CORS
//
// Needed when the frontend is hosted separately from this API, which is the
// normal arrangement on container platforms that only serve the API. Every data
// route still requires a Firebase ID token or an agent token, so this does not
// weaken access control; it only lets a browser on another origin make the call.
//
// ALLOWED_ORIGINS accepts a comma-separated allowlist. Leaving it unset allows
// any origin, which is acceptable here only because token verification is
// mandatory on every data route.
// ---------------------------------------------------------------------------
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const sseClients = new Set();
const requestWindows = new Map();
// Tracked so shutdown can drain them; Cloud Run only allows ~10s after SIGTERM.
const openSockets = new Set();
const backgroundIntervals = new Set();
// Configurable because Railway meters egress at $0.05/GB; the Free plan includes
// only $1/month. 5s is the default, raising it reduces stream volume proportionally.
const SSE_METRICS_INTERVAL_MS = Math.max(1_000, Number(process.env.SSE_METRICS_INTERVAL_MS || 5_000));
const SSE_HEARTBEAT_MS = 20_000;
let previousCpuCores = null;
let previousNetworkSample = null;

server.on('connection', socket => {
  openSockets.add(socket);
  socket.on('close', () => openSockets.delete(socket));
});

function getCpuCores() {
  return os.cpus().map(cpu => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return { idle: cpu.times.idle, total };
  });
}

function getCpuUsage() {
  const cores = getCpuCores();
  const aggregate = cores.reduce((acc, core) => ({ idle: acc.idle + core.idle, total: acc.total + core.total }), { idle: 0, total: 0 });

  if (!previousCpuCores) {
    previousCpuCores = { cores, aggregate };
    return { usage: 0, perCore: cores.map(() => 0), model: os.cpus()[0]?.model?.trim() ?? 'Unknown' };
  }

  const previous = previousCpuCores;
  previousCpuCores = { cores, aggregate };

  const perCore = cores.map((core, index) => {
    const before = previous.cores[index];
    if (!before) return 0;
    const totalDelta = core.total - before.total;
    const idleDelta = core.idle - before.idle;
    return totalDelta > 0 ? Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100))) : 0;
  });

  const totalDelta = aggregate.total - previous.aggregate.total;
  const idleDelta = aggregate.idle - previous.aggregate.idle;
  const usage = totalDelta > 0 ? Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100))) : 0;

  return { usage, perCore, model: os.cpus()[0]?.model?.trim() ?? 'Unknown' };
}

function getStorageUsage() {
  try {
    const stats = fs.statfsSync(path.parse(process.cwd()).root);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const available = Number(stats.bavail) * Number(stats.bsize);
    return total > 0 ? Math.round(((total - available) / total) * 100) : null;
  } catch {
    return null;
  }
}

function runCommand(command, args) {
  return new Promise(resolve => {
    execFile(command, args, { encoding: 'utf8', windowsHide: true, timeout: 4_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => resolve(error ? null : stdout));
  });
}

function parseNetstatE(output) {
  if (!output) return null;
  const line = output.split(/\r?\n/).find(l => /^\s*Bytes\s+\d+\s+\d+\s*$/i.test(l));
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  const received = Number(parts[1]);
  const sent = Number(parts[2]);
  if (!Number.isFinite(received) || !Number.isFinite(sent)) return null;
  return { received, sent };
}

function parseNetstatIo(output) {
  if (!output) return null;
  let received = 0;
  let sent = 0;
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*\S+\s+\S+\s+(\d+)\s+(\d+)\s+/);
    if (!match) continue;
    received += Number(match[1]);
    sent += Number(match[2]);
  }
  return received || sent ? { received, sent } : null;
}

/**
 * Reads cumulative interface byte counters. Never blocks the event loop:
 * Windows uses `netstat -e` (about 40ms) instead of spawning PowerShell
 * (about 2900ms), and the result is cached so repeated metric reads are free.
 */
let networkCountersCache = { value: null, at: 0 };
let networkCountersPending = null;
const NETWORK_COUNTERS_TTL_MS = 2_000;

async function readNetworkCounters() {
  const now = Date.now();
  if (now - networkCountersCache.at < NETWORK_COUNTERS_TTL_MS) return networkCountersCache.value;
  if (networkCountersPending) return networkCountersPending;

  networkCountersPending = (async () => {
    try {
      if (process.platform === 'linux') {
        return fs.readdirSync('/sys/class/net').reduce((totals, iface) => {
          const base = path.join('/sys/class/net', iface, 'statistics');
          return {
            received: totals.received + Number(fs.readFileSync(path.join(base, 'rx_bytes'), 'utf8')),
            sent: totals.sent + Number(fs.readFileSync(path.join(base, 'tx_bytes'), 'utf8')),
          };
        }, { received: 0, sent: 0 });
      }
      if (process.platform === 'win32') {
        return parseNetstatE(await runCommand('netstat', ['-e']));
      }
      if (process.platform === 'darwin') {
        return parseNetstatIo(await runCommand('netstat', ['-ibn']));
      }
      return null;
    } catch (error) {
      log('warn', 'network_counter_unavailable', { message: error instanceof Error ? error.message : String(error) });
      return null;
    }
  })()
    .then(value => {
      networkCountersCache = { value, at: Date.now() };
      return value;
    })
    .finally(() => { networkCountersPending = null; });

  return networkCountersPending;
}

function getNetworkRatesFrom(counters) {
  const now = Date.now();
  if (!counters || !previousNetworkSample) {
    previousNetworkSample = counters ? { ...counters, timestamp: now } : null;
    return { networkInBps: 0, networkOutBps: 0, networkAvailable: Boolean(counters) };
  }
  const elapsedSeconds = (now - previousNetworkSample.timestamp) / 1000;
  const networkInBps = elapsedSeconds > 0 ? Math.max(0, Math.round((counters.received - previousNetworkSample.received) / elapsedSeconds)) : 0;
  const networkOutBps = elapsedSeconds > 0 ? Math.max(0, Math.round((counters.sent - previousNetworkSample.sent) / elapsedSeconds)) : 0;
  previousNetworkSample = { ...counters, timestamp: now };
  return { networkInBps, networkOutBps, networkAvailable: true };
}

function getNetworkRates(counters) {
  return getNetworkRatesFrom(counters);
}

function getSystemMetrics(networkCounters) {
  const totalMemory = os.totalmem();
  const memoryUsage = totalMemory > 0 ? Math.round(((totalMemory - os.freemem()) / totalMemory) * 100) : 0;
  const cpu = getCpuUsage();
  const storageUsage = getStorageUsage();
  // Counts externally-bound addresses in both families, so IPv6-only or
  // dual-stack hosts are represented accurately.
  const allAddresses = Object.values(os.networkInterfaces()).flat()
    .filter(address => address && !address.internal);
  const interfaces = allAddresses.filter(address => address.family === 'IPv4');
  const ipv6Addresses = allAddresses.filter(address => address.family === 'IPv6');
  const healthFactors = [cpu.usage, memoryUsage, storageUsage].filter(value => value !== null);
  const systemHealth = healthFactors.length ? Math.max(0, Math.round(100 - healthFactors.reduce((sum, value) => sum + value, 0) / healthFactors.length)) : null;
  return {
    ipv4Count: interfaces.length,
    ipv6Count: ipv6Addresses.length,
    cpuUsage: cpu.usage,
    cpuCores: cpu.perCore,
    cpuModel: cpu.model,
    memoryUsage,
    totalMemoryBytes: totalMemory,
    freeMemoryBytes: os.freemem(),
    storageUsage,
    uptime: Math.floor(os.uptime()),
    nodeCount: interfaces.length,
    systemHealth,
    ...getNetworkRates(networkCounters),
  };
}

function getNetworkInfo() {
  const interfaces = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      interfaces.push({
        id: `interface-${name}-${address.family}-${address.address}`,
        name,
        ip: address.address,
        mac: address.mac || null,
        netmask: address.netmask,
        family: address.family,
        internal: Boolean(address.internal),
        cidr: address.cidr,
      });
    }
  }
  return { hostname: os.hostname(), interfaces };
}

function getHostInfo() {
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    osRelease: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model?.trim() || 'Unknown',
    cpuCores: cpus.length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    uptimeSeconds: Math.floor(os.uptime()),
    loadAverage: os.loadavg(),
    runtimeVersion: process.version,
  };
}

async function recordEvent(event) {
  const timestamp = new Date().toISOString();
  const result = await db.run(
    'INSERT INTO security_events (source_ip, user_id, event_type, severity, request_path, request_method, target_port, request_count, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    event.sourceIP, event.userId || null, event.eventType, event.severity, event.requestPath, event.requestMethod,
    event.targetPort || null, event.requestCount || 1, JSON.stringify(event.details || {}), timestamp,
  );
  const payload = { id: result.lastID, timestamp, live: true, ...event };
  log('warn', 'security_event', payload);
  broadcast('alert', payload);
}

function detectionForRequest(req, requestCount, options = {}) {
  const { allowRateLimit = true } = options;
  const requestPath = decodeURIComponent(req.originalUrl || req.path).toLowerCase();
  const sourceIP = normalizeIp(req.ip || req.socket.remoteAddress);
  const common = { sourceIP, requestPath: req.originalUrl || req.path, requestMethod: req.method, targetPort: req.socket.localPort };

  // Signature matches are treated as hostile no matter where they originate, so they
  // are still recorded when the request arrives over loopback.
  if (/\.\.(?:%2f|\/|\\)|%2e%2e|\/etc\/passwd|\\windows\\system32/.test(requestPath)) {
    return { ...common, eventType: 'Path traversal attempt', severity: 'HIGH', details: { detector: 'path-traversal' } };
  }
  if (/(?:union(?:\s|%20)+select|<script|%3cscript|(?:\bor\b|%20or%20)\s+['\"]?1['\"]?\s*=\s*['\"]?1|cmd\.exe|\/bin\/sh)/.test(requestPath)) {
    return { ...common, eventType: 'Injection signature', severity: 'HIGH', details: { detector: 'request-signature' } };
  }

  // Volume-based detection is skipped for loopback, because the dashboard's own
  // page and asset requests would otherwise register as a flood.
  if (allowRateLimit && requestCount >= REQUEST_RATE_LIMIT && (requestCount === REQUEST_RATE_LIMIT || requestCount % 10 === 0)) {
    return { ...common, eventType: 'Request rate threshold exceeded', severity: requestCount >= REQUEST_RATE_LIMIT * 2 ? 'HIGH' : 'MED', requestCount, details: { detector: 'rate-limit', windowSeconds: 60, threshold: REQUEST_RATE_LIMIT } };
  }
  return null;
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(authenticateUser);

app.use(async (req, _res, next) => {
  if (isTelemetryRequest(req)) return next();
  const sourceIP = normalizeIp(req.ip || req.socket.remoteAddress);
  const loopback = isLoopback(sourceIP);
  try {
    const event = detectionForRequest(req, loopback ? 0 : getWindow(sourceIP), { allowRateLimit: !loopback });
    if (event) {
      event.userId = req.user?.uid ?? null;
      if (loopback) event.details = { ...event.details, viaLoopback: true };
      await recordEvent(event);
    }
  } catch (error) {
    log('error', 'detector_failure', { message: error instanceof Error ? error.message : String(error), path: req.path });
  }
  next();
});

function getUserIp(req) {
  return normalizeIp(req.ip || req.socket.remoteAddress);
}

function buildUserFilter(req) {
  const userIp = getUserIp(req);
  const userId = req.user?.uid;
  const conditions = [];
  const params = [];
  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  } else {
    conditions.push('source_ip = ?');
    params.push(userIp);
  }
  return { where: conditions.join(' OR '), params };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

app.get('/api/system/metrics', requireAuth, async (_req, res) => res.json(getSystemMetrics(await readNetworkCounters())));
app.get('/api/network/info', requireAuth, (_req, res) => res.json(getNetworkInfo()));
app.get('/api/network/devices', requireAuth, (_req, res) => res.json(getNetworkInfo().interfaces));
app.get('/api/host', requireAuth, (_req, res) => res.json(getHostInfo()));
app.get(['/api/user/ip', '/api/my-ip'], requireAuth, (req, res) => {
  const ip = getUserIp(req);
  res.json({
    ip,
    family: addressFamily(ip),
    loopback: isLoopback(ip),
    // When the app is served over IPv6 the socket peer is an IPv6 address, which is
    // reported verbatim rather than collapsed to IPv4.
    remoteAddress: req.socket.remoteAddress ?? null,
    localPort: req.socket.localPort ?? null,
    timestamp: new Date().toISOString(),
  });
});
app.get('/api/health', async (_req, res) => {
  const database = await db.get('SELECT 1 AS ready');
  res.status(database?.ready ? 200 : 503).json({ status: database?.ready ? 'ok' : 'degraded', timestamp: new Date().toISOString() });
});

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return `cyb_${crypto.randomBytes(24).toString('hex')}`;
}

const AGENT_MAX_INTERVAL_MS = 120_000;

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function clampBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(number, Number.MAX_SAFE_INTEGER);
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed.length ? trimmed : null;
}

function sanitizeCoreArray(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 256).map(clampPercent);
}

function sanitizeIpList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 32)
    .map(entry => sanitizeString(entry, 64))
    .filter(Boolean);
}

function sanitizeListeningPorts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 400)
    .map(entry => {
      const port = Number(entry?.port);
      if (!Number.isInteger(port) || port < 0 || port > 65535) return null;
      return {
        port,
        address: sanitizeString(entry?.address, 64) ?? '0.0.0.0',
        exposed: Boolean(entry?.exposed),
      };
    })
    .filter(Boolean);
}

function sanitizeFirewall(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    supported: Boolean(value.supported),
    enabled: Boolean(value.enabled),
    detail: sanitizeString(value.detail, 300),
  };
}

// ---------------------------------------------------------------------------
// Local collector-agent management.
//
// The agent normally requires two manual steps: paste the token into
// agent/.env, then run `node agent/collector.mjs` by hand. On a locally
// operated deployment the server can do both on the operator's behalf: it
// issues the token through the dashboard, stores the plaintext token in
// agent/.env (the filesystem is the only durable home for it — the database
// knowingly keeps only a salted hash), and spawns the collector as a child
// process. The child is also respawned at boot while a token file exists, so
// `npm run dev` keeps the pipeline running with no operator actions.
// ---------------------------------------------------------------------------

const AGENT_DIR = process.env.AGENT_DIR || path.join(__dirname, 'agent');
const AGENT_ENV_FILE = path.join(AGENT_DIR, '.env');
// Explicit opt-out for managed/cloud setups where spawning a local collector
// is wrong (e.g. the real host is some other machine).
const AGENT_AUTOSTART = process.env.CYBERNET_AGENT_AUTOSTART !== 'false';

let agentChild = null;
let agentRestarts = 0;
const AGENT_TOKEN_KEY = 'CYBERNET_AGENT_TOKEN';
const AGENT_SERVER_URL_KEY = 'CYBERNET_SERVER_URL';

function readAgentEnv() {
  const map = new Map();
  try {
    for (const line of fs.readFileSync(AGENT_ENV_FILE, 'utf8').split(/\r?\n/)) {
      const commentFree = line.trim();
      if (!commentFree || commentFree.startsWith('#')) continue;
      const eq = commentFree.indexOf('=');
      if (eq <= 0) continue;
      map.set(commentFree.slice(0, eq).trim(), commentFree.slice(eq + 1).trim());
    }
  } catch { /* No agent/.env yet — callers handle absence. */ }
  return map;
}

function updateAgentEnvValue(key, value) {
  fs.mkdirSync(AGENT_DIR, { recursive: true });
  const existing = fs.existsSync(AGENT_ENV_FILE)
    ? fs.readFileSync(AGENT_ENV_FILE, 'utf8')
    : `CYBERNET_SERVER_URL=http://127.0.0.1:${PORT}\nCYBERNET_INTERVAL_MS=5000\n`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(existing)
    ? existing.replace(pattern, `${key}=${value}`)
    : `${existing.trimEnd()}\n${key}=${value}\n`;
  fs.writeFileSync(AGENT_ENV_FILE, next, 'utf8');
}

function isCollectorAlive() {
  return Boolean(agentChild && agentChild.exitCode === null && !agentChild.killed);
}

function spawnLocalCollector(reason) {
  if (!AGENT_AUTOSTART) return false;
  if (isCollectorAlive()) return true;
  if (!fs.existsSync(path.join(AGENT_DIR, 'collector.mjs'))) {
    log('warn', 'agent_autostart_missing', { dir: AGENT_DIR });
    return false;
  }
  const env = readAgentEnv();
  if (!env.get(AGENT_TOKEN_KEY)) return false;

  const childEnv = { ...process.env };
  childEnv[AGENT_TOKEN_KEY] = env.get(AGENT_TOKEN_KEY);
  childEnv[AGENT_SERVER_URL_KEY] = env.get(AGENT_SERVER_URL_KEY) || `http://127.0.0.1:${PORT}`;
  if (env.get('CYBERNET_INTERVAL_MS')) childEnv.CYBERNET_INTERVAL_MS = env.get('CYBERNET_INTERVAL_MS');
  childEnv.NODE_ENV = childEnv.NODE_ENV || 'development';

  const child = spawn(process.execPath, ['collector.mjs'], {
    cwd: AGENT_DIR,
    env: childEnv,
    stdio: 'pipe',
    shell: false,
  });
  agentChild = child;
  log('info', 'agent_collector_started', { pid: child.pid, try: agentRestarts, reason });
  // A collector that stays up proves the token works; the crash-restart
  // budget only tracks recovery attempts, so stability re-arms it.
  const stabilizer = setTimeout(() => { if (agentChild === child) agentRestarts = 0; }, 60_000);
  stabilizer.unref();

  child.stdout.on('data', data => process.stdout.write(`[agent] ${String(data)}`));
  child.stderr.on('data', data => process.stderr.write(`[agent] ${String(data)}`));

  child.on('exit', (code, signal) => {
    log(code === 0 ? 'info' : 'warn', 'agent_collector_exited', { code, signal, reason });
    void handleCollectorExit(code, signal);
  });
  return true;
}

// The collector exits when the server rejects its credential ("Agent token
// rejected"). Revoked or stale tokens must not crash-loop: if the stored token
// no longer resolves to a live agent row, drop it from agent/.env and stop.
// Otherwise the exit counts as transient (server hiccup) and is retried with
// a bounded budget that re-arms after a period of stability.
async function handleCollectorExit(code, signal) {
  if (shuttingDown) return;
  const token = readAgentEnv().get(AGENT_TOKEN_KEY);
  if (token) {
    try {
      const live = await db.get(
        'SELECT id FROM agents WHERE token_hash = ? AND revoked_at IS NULL',
        hashToken(token),
      );
      if (!live) {
        updateAgentEnvValue(AGENT_TOKEN_KEY, '');
        log('info', 'agent_disabled_dead_token', { exitCode: code, signal });
        return;
      }
    } catch (error) {
      log('warn', 'agent_token_check_failed', { message: error.message });
    }
  }
  scheduleCollectorRespawn(code);
}

// Respawn with backoff, guarded by a small budget that re-arms once the
// collector proves stability (see spawnLocalCollector's stabilizer timer).
function scheduleCollectorRespawn(code) {
  if (agentRestarts >= 4) {
    log('warn', 'agent_restart_budget_exhausted', { attempts: agentRestarts });
    return;
  }
  agentRestarts += 1;
  const delay = 5_000;
  const timer = setTimeout(() => {
    backgroundIntervals.delete(timer);
    spawnLocalCollector(`restart-after-exit-${code}`);
  }, delay);
  backgroundIntervals.add(timer);
}

/** Issue a token row for `userId` and return { id, label, token, createdAt }. */
async function issueAgentToken(userId, label) {
  const id = crypto.randomUUID();
  const token = generateToken();
  const createdAt = new Date().toISOString();
  try {
    await db.run(
      'INSERT INTO agents (id, user_id, token_hash, label, created_at) VALUES (?, ?, ?, ?, ?)',
      id, userId, hashToken(token), label, createdAt,
    );
  } catch (error) {
    log('error', 'agent_token_issue_failed', { message: error.message });
    return null;
  }
  return { id, label, token, createdAt };
}

async function stopLocalCollector() {
  if (!agentChild || agentChild.exitCode !== null) return;
  const child = agentChild;
  const killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 3_000);
  killTimer.unref();
  child.removeAllListeners('exit');
  child.once('exit', () => log('info', 'agent_collector_stopped', { pid: child.pid }));
  try { child.kill('SIGTERM'); } catch { /* already gone */ }
  agentChild = null;
}

app.get('/api/agent/status', requireAuth, async (req, res) => {
  const latest = await db.get(
    'SELECT MAX(last_seen_at) AS lastSeenAt, COUNT(*) AS tokens FROM agents WHERE user_id = ? AND revoked_at IS NULL',
    req.user.uid,
  );
  const lastSeenAt = latest?.lastSeenAt ?? null;
  res.json({
    collector: isCollectorAlive(),
    agentEnabled: AGENT_AUTOSTART,
    lastSeenAt,
    fresh: Boolean(lastSeenAt) && Date.now() - Date.parse(lastSeenAt) < 30_000,
    activeTokens: latest?.tokens ?? 0,
  });
});

// One-stop onboarding: issue a token for this account, store it in the local
// agent/.env, and start the collector immediately. The previous token found in
// agent/.env is revoked first, because its plaintext is being replaced and a
// stale-but-valid token would be a pointless live credential.
app.post('/api/agent/start', requireAuth, async (req, res) => {
  const label = sanitizeString(req.body?.label, 60) ?? 'My PC';
  const previousEnv = readAgentEnv();
  const previousToken = previousEnv.get(AGENT_TOKEN_KEY);

  // Revoke any token that is currently sitting in agent/.env.
  if (previousToken) {
    try {
      await db.run(
        'UPDATE agents SET revoked_at = ? WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL',
        new Date().toISOString(), req.user.uid, hashToken(previousToken),
      );
    } catch (error) {
      log('error', 'agent_prior_revoke_failed', { message: error.message });
    }
  }
  // The fallback copy/paste path (used when the server cannot spawn the
  // collector, e.g. another machine) stays manual: the response carries the
  // plaintext token so the client can show it exactly once.
  const issued = await issueAgentToken(req.user.uid, label);
  if (!issued) return res.status(500).json({ error: 'Could not issue agent token' });
  updateAgentEnvValue('CYBERNET_AGENT_TOKEN', issued.token);
  updateAgentEnvValue('CYBERNET_SERVER_URL', `http://127.0.0.1:${PORT}`);
  await stopLocalCollector();
  const started = spawnLocalCollector('dashboard-start');
  res.status(201).json({
    agentId: issued.id,
    started,
    // Presented only when no local collector could be launched.
    token: started ? null : issued.token,
    agentEnvFile: AGENT_ENV_FILE,
    createdAt: issued.createdAt,
  });
});

app.get('/api/agent/list', requireAuth, async (req, res) => {
  const agents = await db.all(
    'SELECT id, label, created_at AS createdAt, last_seen_at AS lastSeenAt, revoked_at AS revokedAt FROM agents WHERE user_id = ? ORDER BY created_at DESC',
    req.user.uid,
  );
  res.json(agents);
});

app.post('/api/agent/token', requireAuth, async (req, res) => {
  const label = sanitizeString(req.body?.label, 60) ?? 'Collector';
  const issued = await issueAgentToken(req.user.uid, label);
  if (!issued) return res.status(500).json({ error: 'Could not issue agent token' });
  res.status(201).json(issued);
});

app.post('/api/agent/revoke', requireAuth, async (req, res) => {
  const id = sanitizeString(req.body?.id, 64);
  if (!id) return res.status(400).json({ error: 'Agent id is required' });

  const row = await db.get('SELECT token_hash FROM agents WHERE id = ? AND user_id = ?', id, req.user.uid);
  const result = await db.run(
    'UPDATE agents SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
    new Date().toISOString(), id, req.user.uid,
  );
  if (!result.changes) return res.status(404).json({ error: 'Agent not found' });

  // If the revoked token is the one the local collector is running with, cut
  // its power: a dead credential left running would keep rejecting forever.
  const storedToken = readAgentEnv().get(AGENT_TOKEN_KEY);
  if (storedToken && row?.token_hash === hashToken(storedToken)) {
    updateAgentEnvValue(AGENT_TOKEN_KEY, '');
    await stopLocalCollector();
    log('info', 'agent_local_collector_disabled', { reason: 'token_revoked' });
  }
  res.json({ revoked: id });
});

app.post('/api/agent/report', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Agent ')) {
    return res.status(401).json({ error: 'Agent token required' });
  }

  const tokenHash = hashToken(authHeader.slice('Agent '.length));
  const agent = await db.get(
    'SELECT id, user_id AS userId FROM agents WHERE token_hash = ? AND revoked_at IS NULL',
    tokenHash,
  );
  if (!agent) return res.status(401).json({ error: 'Invalid or revoked agent token' });

  const lastSample = await db.get(
    'SELECT received_at AS receivedAt FROM agent_samples WHERE agent_id = ? ORDER BY received_at DESC LIMIT 1',
    agent.id,
  );
  if (lastSample?.receivedAt && Date.now() - Date.parse(lastSample.receivedAt) < 1_000) {
    return res.status(429).json({ error: 'Reporting too frequently' });
  }

  const body = req.body ?? {};
  const cpuCores = sanitizeCoreArray(body.cpuCores);
  const listeningPorts = sanitizeListeningPorts(body.listeningPorts);
  const firewall = sanitizeFirewall(body.firewall);
  const receivedAt = new Date().toISOString();
  const observedAt = sanitizeString(body.observedAt, 40) ?? receivedAt;

  if (Math.abs(Date.now() - Date.parse(observedAt)) > AGENT_MAX_INTERVAL_MS * 5) {
    return res.status(400).json({ error: 'observedAt is implausibly far from server time' });
  }

  try {
    await db.run(
      `INSERT INTO agent_samples
        (agent_id, user_id, hostname, platform, cpu_usage, cpu_cores, cpu_model,
         memory_usage, total_memory_bytes, free_memory_bytes, storage_usage, uptime_seconds,
         network_in_bps, network_out_bps, primary_ip, interface_count, local_ips,
         os_release, listening_ports, firewall, observed_at, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      agent.id, agent.userId,
      sanitizeString(body.hostname, 120), sanitizeString(body.platform, 40),
      clampPercent(body.cpuUsage), JSON.stringify(cpuCores), sanitizeString(body.cpuModel, 120),
      clampPercent(body.memoryUsage), clampBytes(body.totalMemoryBytes), clampBytes(body.freeMemoryBytes),
      body.storageUsage === null || body.storageUsage === undefined ? null : clampPercent(body.storageUsage),
      Math.max(0, Math.round(Number(body.uptimeSeconds) || 0)),
      Math.max(0, Number(body.networkInBps) || 0), Math.max(0, Number(body.networkOutBps) || 0),
      sanitizeString(body.primaryIp, 64),
      Math.max(0, Math.min(512, Math.round(Number(body.interfaceCount) || 0))),
      JSON.stringify(sanitizeIpList(body.localIps)),
      sanitizeString(body.osRelease, 120),
      JSON.stringify(listeningPorts),
      firewall ? JSON.stringify(firewall) : null,
      observedAt, receivedAt,
    );
    await db.run('UPDATE agents SET last_seen_at = ? WHERE id = ?', receivedAt, agent.id);
  } catch (error) {
    log('error', 'agent_report_failed', { message: error.message, agentId: agent.id });
    return res.status(500).json({ error: 'Could not record agent sample' });
  }

  res.status(202).json({ accepted: true, receivedAt });
});

app.get('/api/agent/metrics', requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT a.id AS agentId, a.label, s.hostname, s.platform, s.cpu_usage AS cpuUsage, s.cpu_cores AS cpuCores,
            s.cpu_model AS cpuModel, s.memory_usage AS memoryUsage, s.total_memory_bytes AS totalMemoryBytes,
            s.free_memory_bytes AS freeMemoryBytes, s.storage_usage AS storageUsage, s.uptime_seconds AS uptimeSeconds,
            s.network_in_bps AS networkInBps, s.network_out_bps AS networkOutBps, s.primary_ip AS primaryIp,
            s.interface_count AS interfaceCount, s.local_ips AS localIps, s.os_release AS osRelease,
            s.listening_ports AS listeningPorts, s.firewall,
            s.observed_at AS observedAt, s.received_at AS receivedAt
       FROM agent_samples s
       JOIN agents a ON a.id = s.agent_id
      WHERE s.user_id = ?
        AND s.id = (SELECT MAX(s2.id) FROM agent_samples s2 WHERE s2.agent_id = s.agent_id)
        AND a.revoked_at IS NULL
      ORDER BY s.received_at DESC`,
    req.user.uid,
  );

  const staleCutoff = Date.now() - 90_000;
  const agents = rows.map(row => {
    let cpuCores = [];
    let localIps = [];
    let listeningPorts = [];
    let firewall = null;
    try { cpuCores = JSON.parse(row.cpuCores ?? '[]'); } catch { cpuCores = []; }
    try { localIps = JSON.parse(row.localIps ?? '[]'); } catch { localIps = []; }
    try { listeningPorts = JSON.parse(row.listeningPorts ?? '[]'); } catch { listeningPorts = []; }
    try { firewall = row.firewall ? JSON.parse(row.firewall) : null; } catch { firewall = null; }
    return {
      agentId: row.agentId,
      label: row.label,
      hostname: row.hostname,
      platform: row.platform,
      osRelease: row.osRelease,
      cpuUsage: row.cpuUsage,
      cpuCores,
      cpuModel: row.cpuModel,
      memoryUsage: row.memoryUsage,
      totalMemoryBytes: row.totalMemoryBytes,
      freeMemoryBytes: row.freeMemoryBytes,
      storageUsage: row.storageUsage,
      uptimeSeconds: row.uptimeSeconds,
      networkInBps: row.networkInBps,
      networkOutBps: row.networkOutBps,
      primaryIp: row.primaryIp,
      interfaceCount: row.interfaceCount,
      localIps,
      listeningPorts,
      firewall,
      observedAt: row.observedAt,
      receivedAt: row.receivedAt,
      online: Date.parse(row.receivedAt) > staleCutoff,
    };
  });

  res.json({ agents, serverTime: new Date().toISOString() });
});

const RISKY_SERVICES = [
  { port: 21, service: 'FTP', note: 'Credentials travel in cleartext unless FTPS is used.' },
  { port: 23, service: 'Telnet', note: 'Unencrypted remote shell. Disable if not required.' },
  { port: 69, service: 'TFTP', note: 'Trivial FTP with no authentication.' },
  { port: 135, service: 'RPC endpoint mapper', note: 'Windows RPC. Should not be reachable from untrusted networks.' },
  { port: 139, service: 'NetBIOS session', note: 'Legacy file sharing. Expose only on trusted networks.' },
  { port: 445, service: 'SMB', note: 'Windows file sharing. A frequent ransomware entry point; block from untrusted networks.' },
  { port: 1433, service: 'MSSQL', note: 'Database server. Restrict to application hosts.' },
  { port: 3306, service: 'MySQL', note: 'Database server. Restrict to application hosts.' },
  { port: 3389, service: 'RDP', note: 'Remote desktop. Target of credential-stuffing attacks; require VPN or MFA.' },
  { port: 5432, service: 'PostgreSQL', note: 'Database server. Restrict to application hosts.' },
  { port: 5900, service: 'VNC', note: 'Remote desktop. Often used with weak or no authentication.' },
  { port: 6379, service: 'Redis', note: 'Often unauthenticated by default. Never expose publicly.' },
  { port: 9200, service: 'Elasticsearch', note: 'Frequently deployed unauthenticated. Restrict access.' },
  { port: 27017, service: 'MongoDB', note: 'Frequently deployed unauthenticated. Restrict access.' },
];

function analyzeHost(sample) {
  const findings = [];
  const ports = Array.isArray(sample.listeningPorts) ? sample.listeningPorts : [];
  const uniquePorts = new Map();
  for (const entry of ports) {
    if (!uniquePorts.has(entry.port)) uniquePorts.set(entry.port, entry);
  }

  for (const [port, entry] of uniquePorts) {
    const known = RISKY_SERVICES.find(r => r.port === port);
    if (known && entry.exposed) {
      findings.push({
        severity: 'HIGH',
        category: 'Exposed service',
        title: `${known.service} reachable from the network on port ${port}`,
        detail: `${known.note} Bound to ${entry.address}.`,
      });
    } else if (known) {
      findings.push({
        severity: 'LOW',
        category: 'Listening service',
        title: `${known.service} listening on port ${port} (local only)`,
        detail: `Bound to ${entry.address}, so it is not reachable from other machines.`,
      });
    }
  }

  const firewall = sample.firewall;
  if (firewall?.supported && !firewall.enabled) {
    findings.push({
      severity: 'CRITICAL',
      category: 'Host firewall',
      title: 'Host firewall is disabled',
      detail: firewall.detail || 'No enabled firewall profile was reported by the operating system.',
    });
  } else if (firewall?.supported && firewall.enabled) {
    findings.push({
      severity: 'INFO',
      category: 'Host firewall',
      title: 'Host firewall is enabled',
      detail: firewall.detail,
    });
  } else {
    findings.push({
      severity: 'MED',
      category: 'Host firewall',
      title: 'Firewall state could not be determined',
      detail: firewall?.detail || 'The agent did not report firewall status for this platform.',
    });
  }

  const exposedCount = [...uniquePorts.values()].filter(entry => entry.exposed).length;
  if (ports.length === 0) {
    findings.push({
      severity: 'MED',
      category: 'Scan coverage',
      title: 'No listening port data was collected',
      detail: 'The agent has not reported ports yet, so no local exposure analysis is possible.',
    });
  }

  const rank = { CRITICAL: 4, HIGH: 3, MED: 2, LOW: 1, INFO: 0 };
  findings.sort((a, b) => rank[b.severity] - rank[a.severity]);

  return {
    findings,
    summary: {
      totalPorts: uniquePorts.size,
      exposedPorts: exposedCount,
      localOnlyPorts: uniquePorts.size - exposedCount,
      highestSeverity: findings[0]?.severity ?? 'INFO',
      criticalCount: findings.filter(f => f.severity === 'CRITICAL').length,
      highCount: findings.filter(f => f.severity === 'HIGH').length,
    },
  };
}

app.get('/api/scan/analyze', requireAuth, async (req, res) => {
  const row = await db.get(
    `SELECT a.id AS agentId, a.label, s.hostname, s.platform, s.os_release AS osRelease,
            s.listening_ports AS listeningPorts, s.firewall, s.received_at AS receivedAt
       FROM agent_samples s
       JOIN agents a ON a.id = s.agent_id
      WHERE s.user_id = ? AND a.revoked_at IS NULL
      ORDER BY s.received_at DESC
      LIMIT 1`,
    req.user.uid,
  );

  if (!row) {
    return res.json({
      available: false,
      reason: 'No collector agent has reported yet. Start the agent and rescan.',
      scannedAt: null,
      findings: [],
      summary: null,
      attacks: { total: 0, high: 0, critical: 0, last24h: 0 },
    });
  }

  let listeningPorts = [];
  let firewall = null;
  try { listeningPorts = JSON.parse(row.listeningPorts ?? '[]'); } catch { listeningPorts = []; }
  try { firewall = row.firewall ? JSON.parse(row.firewall) : null; } catch { firewall = null; }

  const analysis = analyzeHost({
    listeningPorts,
    firewall,
    hostname: row.hostname,
    osRelease: row.osRelease,
  });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [total, high, critical, last24h] = await Promise.all([
    db.get('SELECT COUNT(*) AS count FROM security_events WHERE user_id = ?', req.user.uid),
    db.get("SELECT COUNT(*) AS count FROM security_events WHERE user_id = ? AND severity = 'HIGH'", req.user.uid),
    db.get("SELECT COUNT(*) AS count FROM security_events WHERE user_id = ? AND severity = 'CRITICAL'", req.user.uid),
    db.get('SELECT COUNT(*) AS count FROM security_events WHERE user_id = ? AND datetime(timestamp) >= datetime(?)', req.user.uid, since),
  ]);

  res.json({
    available: true,
    agentId: row.agentId,
    label: row.label,
    hostname: row.hostname,
    platform: row.platform,
    osRelease: row.osRelease,
    scannedAt: row.receivedAt,
    ...analysis,
    attacks: {
      total: total?.count ?? 0,
      high: high?.count ?? 0,
      critical: critical?.count ?? 0,
      last24h: last24h?.count ?? 0,
    },
  });
});

app.get('/api/visits', requireAuth, async (req, res) => {
  const { where, params } = buildUserFilter(req);
  const rows = await db.all(
    `SELECT id, source_ip AS ip, event_type AS eventType, severity, request_path AS requestPath, request_method AS requestMethod, target_port AS targetPort, request_count AS requestCount, timestamp FROM security_events WHERE ${where} ORDER BY timestamp DESC LIMIT 200`,
    params
  );
  res.json(rows);
});
app.get('/api/alerts', requireAuth, async (req, res) => {
  const { where, params } = buildUserFilter(req);
  const rows = await db.all(
    `SELECT id, source_ip AS sourceIP, event_type AS alertType, severity, target_port AS port, timestamp, request_path AS requestPath, request_count AS requestCount FROM security_events WHERE ${where} ORDER BY timestamp DESC LIMIT 200`,
    params
  );
  res.json(rows.map(row => ({ ...row, live: false })));
});
app.get('/api/stats', requireAuth, async (req, res) => {
  const { where, params } = buildUserFilter(req);
  const [total, uniqueIPs, flagged, topSources] = await Promise.all([
    db.get(`SELECT COUNT(*) AS count FROM security_events WHERE ${where}`, params),
    db.get(`SELECT COUNT(DISTINCT source_ip) AS count FROM security_events WHERE ${where}`, params),
    db.get(`SELECT COUNT(*) AS count FROM security_events WHERE ${where} AND severity IN ('HIGH', 'CRITICAL')`, params),
    db.all(`SELECT source_ip AS source, COUNT(*) AS count FROM security_events WHERE ${where} GROUP BY source_ip ORDER BY count DESC LIMIT 5`, params),
  ]);
  res.json({ totalVisits: total?.count || 0, uniqueIps: uniqueIPs?.count || 0, flaggedCount: flagged?.count || 0, topSources });
});
app.get('/api/heatmap', requireAuth, async (req, res) => {
  const { where, params } = buildUserFilter(req);
  const rows = await db.all(
    `SELECT strftime('%w', timestamp) AS day, strftime('%H', timestamp) AS hour, COUNT(*) AS count, MIN(event_type) AS topAttackType FROM security_events WHERE ${where} AND datetime(timestamp) >= datetime('now', '-6 days') GROUP BY day, hour`,
    params
  );
  const lookup = new Map(rows.map(row => [`${row.day}-${row.hour}`, row]));
  res.json(Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) => {
    const row = lookup.get(`${day}-${String(hour).padStart(2, '0')}`);
    return { day, hour, count: row?.count || 0, topAttackType: row?.topAttackType || 'No detected events' };
  })));
});
app.get('/api/lookup/:ip', requireAuth, async (req, res) => {
  const ip = normalizeIp(req.params.ip);
  // Scoped to the signed-in user so one account can never read another account's events.
  const { where, params } = buildUserFilter(req);
  const scoped = `${where} AND source_ip = ?`;
  const scopedParams = [...params, ip];
  const [summary, events] = await Promise.all([
    db.get(`SELECT COUNT(*) AS eventCount, MAX(timestamp) AS lastSeen, MAX(severity) AS highestSeverity FROM security_events WHERE ${scoped}`, scopedParams),
    db.all(`SELECT event_type AS eventType, severity, timestamp, request_path AS requestPath FROM security_events WHERE ${scoped} ORDER BY timestamp DESC LIMIT 10`, scopedParams),
  ]);
  res.json({ ip, observed: Boolean(summary?.eventCount), eventCount: summary?.eventCount || 0, lastSeen: summary?.lastSeen || null, highestSeverity: summary?.highestSeverity || null, events });
});

const geoCache = new Map();
const GEO_TTL_MS = 60 * 60 * 1000;
const GEO_BATCH_LIMIT = 100;

// ---------------------------------------------------------------------------
// Address family helpers (IPv4 and IPv6)
// ---------------------------------------------------------------------------

function expandIPv6Address(input) {
  let address = String(input).trim().toLowerCase();
  if (!address) return null;

  const zone = address.indexOf('%');
  if (zone !== -1) address = address.slice(0, zone);

  const embedded = address.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (embedded) {
    const octets = embedded[2].split('.').map(Number);
    if (octets.some(o => !Number.isInteger(o) || o < 0 || o > 255)) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    address = `${embedded[1]}${high}:${low}`;
  }

  const gap = address.indexOf('::');
  if (gap !== -1 && address.indexOf('::', gap + 1) !== -1) return null;

  let head;
  let tail;
  if (gap === -1) {
    head = address.split(':');
    tail = [];
    if (head.length !== 8) return null;
  } else {
    const before = address.slice(0, gap);
    const after = address.slice(gap + 2);
    head = before ? before.split(':') : [];
    tail = after ? after.split(':') : [];
    if (head.length + tail.length > 7) return null;
  }

  const parse = parts => parts.every(part => /^[0-9a-f]{1,4}$/.test(part));
  if (!parse(head) || !parse(tail)) return null;

  const groups = [...head];
  for (let i = 0; i < 8 - head.length - tail.length; i += 1) groups.push('0');
  groups.push(...tail);
  if (groups.length !== 8) return null;
  return groups.map(g => g.padStart(4, '0')).join(':');
}

function isValidIpv4(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    if (part.length > 1 && part.startsWith('0')) return false;
    return /^\d{1,3}$/.test(part) && Number(part) <= 255;
  });
}

function isValidAddress(ip) {
  const value = String(ip).trim();
  return isValidIpv4(value) || expandIPv6Address(value) !== null;
}

function addressFamily(ip) {
  const value = String(ip).trim();
  if (isValidIpv4(value)) return 'IPv4';
  if (expandIPv6Address(value)) return 'IPv6';
  return null;
}

const PRIVATE_V4 = [
  /^10\./, /^127\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^192\.0\.0\./, /^192\.0\.2\./, /^198\.18\./, /^198\.51\.100\./,
  /^203\.0\.113\./, /^224\./, /^240\./,
];

function isRoutableAddress(ip) {
  const value = String(ip).trim();
  if (isValidIpv4(value)) return !PRIVATE_V4.some(pattern => pattern.test(value));
  const expanded = expandIPv6Address(value);
  if (!expanded) return false;
  const first = parseInt(expanded.slice(0, 4), 16);
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0000') return false;
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0001') return false;
  if ((first & 0xfe00) === 0xfc00) return false;
  if ((first & 0xffc0) === 0xfe80) return false;
  if ((first & 0xff00) === 0xff00) return false;
  if (expanded.startsWith('2001:0db8')) return false;
  if (expanded.startsWith('0064:ff9b')) return false;
  return true;
}

const intelCache = new Map();
const INTEL_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchShodanInternetDb(ip) {
  try {
    const response = await fetch(`https://internetdb.shodan.io/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'application/json' },
    });
    // 404 means Shodan has never scanned this address; that is a valid answer.
    if (response.status === 404) return { indexed: false, ports: [], cves: [], tags: [], hostnames: [], cpes: [] };
    if (!response.ok) return { indexed: false, unavailable: true, ports: [], cves: [], tags: [], hostnames: [], cpes: [] };
    const data = await response.json();
    return {
      indexed: true,
      ports: Array.isArray(data.ports) ? data.ports.map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [],
      cves: Array.isArray(data.vulns) ? data.vulns : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      hostnames: Array.isArray(data.hostnames) ? data.hostnames : [],
      cpes: Array.isArray(data.cpes) ? data.cpes : [],
    };
  } catch {
    return { indexed: false, unavailable: true, ports: [], cves: [], tags: [], hostnames: [], cpes: [] };
  }
}

function scoreThreatIntel({ geo, shodan }) {
  let score = 0;
  const reasons = [];
  if (geo?.proxy) { score += 35; reasons.push('Flagged as a proxy'); }
  if (geo?.hosting) { score += 20; reasons.push('Hosting provider'); }
  if (shodan?.cves?.length) { score += Math.min(40, shodan.cves.length * 12); reasons.push(`${shodan.cves.length} known CVE(s)`); }
  const riskyPorts = (shodan?.ports ?? []).filter(port => RISKY_SERVICES.some(r => r.port === port));
  if (riskyPorts.length) { score += Math.min(30, riskyPorts.length * 8); reasons.push(`Exposes ${riskyPorts.length} risky service port(s)`); }
  if (geo?.mobile) { score += 5; reasons.push('Mobile network'); }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * Passive intelligence about a single address: geolocation plus Shodan InternetDB,
 * which answers from Shodan's own scan archive. Nothing is probed on the target,
 * so this cannot be used to port-scan anyone.
 */
app.get('/api/ip/intel', requireAuth, async (req, res) => {
  const ip = normalizeIp(req.query.ip);
  if (!isValidAddress(ip)) return res.status(400).json({ error: 'A valid IPv4 or IPv6 address is required' });

  const cacheKey = ip;
  const cached = intelCache.get(cacheKey);
  if (cached && Date.now() - cached.at < INTEL_TTL_MS) {
    return res.json({ ...cached.value, cached: true });
  }

  if (!isRoutableAddress(ip)) {
    return res.json({
      ip,
      family: addressFamily(ip),
      private: true,
      note: 'This is a private, loopback or link-local address, so no public threat intelligence exists for it.',
      geo: null,
      shodan: { indexed: false, ports: [], cves: [], tags: [], hostnames: [], cpes: [] },
      threat: { score: 0, reasons: [] },
      observed: null,
      generatedAt: new Date().toISOString(),
      cached: false,
    });
  }

  const geo = await lookupGeolocation([ip]);
  const shodan = await fetchShodanInternetDb(ip);
  const threat = scoreThreatIntel({ geo: geo[ip] ?? null, shodan });

  const { where, params } = buildUserFilter(req);
  const observed = await db.get(
    `SELECT COUNT(*) AS eventCount, MAX(timestamp) AS lastSeen, MAX(severity) AS highestSeverity
       FROM security_events WHERE ${where} AND source_ip = ?`,
    [...params, ip],
  );

  const value = {
    ip,
    family: addressFamily(ip),
    private: false,
    geo: geo[ip] ?? null,
    shodan,
    threat,
    observed: {
      eventCount: observed?.eventCount ?? 0,
      lastSeen: observed?.lastSeen ?? null,
      highestSeverity: observed?.highestSeverity ?? null,
    },
    generatedAt: new Date().toISOString(),
  };

  intelCache.set(cacheKey, { at: Date.now(), value });
  res.json({ ...value, cached: false });
});

async function lookupGeolocation(ips) {
  const now = Date.now();
  const results = {};

  const missing = [];
  for (const ip of ips) {
    if (!isRoutableAddress(ip)) {
      results[ip] = { private: true };
      continue;
    }
    const cached = geoCache.get(ip);
    if (cached && now - cached.at < GEO_TTL_MS) {
      results[ip] = cached.value;
    } else {
      missing.push(ip);
    }
  }

  if (missing.length) {
    const batch = missing.slice(0, GEO_BATCH_LIMIT);
    try {
      const response = await fetch(
        `http://ip-api.com/batch?fields=status,message,query,country,countryCode,city,lat,lon,isp,proxy,hosting&max=${GEO_BATCH_LIMIT}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch.map(ip => ({ query: ip }))),
          signal: AbortSignal.timeout(6_000),
        },
      );
      if (response.ok) {
        for (const entry of await response.json()) {
          const value = entry.status === 'success'
            ? {
                country: entry.country,
                countryCode: entry.countryCode,
                city: entry.city,
                lat: entry.lat,
                lon: entry.lon,
                isp: entry.isp,
                proxy: Boolean(entry.proxy),
                hosting: Boolean(entry.hosting),
              }
            : { lookupFailed: true, message: entry.message };
          results[entry.query] = value;
          geoCache.set(entry.query, { at: now, value });
        }
      }
    } catch (error) {
      log('warn', 'geolocation_unavailable', { message: error instanceof Error ? error.message : String(error) });
      for (const ip of batch) results[ip] = { lookupFailed: true };
    }
  }

  return results;
}

app.get('/api/threats/geo', requireAuth, async (req, res) => {
  const { where, params } = buildUserFilter(req);
  const rows = await db.all(
    `SELECT source_ip AS sourceIP,
            COUNT(*) AS eventCount,
            MAX(timestamp) AS lastSeen,
            MAX(CASE severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MED' THEN 2 ELSE 1 END) AS rank
       FROM security_events
      WHERE ${where}
      GROUP BY source_ip
      ORDER BY eventCount DESC
      LIMIT 50`,
    params,
  );

  const severityByRank = { 1: 'LOW', 2: 'MED', 3: 'HIGH', 4: 'CRITICAL' };
  const geo = await lookupGeolocation(rows.map(row => row.sourceIP));

  res.json({
    sources: rows.map(row => ({
      ip: row.sourceIP,
      eventCount: row.eventCount,
      lastSeen: row.lastSeen,
      severity: severityByRank[row.rank] ?? 'LOW',
      geo: geo[row.sourceIP] ?? null,
    })),
    generatedAt: new Date().toISOString(),
  });
});
async function getUserFromToken(token) {
  if (!firebaseAdminAuth || !token) return null;
  try {
    const decoded = await firebaseAdminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

app.get(['/sse/metrics', '/api/sse/metrics'], async (req, res) => {
  // Headers are written only after the token is accepted, so a rejected connection
  // still gets a normal HTTP error instead of a half-open 200 stream.

  let user = req.user;
  let tokenRejected = false;
  if (!user) {
    const token = req.query.token;
    if (token) {
      user = await getUserFromToken(token);
      // A token was supplied but rejected: do not fall back to IP matching, or a bad
      // token would silently receive another account's alerts from the same address.
      tokenRejected = !user;
    }
  }
  if (tokenRejected) {
    // No stream data is ever sent on this path. Returning a real status now works
    // because the headers are no longer flushed before the token is validated.
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const userId = user?.uid;
  const userIp = getUserIp(req);
  const client = { res, userId, userIp };
  sseClients.add(client);

  let closed = false;
  let inFlight = false;

  // Railway bills egress at $0.05/GB and the Free plan includes only $1/month of
  // usage. The metrics frame is the bulk of this stream, so it is gzipped, and an
  // unchanged frame is skipped entirely. Between agent samples most system
  // counters are identical, so this removes most idle traffic without making the
  // live display feel any less responsive: any real change still ships instantly.
  const gzip = zlib.createGzip({ level: 6, flush: zlib.constants.Z_SYNC_FLUSH });
  const gzipFailed = { value: false };
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Content-Encoding': 'gzip',
  });
  gzip.pipe(res);
  const send = chunk => { if (!gzipFailed.value) gzip.write(chunk); };

  let lastFrame = null;
  const writeMetrics = async () => {
    if (closed || inFlight) return;
    inFlight = true;
    try {
      const metrics = getSystemMetrics(await readNetworkCounters());
      if (closed) return;
      const frame = `event: metrics\ndata: ${JSON.stringify(metrics)}\n\n`;
      if (frame === lastFrame) return;
      lastFrame = frame;
      send(frame);
    } catch {
      if (closed) return;
      const frame = `event: metrics\ndata: ${JSON.stringify(getSystemMetrics(null))}\n\n`;
      if (frame === lastFrame) return;
      lastFrame = frame;
      send(frame);
    } finally {
      inFlight = false;
    }
  };

  writeMetrics();
  const interval = setInterval(writeMetrics, SSE_METRICS_INTERVAL_MS);
  const heartbeat = setInterval(() => { if (!closed) send(': keepalive\n\n'); }, SSE_HEARTBEAT_MS);
  // Kept on the client so shutdown can stop them even if close never fires.
  client.timers = [interval, heartbeat];
  gzip.on('error', () => { gzipFailed.value = true; });
  // broadcast() reuses this writer so alerts land inside the same gzip stream.
  client.send = send;
  req.on('close', () => {
    closed = true;
    clearInterval(interval);
    clearInterval(heartbeat);
    gzip.end();
    sseClients.delete(client);
  });
});

function broadcast(type, data) {
  const payload = JSON.stringify(data);
  for (const client of sseClients) {
    const match = client.userId
      ? data.userId === client.userId
      : data.sourceIP === client.userIp;
    if (match) {
      // Must go through the client's gzip stream, not straight to res, otherwise
      // plain text would be interleaved into a compressed response.
      try {
        if (client.send) client.send(`event: ${type}\ndata: ${payload}\n\n`);
        else client.res.write(`event: ${type}\ndata: ${payload}\n\n`);
      } catch { sseClients.delete(client); }
    }
  }
}
app.use(express.static(path.join(__dirname, 'dist'), { maxAge: '1h', etag: true }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/sse')) return next();
  const index = path.join(__dirname, 'dist', 'index.html');
  return fs.existsSync(index) ? res.sendFile(index) : res.status(503).json({ error: 'Frontend build is not available' });
});
app.use((error, req, res, _next) => {
  log('error', 'request_error', { method: req.method, path: req.path, message: error.message });
  res.status(error.status || 500).json({ error: 'Request could not be processed' });
});

const retentionTimer = setInterval(async () => {
  try {
    await db.run("DELETE FROM security_events WHERE datetime(timestamp) < datetime('now', ?)", `-${EVENT_RETENTION_DAYS} days`);
  } catch (error) {
    log('error', 'retention_failure', { message: error instanceof Error ? error.message : String(error) });
  }
}, 24 * 60 * 60 * 1000);
backgroundIntervals.add(retentionTimer);

// Keeps the geolocation and IP-intel caches from growing without bound on a
// long-running instance.
const cacheSweepTimer = setInterval(() => {
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  for (const [key, entry] of geoCache) {
    if (entry.at < cutoff) geoCache.delete(key);
  }
  for (const [key, entry] of intelCache) {
    if (entry.at < cutoff) intelCache.delete(key);
  }
  // Rate-limit windows are only meaningful for a minute.
  const windowCutoff = Date.now() - 120_000;
  for (const [ip, timestamps] of requestWindows) {
    const kept = timestamps.filter(timestamp => timestamp > windowCutoff);
    if (kept.length) requestWindows.set(ip, kept);
    else requestWindows.delete(ip);
  }
}, 60 * 60 * 1000);
backgroundIntervals.add(cacheSweepTimer);

// Binding to an explicit IPv4 address leaves the IPv6 loopback unreachable, and
// Node resolves `localhost` to ::1 first on many systems. Omitting the host makes
// Node listen on `::` with dual-stack enabled, so both 127.0.0.1 and ::1 work.
const HOST = process.env.HOST || undefined;
server.listen(PORT, HOST, () => {
  log('info', 'server_started', {
    port: PORT,
    address: HOST ?? 'dual-stack (::)',
    monitoring: 'local_service_requests_and_host_metrics',
  });
  // Continue any agent pipeline configured by an earlier "Start" click. If no
  // token is stored yet, nothing starts — enabling the collector is always a
  // deliberate, authenticated action in the dashboard.
  if (spawnLocalCollector('boot')) {
    // Confirm quickly that the stored credential is still accepted.
    setTimeout(() => {
      if (!isCollectorAlive() && !shuttingDown) {
        log('warn', 'agent_autostart_failed', { hint: 'Token may be revoked. Start it again from the dashboard.' });
      }
    }, 20_000);
  }
});

let shuttingDown = false;

// Cloud Run sends SIGTERM and allows roughly 10 seconds before SIGKILL, so shutdown
// must never depend on a connection closing. Long-lived SSE streams are ended
// explicitly, remaining sockets are destroyed, and a hard timer guarantees exit.
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'server_stopping', { signal, openStreams: sseClients.size });

  clearInterval(retentionTimer);
  for (const interval of backgroundIntervals) clearInterval(interval);

  if (agentChild && agentChild.exitCode === null) {
    try { agentChild.kill('SIGTERM'); } catch { /* already gone */ }
  }

  for (const client of sseClients) {
    for (const timer of client.timers ?? []) clearInterval(timer);
    try { client.res.end(); } catch { /* already gone */ }
  }
  sseClients.clear();

  const hardExit = setTimeout(() => {
    log('warn', 'shutdown_forced', { reason: 'timeout' });
    process.exit(0);
  }, 8_000);
  hardExit.unref();

  server.close(async () => {
    clearTimeout(hardExit);
    for (const socket of openSockets) socket.destroy();
    try { await db.close(); } catch { /* already closed */ }
    logStream.end(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  });

  // Idle keep-alive sockets would otherwise hold the close open.
  for (const socket of openSockets) {
    if (socket.writableEnded || socket.destroyed) continue;
    socket.end();
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
