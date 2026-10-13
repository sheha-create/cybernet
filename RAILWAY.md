# Deploying CYBERNET to Railway

This runs as a **single Railway service**. The same Node process serves the built
frontend (`dist/`) and the API, so everything is same-origin: no CORS configuration
and no `VITE_API_BASE_URL` are needed.

```
Browser ──https──> Railway service (single origin)
                   ├─ /            -> static frontend from dist/
                   ├─ /api/**      -> Express API
                   └─ /sse/metrics -> live event stream
```

## What the Free plan actually allows

Verified against Railway's published limits:

| Resource | Free limit | CYBERNET usage |
|---|---|---|
| RAM | 0.5 GB | ~70 MB idle (heap capped at 320 MB) |
| CPU | 1 vCPU | Short bursts; the API is I/O bound |
| Ephemeral disk | 1 GB | ~200 MB `node_modules` + bounded logs |
| Volume | 0.5 GB (max 1 per project) | SQLite event store |
| Replicas | 1 | Correct: SQLite must not be replicated |
| Projects / services | 1 / 3 | 1 service used |
| Custom domains | **0** | Must use the generated `*.up.railway.app` |
| Log retention | 3 days | Check logs before they roll off |
| Included usage | $1/month | See the egress note below |

### The $1/month usage credit

Egress is billed at **$0.05/GB**, and the live stream is the main consumer. Two
changes in `server.js` keep this cheap:

- The SSE stream is **gzipped**. Measured 414 bytes on the wire against 1099 bytes
  of JSON, about a 62% reduction.
- **Identical consecutive frames are skipped.** Between agent samples the system
  counters rarely change, so idle dashboards send almost nothing. A real change is
  still pushed immediately.

If you still approach the limit, raise the interval in Variables (see below).

## Step 1 — Create the project

1. Go to <https://railway.com/new> and create a project.
2. Deploy from GitHub, selecting this repository.

Railway detects `Dockerfile` automatically; `railway.json` pins the builder,
health check and restart policy.

## Step 2 — Add the volume (do this before the first real deploy)

The SQLite database holds visits, alerts, agents and events. **Without a volume it
is silently lost on every redeploy**, restart and migration.

1. Open the service → **Volumes** → **Add Volume**
2. Mount path: `/app/data`

`/app/data` is the default `DB_PATH`, so no variable is required. Free gives you
0.5 GB, which is ample for the 30-day event retention.

## Step 3 — Set build variables

Vite inlines `VITE_*` variables **at build time**, so these must be present when the
image builds or login ships broken. Railway exposes variables as `ARG` values during
a Dockerfile build.

In **Variables**, add these six (they are the same public values in your local `.env`,
so they are safe to expose — they already appear in the browser bundle):

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

The build fails loudly with `Missing build args: ...` rather than shipping a bundle
that cannot authenticate.

## Step 4 — Set the runtime variable

The server needs the Firebase service account to verify ID tokens. Generate the
base64 value from the JSON in your local `.env`:

```powershell
$line = Get-Content .env | Where-Object { $_ -match '^FIREBASE_SERVICE_ACCOUNT=' }
$json = $line.Split('=',2)[1].Trim().Trim('"')
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
```

Add the result as:

```
FIREBASE_SERVICE_ACCOUNT_BASE64
```

Base64 is preferred because the private key contains real newlines, which some
platforms mangle in a single-line variable. The server also accepts raw JSON via
`FIREBASE_SERVICE_ACCOUNT`, but do not use both.

Without this the server still starts and logs
`firebase_admin_not_configured`, but **every request is rejected with 401**.

Never commit this value or the JSON. Both `.dockerignore` and `.gcloudignore` exclude
`.env`, so it cannot be baked into the image.

## Step 5 — Authorize the Railway domain

Firebase blocks sign-in from unlisted domains, so login will fail until this is done.

1. Deploy and note the generated domain, e.g. `cybernet-api.up.railway.app`.
2. Firebase console → **Authentication** → **Settings** → **Authorized domains**
3. Add the Railway domain (both the `*.up.railway.app` form and any custom domain).

The Free plan provides **no custom domains**, so the generated domain is required.

## Step 6 — Optional tuning

| Variable | Default | When to change |
|---|---|---|
| `SSE_METRICS_INTERVAL_MS` | `5000` | Raise to `10000`+ to halve stream egress |
| `EVENT_RETENTION_DAYS` | `30` | Lower if the 0.5 GB volume fills |
| `LOG_MAX_BYTES` | `5242880` | NDJSON cap; one rotated generation is kept |
| `TRUST_PROXY` | unset | Railway terminates TLS, so set to `true` for correct client IPs |
| `ALLOWED_ORIGINS` | unset | Only needed if you split the frontend onto another host |

## Verifying the deployment

```powershell
# 1. Liveness (public, no token needed)
curl https://YOUR-DOMAIN.up.railway.app/api/health

# 2. Auth is enforced — 401 is the correct response here
curl -o NUL -w "%{http_code}" https://YOUR-DOMAIN.up.railway.app/api/stats

# 3. Frontend is served
curl -o NUL -w "%{http_code}" https://YOUR-DOMAIN.up.railway.app/
```

Then in the browser: sign in, confirm the dashboard loads, and check that live values
update. If the stream silently stalls, the usual cause is a proxy buffering the
response; the server already sends `X-Accel-Buffering: no` to prevent that.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Build fails, `Missing build args` | The six `VITE_FIREBASE_*` variables were not set before building |
| Every request returns 401 | `FIREBASE_SERVICE_ACCOUNT_BASE64` missing or malformed; check the startup log |
| Login fails in the browser | Railway domain not in Firebase authorized domains |
| Data disappears after a redeploy | No volume mounted at `/app/data` |
| Live values never update | Stream stalled behind a proxy; confirm `/sse/metrics` returns `text/event-stream` |
| Service restarts repeatedly | Check logs for out-of-memory; the heap is capped at 320 MB against a 512 MB limit |

## What is not covered here

`firebase.json` and `.firebaserc` still exist for an optional Firebase Hosting
deployment of the frontend. They are **not used** by a Railway-only deployment and
can be ignored.