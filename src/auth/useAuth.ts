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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { user, loading };
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

// Email provider via popup (requires Firebase Auth Email link/credential settings in console)
export async function loginWithEmail() {
  const provider = new EmailAuthProvider();
  await signInWithPopup(auth, provider);
}

export async function logout() {
  await auth.signOut();
}

