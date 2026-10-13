/**
 * CYBERNET — Cloud Functions entry point.
 *
 * IMPORTANT — read before deploying this.
 *
 * The previous version of this file returned invented numbers: a hardcoded
 * `storageUsage` of 50, a CPU floor of 5%, a health floor of 60, three fabricated
 * processes, and network interfaces reported as `os: 'router', status: 'secured'`.
 * None of that was measured. It has been removed.
 *
 * A Cloud Function also cannot do most of what this product needs:
 *
 *   - It cannot report the CPU, memory or listening ports of a *user's own PC*.
 *     That is what the collector agent (`agent/collector.mjs`) exists for.
 *   - It has an ephemeral filesystem, so the SQLite event store cannot live here.
 *   - It does not support long-lived connections, so the `/sse/metrics` stream
 *     cannot run here.
 *
 * The supported production topology is therefore:
 *
 *   Firebase Hosting  ->  static frontend (dist/)
 *   Cloud Run         ->  this project's real server.js (see Dockerfile)
 *   Firestore         ->  future replacement for the SQLite event store
 *
 * `firebase.json` routes `/api/**` and `/sse/**` to the `cybernet-api` Cloud Run
 * service, NOT to a function. These functions are intentionally minimal: they
 * exist only to answer a health probe for the Hosting deployment, and they report
 * nothing they have not actually measured.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { cpus, freemem, platform, arch, totalmem } from 'os';

admin.initializeApp();

const REGION = 'us-central1';

async function requireAuth(req: functions.https.Request): Promise<admin.auth.DecodedIdToken> {
  const header = req.headers.authorization;
  let token: string | undefined;

  if (header?.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length);
  } else if (typeof req.query.token === 'string' && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    throw new functions.https.HttpsError('unauthenticated', 'Missing Bearer or query token');
  }
  return admin.auth().verifyIdToken(token);
}

/**
 * Only values that can be read directly from the runtime are returned. Anything
 * that would require guessing is reported as null with a reason.
 */
function measuredRuntimeFacts() {
  const totalMemory = totalmem();
  const freeMemory = freemem();

  return {
    region: REGION,
    functionInstance: process.env.FUNCTION_TARGET ?? 'unknown',
    nodeVersion: process.version,
    platform: platform(),
    arch: arch(),
    cpuCount: cpus().length,
    totalMemoryBytes: totalMemory,
    freeMemoryBytes: freeMemory,
    memoryUsagePercent: totalMemory > 0
      ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100)
      : null,
    instanceUptimeSeconds: Math.round(process.uptime()),
  };
}

export const api = functions.https.onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const path = req.path;

    if (path.endsWith('/api/health') || path.endsWith('/health')) {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
      return;
    }

    // Unauthenticated liveness probe that deliberately exposes nothing sensitive.
    if (path.endsWith('/api/ping') || path.endsWith('/ping')) {
      res.json({ ok: true, region: REGION, timestamp: new Date().toISOString() });
      return;
    }

    await requireAuth(req);

    if (path.endsWith('/api/runtime') || path.endsWith('/runtime')) {
      res.json(measuredRuntimeFacts());
      return;
    }

    res.status(501).json({
      error: 'This endpoint is served by the cybernet-api Cloud Run service, not by Cloud Functions.',
      hint: 'Hosting rewrites for /api/** point at Cloud Run. A direct call to this function URL is not supported.',
    });
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    res.status(code === 'unauthenticated' ? 401 : 403).json({
      error: error instanceof Error ? error.message : 'Request rejected',
    });
  }
});
