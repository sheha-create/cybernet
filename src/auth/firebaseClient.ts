import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import type { Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Deliberately no hardcoded fallbacks. A stale fallback silently points the browser
// at a different Firebase project, which surfaces as an unexplained login failure.
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseProjectId = firebaseConfig.projectId ?? null;

export const firebaseConfigError: string | null = missingKeys.length
  ? `Firebase is not configured: ${missingKeys.join(', ')} missing from .env.`
  : null;

function createAuth(): Auth {
  if (firebaseConfigError) throw new Error(firebaseConfigError);
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig as Required<typeof firebaseConfig>);
  return getAuth(app);
}

export const auth: Auth = createAuth();