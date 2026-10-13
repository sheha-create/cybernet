#!/usr/bin/env node
/**
 * CYBERNET local collector agent.
 *
 * Runs on the machine you want to monitor and reports real CPU, memory, storage
 * and network figures to the CYBERNET server. It reads only the operating
 * system's own counters via Node's `os` module and sends nothing else.
 *
 * Usage:
 *   node agent/collector.mjs --server http://localhost:3001 --token cyb_xxx
 *
 * Or configure once with a .env file next to this script:
 *   CYBERNET_SERVER_URL=http://localhost:3001
 *   CYBERNET_AGENT_TOKEN=cyb_xxx
 *   CYBERNET_INTERVAL_MS=5000
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadAgentEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, '');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadAgentEnv();

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const SERVER_URL = (args.server ?? process.env.CYBERNET_SERVER_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const TOKEN = args.token ?? process.env.CYBERNET_AGENT_TOKEN ?? '';
const INTERVAL_MS = Math.max(2_000, Number(args.interval ?? process.env.CYBERNET_INTERVAL_MS ?? 5_000));

if (!TOKEN) {
  console.error('Missing agent token.');
  console.error('Pass --token cyb_... or set CYBERNET_AGENT_TOKEN in agent/.env');
  console.error('Generate a token from the dashboard (Config tab).');
  process.exit(1);
}

let previousCores = null;
let previousNetwork = null;

function readCpuCores() {
  return os.cpus().map(cpu => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return { idle: cpu.times.idle, total };
  });
}

function diffCpu(current) {
  if (!previousCores) {
    previousCores = current;
    return { usage: 0, perCore: current.map(() => 0) };
  }
  const before = previousCores;
  previousCores = current;

  const clamp = value => Math.max(0, Math.min(100, Math.round(value)));
  const perCore = current.map((core, index) => {
    const prior = before[index];
    if (!prior) return 0;
    const totalDelta = core.total - prior.total;
    const idleDelta = core.idle - prior.idle;
    return totalDelta > 0 ? clamp((1 - idleDelta / totalDelta) * 100) : 0;
  });

  const sum = list => list.reduce((acc, c) => ({ idle: acc.idle + c.idle, total: acc.total + c.total }), { idle: 0, total: 0 });
  const now = sum(current);
  const prev = sum(before);
  const totalDelta = now.total - prev.total;
  const idleDelta = now.idle - prev.idle;

  return { usage: totalDelta > 0 ? clamp((1 - idleDelta / totalDelta) * 100) : 0, perCore };
}

function readNetworkCounters() {
  if (process.platform === 'linux') {
    return fs.readdirSync('/sys/class/net').reduce((acc, iface) => {
      const base = path.join('/sys/class/net', iface, 'statistics');
      return {
        received: acc.received + Number(fs.readFileSync(path.join(base, 'rx_bytes'), 'utf8')),
        sent: acc.sent + Number(fs.readFileSync(path.join(base, 'tx_bytes'), 'utf8')),
      };
    }, { received: 0, sent: 0 });
  }
  if (process.platform === 'win32') {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-NetAdapterStatistics | Select-Object ReceivedBytes,SentBytes | ConvertTo-Json -Compress'],
      { encoding: 'utf8', windowsHide: true },
    );
    const parsed = JSON.parse(output || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).reduce((acc, a) => ({
      received: acc.received + Number(a.ReceivedBytes || 0),
      sent: acc.sent + Number(a.SentBytes || 0),
    }), { received: 0, sent: 0 });
  }
  if (process.platform === 'darwin') {
    const output = execFileSync('netstat', ['-ibn'], { encoding: 'utf8' });
    return output.split('\n').slice(1).reduce((acc, line) => {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10) return acc;
      if (!cols[0].startsWith('en')) return acc;
      return { received: acc.received + Number(cols[6] || 0), sent: acc.sent + Number(cols[9] || 0) };
    }, { received: 0, sent: 0 });
  }
  return null;
}

let networkUnavailableLogged = false;

function readNetworkRates() {
  let counters = null;
  try {
    counters = readNetworkCounters();
  } catch {
    counters = null;
  }

  const now = Date.now();
  if (!counters) {
    if (!networkUnavailableLogged) {
      console.warn('Network counters unavailable on this platform; reporting 0 bps.');
      networkUnavailableLogged = true;
    }
    return { networkInBps: 0, networkOutBps: 0 };
  }

  if (!previousNetwork) {
    previousNetwork = { ...counters, at: now };
    return { networkInBps: 0, networkOutBps: 0 };
  }

  const elapsed = (now - previousNetwork.at) / 1000;
  const inBps = elapsed > 0 ? Math.max(0, Math.round((counters.received - previousNetwork.received) / elapsed)) : 0;
  const outBps = elapsed > 0 ? Math.max(0, Math.round((counters.sent - previousNetwork.sent) / elapsed)) : 0;
  previousNetwork = { ...counters, at: now };
  return { networkInBps: inBps, networkOutBps: outBps };
}

function readStorageUsage() {
  try {
    const stats = fs.statfsSync(path.parse(process.cwd()).root);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const available = Number(stats.bavail) * Number(stats.bsize);
    return total > 0 ? Math.round(((total - available) / total) * 100) : null;
  } catch {
    return null;
  }
}

// Reports every externally-bound address, IPv4 and IPv6 alike, so the dashboard
// reflects the full address inventory of the machine rather than IPv4 only.
// Link-local IPv6 (fe80::/10) is kept because it is a genuine per-interface
// address; it is simply marked so the UI can label it as link-local.
function readInterfaces() {
  const list = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.internal) continue;
      const family = address.family === 'IPv6' ? 'IPv6' : 'IPv4';
      const lower = address.address.toLowerCase();
      list.push({
        name,
        ip: address.address,
        family,
        mac: address.mac,
        netmask: address.netmask,
        cidr: address.cidr,
        scope: family === 'IPv6' && lower.startsWith('fe80') ? 'link-local' : 'global',
      });
    }
  }
  return list;
}

const MAX_LISTENING_PORTS = 400;

function readListeningPorts() {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      const rows = [];
      for (const line of output.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const cols = line.trim().split(/\s+/);
        if (cols.length < 4) continue;
        const local = cols[1] ?? '';
        const sep = local.lastIndexOf(':');
        if (sep < 0) continue;
        const port = Number(local.slice(sep + 1));
        if (!Number.isInteger(port) || port <= 0) continue;
        const address = local.slice(0, sep);
        rows.push({
          port,
          address,
          exposed: address === '0.0.0.0' || address === '::' || address === '*',
        });
      }
      return rows.slice(0, MAX_LISTENING_PORTS);
    }

    if (process.platform === 'linux') {
      const output = execFileSync('ss', ['-tulnH'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      const rows = [];
      for (const line of output.split('\n')) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 5) continue;
        const local = cols[4] ?? '';
        const sep = local.lastIndexOf(':');
        if (sep < 0) continue;
        const port = Number(local.slice(sep + 1));
        if (!Number.isInteger(port) || port <= 0) continue;
        const address = local.slice(0, sep);
        rows.push({
          port,
          address,
          exposed: address === '0.0.0.0' || address === '*' || address === '::',
        });
      }
      return rows.slice(0, MAX_LISTENING_PORTS);
    }

    if (process.platform === 'darwin') {
      const output = execFileSync('netstat', ['-anv', '-p', 'tcp'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      const rows = [];
      for (const line of output.split('\n')) {
        if (!/LISTEN/.test(line)) continue;
        const cols = line.trim().split(/\s+/);
        const local = cols[3] ?? '';
        const sep = local.lastIndexOf('.');
        if (sep < 0) continue;
        const port = Number(local.slice(sep + 1));
        if (!Number.isInteger(port) || port <= 0) continue;
        const address = local.slice(0, sep).replace(/^127\./, '127.0.0.1');
        rows.push({
          port,
          address,
          exposed: !/^(127\.|::1|\*)/.test(address),
        });
      }
      return rows.slice(0, MAX_LISTENING_PORTS);
    }
  } catch (error) {
    console.warn(`Could not read listening ports: ${error.message}`);
  }
  return [];
}

// Reading the Windows firewall profile costs about 2.8 seconds because it spawns
// PowerShell. Firewall state rarely changes, so it is cached and only re-read
// occasionally instead of on every single report.
const FIREWALL_TTL_MS = 5 * 60 * 1000;
let firewallCache = null;

function readFirewallState() {
  if (firewallCache && Date.now() - firewallCache.at < FIREWALL_TTL_MS) {
    return firewallCache.value;
  }
  const value = readFirewallStateUncached();
  firewallCache = { at: Date.now(), value };
  return value;
}

function readFirewallStateUncached() {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress'],
        { encoding: 'utf8', windowsHide: true },
      );
      const parsed = JSON.parse(output || '[]');
      const profiles = Array.isArray(parsed) ? parsed : [parsed];
      const enabled = profiles.filter(p => p.Enabled === true || p.Enabled === 'True').length;
      return {
        supported: true,
        enabled: enabled > 0,
        detail: profiles.map(p => `${p.Name}:${p.Enabled === true || p.Enabled === 'True' ? 'on' : 'off'}`).join(', '),
      };
    }

    if (process.platform === 'linux') {
      let enabled = false;
      let detail = 'unknown';
      try {
        const ufw = execFileSync('ufw', ['status'], { encoding: 'utf8' });
        enabled = /status:\s*active/i.test(ufw);
        detail = ufw.split('\n')[0].trim();
      } catch {
        try {
          const iptables = execFileSync('iptables', ['-S'], { encoding: 'utf8' });
          const policies = iptables.split('\n').filter(l => /^-P\s+\w+\s+(DROP|REJECT)/i.test(l));
          enabled = policies.length > 0;
          detail = policies.length ? policies.join('; ').slice(0, 200) : 'no default DROP/REJECT policies';
        } catch {
          detail = 'neither ufw nor iptables available';
        }
      }
      return { supported: true, enabled, detail };
    }
  } catch (error) {
    return { supported: false, enabled: false, detail: `unavailable: ${error.message}`.slice(0, 200) };
  }
  return { supported: false, enabled: false, detail: `not implemented for ${process.platform}` };
}

function collect() {
  const cpu = diffCpu(readCpuCores());
  const network = readNetworkRates();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const interfaces = readInterfaces();

  return {
    observedAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.arch()}`,
    cpuUsage: cpu.usage,
    cpuCores: cpu.perCore,
    cpuModel: os.cpus()[0]?.model?.trim() ?? 'Unknown',
    memoryUsage: totalMemory > 0 ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100) : 0,
    totalMemoryBytes: totalMemory,
    freeMemoryBytes: freeMemory,
    storageUsage: readStorageUsage(),
    uptimeSeconds: Math.floor(os.uptime()),
    networkInBps: network.networkInBps,
    networkOutBps: network.networkOutBps,
    // Prefer a global IPv4 for the headline address because it is the one most
// tooling expects, then a global IPv6, and only then anything else.
primaryIp:
      interfaces.find(i => i.family === 'IPv4' && i.scope === 'global')?.ip
      ?? interfaces.find(i => i.scope === 'global')?.ip
      ?? interfaces[0]?.ip
      ?? null,
    ipv4Count: interfaces.filter(i => i.family === 'IPv4').length,
    ipv6Count: interfaces.filter(i => i.family === 'IPv6').length,
    interfaceCount: interfaces.length,
    localIps: interfaces.map(i => i.ip),
    osRelease: os.release(),
    listeningPorts: readListeningPorts(),
    firewall: readFirewallState(),
  };
}

function describeError(error) {
  if (!error) return 'unknown error';
  const cause = error.cause;
  const detail = cause ? (cause.code ? `${cause.code}` : cause.message) : null;
  return detail ? `${error.message} (${detail})` : error.message;
}

async function report(payload) {
  const response = await fetch(`${SERVER_URL}/api/agent/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Agent ${TOKEN}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 401) {
    console.error('Agent token rejected. Generate a new token in the dashboard Config tab.');
    process.exit(1);
  }
  if (response.status === 429) return 'throttled';
  if (!response.ok) throw new Error(`server responded ${response.status}`);
  return 'ok';
}

// Prime the CPU and network counters before the first report. Without this the very
// first sample has no baseline and reports 0% / 0 B/s, which reads as a broken panel
// rather than "not enough data yet".
function primeBaselines() {
  previousCores = readCpuCores();
  previousNetwork = null;
  try {
    previousNetwork = { ...readNetworkCounters(), at: Date.now() };
  } catch { previousNetwork = null; }
}

console.log(`CYBERNET collector starting`);
console.log(`  server : ${SERVER_URL}`);
console.log(`  host   : ${os.hostname()} (${os.platform()} ${os.arch()})`);
console.log(`  every  : ${INTERVAL_MS}ms`);

primeBaselines();
await new Promise(r => setTimeout(r, 1_200));

let consecutiveFailures = 0;
let inFlight = false;

async function tick() {
  // Guard against overlapping reports: if one is still waiting on the server, skip
  // this interval rather than stacking requests behind it.
  if (inFlight) return;
  inFlight = true;
  try {
    const result = await report(collect());
    if (result === 'throttled') {
      consecutiveFailures = 0;
      return;
    }
    if (consecutiveFailures > 0) {
      console.log(`  reconnected after ${consecutiveFailures} failed attempt(s)`);
    }
    consecutiveFailures = 0;
  } catch (error) {
    consecutiveFailures += 1;
    console.error(`  report failed (${consecutiveFailures}): ${describeError(error)}`);
    if (consecutiveFailures === 1) {
      console.error('  hint: check CYBERNET_SERVER_URL. "ECONNREFUSED ::1" means the');
      console.error('        server is not listening on IPv6 — try http://127.0.0.1:3001 instead.');
    }
  } finally {
    inFlight = false;
  }
}

await tick();
setInterval(tick, INTERVAL_MS);
