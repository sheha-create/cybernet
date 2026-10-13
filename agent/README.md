# CYBERNET collector agent

Reports this machine's **real** CPU, memory, storage, network, listening-port and
firewall figures to your CYBERNET server. It reads only the operating system's own
counters through Node's `os` module and `netstat`/`ss`, and sends nothing else.

## 1. Generate your token

You cannot create the token yourself — the server issues it, because the token is
what links the agent to your signed-in account.

1. Start the app: `npm run dev`
2. Open http://localhost:5173 and **sign in**
3. Open the **Config** tab
4. Under **Collector Agent**, type a label (for example `My Desktop`) and click
   **Generate token**
5. The token is displayed **once**. Copy it immediately — it is stored only as a
   SHA-256 hash, so it cannot be shown again.

If you lose the token, generate a new one and revoke the old one. Tokens are
independent: revoking one does not affect the others.

## 2. Configure the agent

Copy the template and paste in your values:

```cmd
copy agent\.env.example agent\.env
notepad agent\.env
```

```
CYBERNET_SERVER_URL=http://localhost:3001
CYBERNET_AGENT_TOKEN=cyb_...your token...
CYBERNET_INTERVAL_MS=5000
```

Use your machine's LAN address instead of `localhost` if the server runs on a
different computer, for example `http://192.168.1.10:3001`.

## 3. Run it

```cmd
node agent\collector.mjs
```

Expected output:

```
CYBERNET collector starting
  server : http://localhost:3001
  host   : DESKTOP-6UKFPFJ (win32 x64)
  every  : 5000ms
```

Leave it running. The dashboard's **Scans** tab and **Core Load Map** populate
within one reporting interval.

You can also skip the `.env` file entirely:

```cmd
node agent\collector.mjs --server http://localhost:3001 --token cyb_... --interval 5000
```

## 4. Stop and revoke

Press `Ctrl+C` to stop the agent. To permanently revoke access, click **Revoke** on
the token in the Config tab — the agent then exits immediately on its next report.

## Troubleshooting

| Message | Cause |
| --- | --- |
| `Missing agent token.` | No `--token` and no `agent/.env` |
| `Agent token rejected.` | Token was revoked or belongs to another account. Generate a new one. |
| `report failed (n): fetch failed (ECONNREFUSED)` | Server not running, or `CYBERNET_SERVER_URL` wrong |
| `report failed (n): fetch failed (ECONNRESET)` | Normal for a few seconds while the server restarts or redeploys |
| `Network counters unavailable` | Port rates report 0; CPU and memory still work |
| `Could not read listening ports` | Scan findings will show "no listening port data" |

## Pointing at a deployed server

Set `CYBERNET_SERVER_URL` to your Cloud Run URL:

```
CYBERNET_SERVER_URL=https://cybernet-api-xxxxx-uc.a.run.app
CYBERNET_AGENT_TOKEN=cyb_...
```

Generate the token from the **Config** tab of the deployed site, not the local one —
tokens are tied to the Firebase project, and the agent must reach the deployed API.

## What is reported

`hostname`, `platform`, `osRelease`, `cpuUsage`, `cpuCores[]`, `cpuModel`,
`memoryUsage`, `totalMemoryBytes`, `freeMemoryBytes`, `storageUsage`,
`uptimeSeconds`, `networkInBps`, `networkOutBps`, `primaryIp`, `interfaceCount`,
`localIps[]`, `listeningPorts[]`, `firewall`.

The agent holds no other permissions and opens no listening sockets itself.
