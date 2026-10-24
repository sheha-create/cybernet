# CYBERNET Security Monitor

CYBERNET is a deployable, no-key security monitor for a single Node.js service. It reports only observations made by the service itself:

- request-rate threshold crossings
- path traversal and injection signatures in incoming request paths
- live CPU, memory, storage, and network byte-rate measurements from the host

It does not use demo events, IP reputation services, or third-party API keys that require registration. Two free, key-less enrichment sources are used on demand only: `ip-api.com` geolocates detected source IPs for the threat map, and the Shodan InternetDB enriches the IP-intelligence panel with passively observed ports and CVEs. An empty alert feed means this instance has not recorded a detection.

## Run locally

```bash
npm ci
npm run build
npm start
```

Open `http://localhost:3001`.

Copy `.env.example` to `.env` only when you need to override defaults. `TRUST_PROXY` must remain `false` unless the app runs behind a reverse proxy you control; otherwise source-IP reporting can be spoofed.

## Production deployment

Build and run the container with persistent locations mounted for `/app/data` and `/app/logs`:

```bash
docker build -t cybernet-monitor .
docker run --rm -p 3001:3001 -v cybernet-data:/app/data -v cybernet-logs:/app/logs cybernet-monitor
```

The service exposes `GET /api/health` for liveness/readiness checks. Security events are retained in SQLite at `data/security-events.sqlite` and are also appended as NDJSON to `logs/security-events.ndjson`. Configure retention, detection rate, and paths with the environment variables documented in `.env.example`.

## Detection scope

This monitor is passive. It can detect suspicious requests that reach this deployed service and report host telemetry it can read. It cannot truthfully detect network traffic that is blocked upstream, addressed to another host, or hidden from the operating system. Put it behind TLS and an authenticated reverse proxy for internet-facing production use.
