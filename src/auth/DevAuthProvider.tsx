import React, { createContext, useContext, useMemo } from 'react';
import type { AuthContextValue } from './AuthProvider';

const noop = async () => {};

const DevAuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  getIdToken: async () => null,
  signInWithGoogle: noop,
  signInEmail: noop,
  signUpEmail: noop,
  resetPassword: noop,
  logout: noop,
  doLogout: noop,
});

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<AuthContextValue>(() => ({
    user: null,
    loading: false,
    getIdToken: async () => null,
    signInWithGoogle: noop,
    signInEmail: noop,
    signUpEmail: noop,
    resetPassword: noop,
    logout: noop,
    doLogout: noop,
  }), []);

  return <DevAuthContext.Provider value={value}>{children}</DevAuthContext.Provider>;
}

export function useDevAuthContext() {
  return useContext(DevAuthContext);
}