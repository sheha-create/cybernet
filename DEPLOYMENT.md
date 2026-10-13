# Deploying CYBERNET for real users

## What runs where

| Piece | Where | Why |
|---|---|---|
| Frontend (`dist/`) | **Firebase Hosting** | Static CDN, free |
| API (`server.js`) | **Cloud Run** | Long-running HTTP server the agent pushes to every 5s, and the only place SSE works |
| Event store | SQLite on a **Cloud Run volume** | Cloud Functions storage is wiped on cold start |

Cloud Functions is **not** used for the API. A function cannot hold the SQLite store,
cannot keep `/sse/metrics` open, and cannot read your users' PCs.

`firebase.json` routes `/api/**` and `/sse/**` to the `cybernet-api` Cloud Run service.

---

## Prerequisites

1. **Blaze plan** — Cloud Run and Cloud Storage volumes require billing.
   Firebase console → ⚙ Upgrade → **Blaze**.
2. **Secrets** — the service account key is stored in Secret Manager, never in `.env`
   inside the image. `.dockerignore` and `.gcloudignore` both exclude `.env`.
3. **Authorised domain** — after the first Hosting deploy, add the live domain to
   Firebase Auth → Settings → **Authorized domains**, or sign-in fails with
   `auth/unauthorized-domain`.

---

## 1. Build arguments are mandatory

Vite inlines `VITE_*` variables at **build** time, and `.env` is deliberately excluded
from the Docker context. If these are missing the image builds to a bundle with
`apiKey: undefined` and **nobody can sign in**, so the Dockerfile fails the build instead.

```cmd
setx VITE_FIREBASE_API_KEY "AIza..."
setx VITE_FIREBASE_AUTH_DOMAIN "cybernet-3d791.firebaseapp.com"
setx VITE_FIREBASE_PROJECT_ID "cybernet-3d791"
setx VITE_FIREBASE_STORAGE_BUCKET "cybernet-3d791.firebasestorage.app"
setx VITE_FIREBASE_MESSAGING_SENDER_ID "133508208866"
setx VITE_FIREBASE_APP_ID "1:133508208866:web:743d910e31ac4ad83de6bb"
```

These are public client values — they already appear in the browser bundle.

---

## 2. Store the service account as a secret

```cmd
gcloud auth login
gcloud config set project cybernet-3d791

gcloud secrets create cybernet-service-account --replication-policy=automatic ^
  --data-file="C:\path\to\service-account.json"
```

---

## 3. Create the data volume

SQLite lives at `/app/data`. Without a volume it is lost whenever the instance recycles.

```cmd
gcloud storage buckets create gs://cybernet-data --location=us-central1
```

---

## 4. Deploy the API to Cloud Run

```cmd
gcloud run deploy cybernet-api ^
  --source . ^
  --region us-central1 ^
  --allow-unauthenticated ^
  --port 8080 ^
  --cpu 1 ^
  --memory 512Mi ^
  --min-instances 1 ^
  --max-instances 4 ^
  --concurrency 80 ^
  --timeout 600 ^
  --set-env-vars NODE_ENV=production ^
  --set-env-vars EVENT_RETENTION_DAYS=30 ^
  --set-secrets FIREBASE_SERVICE_ACCOUNT_BASE64=cybernet-service-account:latest ^
  --mount-type volume ^
  --mount-source cybernet-data ^
  --mount-destination /app/data
```

Notes:
- `--allow-unauthenticated` is safe **because every data endpoint verifies a Firebase
  ID token or an agent token**. Unauthenticated calls return `401`; only `/api/health`
  is public for the load balancer probe.
- `--min-instances 1` avoids cold starts, which matter because the agent reports every 5s.
- `--timeout 600` is required for the SSE stream to stay open.
- `--concurrency 80` suits an I/O-bound service.

If you prefer the plain JSON form, base64-encode the key first:

```cmd
powershell -c "[Convert]::ToBase64String([IO.File]::ReadAllBytes('service-account.json'))"
```
then set it with `--set-env-vars FIREBASE_SERVICE_ACCOUNT_BASE64=<that value>`.

---

## 5. Deploy the frontend

```cmd
npm run build
firebase deploy --only hosting
```

Then add `https://<project>.web.app` and `https://<project>.firebaseapp.com` to the
Firebase Auth authorized domains before testing sign-in.

---

## 6. Point a collector agent at production

On each machine you monitor, set `agent/.env`:

```
CYBERNET_SERVER_URL=https://cybernet-api-xxxxx-uc.a.run.app
CYBERNET_AGENT_TOKEN=cyb_...
CYBERNET_INTERVAL_MS=5000
```

Then `node agent\collector.mjs`. Generate the token from the deployed site's Config tab.

---

## Verifying

```cmd
curl https://<your-cloud-run-url>/api/health
```

Then in the browser: sign in, open **Config** → generate a token → run the agent →
confirm **Scans** reports your machine's real listening ports and the **Core Load Map**
switches to `YOUR PC`.

Expected on the Scans tab, from your own machine:

```
[CRITICAL] Host firewall is disabled
[HIGH]     SMB reachable on port 445
[LOW]      MongoDB listening on 27017 (local only)
```

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `PORT` | runtime, set by Cloud Run | Defaults to `3001` locally |
| `HOST` | runtime | Unset means dual-stack `::`; `0.0.0.0` forces IPv4 only |
| `DB_PATH` | runtime | Defaults to `/app/data/security-events.sqlite` |
| `LOG_DIR` | runtime | Defaults to `/app/logs` |
| `EVENT_RETENTION_DAYS` | runtime | Defaults to `30` |
| `REQUEST_RATE_LIMIT` | runtime | Requests/minute before a rate alert |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | runtime | **Required**, else all tokens are rejected |
| `VITE_FIREBASE_*` | **build** | **Required**, else the bundle cannot authenticate |

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Build fails "Missing build args" | Step 1 not done in the shell running `gcloud` |
| `auth/unauthorized-domain` | Live domain not in Auth → Authorized domains |
| `Agent token rejected` | `FIREBASE_SERVICE_ACCOUNT_BASE64` secret not attached |
| Every endpoint returns 401 when signed in | Frontend and API on different Firebase projects |
| Scan tab always empty | Agent not running, or `CYBERNET_SERVER_URL` wrong |
| Events disappear after a few hours | No volume mounted at `/app/data` |
| Agent logs `ECONNRESET` during deploy | Normal while Cloud Run recycles the instance |