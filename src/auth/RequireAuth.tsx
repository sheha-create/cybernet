import React from 'react';
import { useAuthContext } from './AuthProvider';
import LoginScreen from './LoginScreen';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--cyber-bg, #050d1a)',
        }}
      >
        <div className="font-mono text-[#00f5d4]">Loading auth…</div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  return <>{children}</>;
}

