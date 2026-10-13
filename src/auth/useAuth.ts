import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, EmailAuthProvider } from 'firebase/auth';
import { auth } from './firebaseClient';

export type AuthState = {
  user: User | null;
  loading: boolean;
};

export function useAuthState(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!auth); // only loading if Firebase is configured

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { user, loading };
}

export async function loginWithGoogle() {
  if (!auth) throw new Error('Firebase not configured');
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

export async function loginWithEmail() {
  if (!auth) throw new Error('Firebase not configured');
  const provider = new EmailAuthProvider();
  await signInWithPopup(auth, provider);
}

export async function logout() {
  if (!auth) return;
  await auth.signOut();
}

