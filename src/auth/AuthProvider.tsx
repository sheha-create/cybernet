import React, { createContext, useContext, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { useAuthState, logout } from './useAuth';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  getIdToken: () => Promise<string | null>;
  doLogout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthState();
  const [token, setToken] = useState<string | null>(null);

  const getIdToken = async () => {
    if (!user) return null;
    const t = await user.getIdToken();
    setToken(t);
    return t;
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      getIdToken,
      doLogout: async () => logout(),
    }),
    [user, loading, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuthContext must be used within AuthProvider');
  return v;
}

