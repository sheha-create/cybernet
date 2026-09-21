# Cybernet Full Stack

This project includes a React/Vite frontend and an Express backend with real-time WebSocket alerts.

## What was added

- `server.js` now captures every incoming request and resolves the real visitor IP using `x-forwarded-for` or `req.socket.remoteAddress`.
- The backend calls `https://ipapi.co/{ip}/json/` for geolocation and `https://api.abuseipdb.com/api/v2/check` for abuse reputation.
- Requests are stored in SQLite in `data/visits.sqlite` with fields for IP, country, city, ISP, ASN, abuse score, timestamp, and flagged state.
- A `ws` WebSocket server runs on the same backend port and broadcasts live alert objects for flagged visitor events.
- The frontend now connects to `ws://localhost:3001` and injects live alert messages into the Threat Feed with a `LIVE` badge.
- The IP Lookup panel posts to `/api/lookup/{ip}` instead of calling ipapi directly.
- Added backend endpoints:
  - `GET /api/visits` — returns the last 200 logged visits for the Geolocation Map.
  - `GET /api/stats` — returns total visits, unique IPs, flagged count, and top countries for the Overview panel.
- The AbuseIPDB API key is stored in `.env`.

## Setup

1. Install dependencies:

```bash
cd cybernet
npm install
```

2. Verify the `.env` file exists with your AbuseIPDB key:

```env
ABUSEIPDB_API_KEY=your_api_key_here
```

3. Run the full stack in development:

```bash
npm run dev:full
```

This starts the frontend plus the backend server.

## Getting a free AbuseIPDB API key

1. Go to https://www.abuseipdb.com/
2. Sign up for an account.
3. Visit your account dashboard.
4. Copy the API key and paste it into `cybernet/.env` as `ABUSEIPDB_API_KEY`.

## Notes

- The backend listens on port `3001`.
- The frontend connects to `ws://localhost:3001` for live alerts.
- Visit markers and the Overview panel now use real backend data when the server is available.
