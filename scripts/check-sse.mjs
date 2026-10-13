import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs';
import zlib from 'zlib';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
);

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

const cred = await signInWithEmailAndPassword(getAuth(app), process.argv[2], process.argv[3]);
const token = await cred.user.getIdToken();
console.log('signed in as', cred.user.uid);

const res = await fetch(`http://localhost:3001/sse/metrics?token=${encodeURIComponent(token)}`);
console.log('status      :', res.status);
console.log('encoding    :', res.headers.get('content-encoding'));
console.log('content-type:', res.headers.get('content-type'));

const reader = res.body.getReader();
const chunks = [];
const deadline = Date.now() + 14000;
while (Date.now() < deadline) {
  const { value, done } = await reader.read();
  if (done) break;
  chunks.push(Buffer.from(value));
  if (chunks.reduce((a, b) => a + b.length, 0) > 12000) break;
}
reader.cancel().catch(() => {});
const raw = Buffer.concat(chunks);

console.log('wire bytes  :', raw.length);
let text;
try {
  text = zlib.gunzipSync(raw).toString();
  console.log('gunzip      : OK');
} catch (e) {
  text = raw.toString();
  console.log('gunzip      : n/a (' + e.message + ')');
}
const frames = text.split('\n\n').filter(f => f.includes('event:'));
console.log('events      :', frames.length);
console.log('sample      :', (frames[0] || '').slice(0, 120));
const dupes = new Set(frames).size !== frames.length;
console.log('duplicate frames suppressed:', dupes ? 'NO (dedupe broken)' : 'yes');

// The SSE stream never closes, so the event loop would keep the process alive.
process.exit(0);