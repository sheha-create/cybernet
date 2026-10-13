import fs from 'fs';
import zlib from 'zlib';
import http from 'http';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
);
initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID });
const cred = await signInWithEmailAndPassword(getAuth(), process.argv[2], process.argv[3]);
const token = await cred.user.getIdToken();

// Raw socket so nothing auto-decompresses; this is the byte count Railway meters.
const raw = await new Promise((resolve, reject) => {
  const req = http.get({ host: '127.0.0.1', port: 3001, path: `/sse/metrics?token=${encodeURIComponent(token)}`, headers: { 'Accept-Encoding': 'gzip' } }, res => {
    const chunks = [];
    const timer = setTimeout(() => { req.destroy(); resolve({ chunks, headers: res.headers }); }, 13000);
    res.on('data', c => chunks.push(c));
    res.on('end', () => { clearTimeout(timer); resolve({ chunks, headers: res.headers }); });
  });
  req.on('error', reject);
});

const wire = Buffer.concat(raw.chunks);
// Streaming decode: the stream is cut mid-frame, so a one-shot gunzip would fail.
let plain = '';
await new Promise(resolve => {
  const gunzip = zlib.createGunzip();
  gunzip.on('data', d => { plain += d.toString(); });
  gunzip.on('end', resolve);
  gunzip.on('error', resolve);
  gunzip.end(wire);
});
const frames = plain.split('\n\n').filter(f => f.includes('event: metrics'));

console.log('content-encoding   :', raw.headers['content-encoding']);
console.log('wire bytes on socket:', wire.length);
console.log('plaintext bytes    :', plain.length);
console.log('metrics frames     :', frames.length);
console.log('avg frame compressed:', frames.length ? Math.round(wire.length / frames.length) + ' B' : 'n/a');
console.log('avg frame plaintext :', frames.length ? Math.round(plain.length / frames.length) + ' B' : 'n/a');
console.log('compression ratio  :', plain.length ? (wire.length / plain.length).toFixed(3) : 'n/a');
process.exit(0);