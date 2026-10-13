import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, GoogleAuthProvider, signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, firebaseConfigError } from './firebaseClient';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  getIdToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  doLogout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const LEGACY_DEMO_KEYS = ['cybernet_demo_mode', 'cybernet-demo-user'];

function clearLegacyDemoState() {
  for (const key of LEGACY_DEMO_KEYS) {
    try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // An earlier build persisted a demo session under these keys. Leaving them in
  // place made the app boot into a fake signed-in state, which then failed every
  // authenticated request. Clear them once on start-up.
  useEffect(() => { clearLegacyDemoState(); }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, nextUser => {
      setUser(nextUser);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Memoised so the identity is stable across renders; several polling hooks list
  // getIdToken in their dependency arrays.
  const getIdToken = useMemo(
    () => async () => (user ? user.getIdToken() : null),
    [user],
  );

  const notConfigured = () => {
    throw new Error(firebaseConfigError ?? 'Firebase authentication is not configured');
  };

  const signInWithGoogle = useMemo(() => async () => {
    if (!auth) return notConfigured();
    await signInWithPopup(auth, new GoogleAuthProvider());
  }, []);

  const signInEmail = useMemo(() => async (email: string, password: string) => {
    if (!auth) return notConfigured();
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpEmail = useMemo(() => async (email: string, password: string) => {
    if (!auth) return notConfigured();
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const resetPassword = useMemo(() => async (email: string) => {
    if (!auth) return notConfigured();
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useMemo(() => async () => {
    clearLegacyDemoState();
    setUser(null);
    if (auth) await signOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      getIdToken,
      signInWithGoogle,
      signInEmail,
      signUpEmail,
      resetPassword,
      logout,
      doLogout: logout,
    }),
    [user, loading, getIdToken, signInWithGoogle, signInEmail, signUpEmail, resetPassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    const noop = async () => {};
    return {
      user: null,
      loading: false,
      getIdToken: async () => null,
      signInWithGoogle: noop,
      signInEmail: noop,
      signUpEmail: noop,
      resetPassword: noop,
      logout: noop,
      doLogout: noop,
    };
  }
  return ctx;
}

export const useAuth = useAuthContext;