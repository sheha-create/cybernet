# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Vite inlines VITE_* variables at BUILD time, so the Firebase web config must be
# supplied here or the bundle ships with apiKey: undefined and login is broken.
# These are public client values (they already appear in the browser bundle).
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src

# Fail the build rather than shipping a bundle that cannot authenticate.
RUN node -e "\
const need=['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_STORAGE_BUCKET','VITE_FIREBASE_MESSAGING_SENDER_ID','VITE_FIREBASE_APP_ID'];\
const missing=need.filter(k=>!process.env[k]);\
if(missing.length){console.error('Missing build args: '+missing.join(', '));process.exit(1);}\
console.log('Firebase build config OK for project '+process.env.VITE_FIREBASE_PROJECT_ID);"

RUN npm run build


# ---------- runtime stage ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production
# Railway injects PORT at runtime; this default is only used if it does not.
ENV PORT=8080

WORKDIR /app

COPY package*.json ./

# sqlite3 compiles a native addon, so a toolchain is needed in the image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server.js ./server.js

# /app/data holds the SQLite event store, /app/logs the NDJSON stream.
# Mount a Railway volume at /app/data or the database is lost on every redeploy.
RUN mkdir -p /app/data /app/logs && chown -R node:node /app
USER node

EXPOSE 8080

# Railway restarts the container when the healthcheck fails, so this must reflect
# real liveness rather than a dependency that may be absent at boot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The heap is capped below the Free plan's 512 MB limit so a traffic spike triggers
# a clean restart instead of an out-of-memory kill of the whole container.
CMD ["node", "--max-old-space-size=320", "server.js"]