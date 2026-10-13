import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [guestMode, setGuestMode] = useState(false);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#050d1a', fontFamily: 'JetBrains Mono, monospace',
      }}>
        <div style={{ color: '#00f5d4', fontSize: 13, letterSpacing: '0.1em' }} className="animate-pulse">
          <span style={{ marginRight: 8 }}>⬡</span>CYBERNET INITIALIZING AUTHENTICATION…
        </div>
      </div>
    );
  }

  if (!user && !guestMode) {
    return <LoginScreen onGuestContinue={() => setGuestMode(true)} />;
  }

  if (!user && guestMode) {
    // Be explicit about what guest mode can and cannot show, rather than letting
    // empty panels look like a broken account.
    //
    // The banner sits in normal flow above the app. It used to be position:fixed at
    // z-index 60, which painted over the navbar (z-index 50) and pushed the content
    // down by a fixed 28px that did not match the navbar's actual height.
    return (
      <div className="h-full flex flex-col" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        <div
          role="status"
          style={{
            flexShrink: 0,
            background: 'rgba(255,204,0,0.08)', borderBottom: '1px solid rgba(255,204,0,0.35)',
            padding: '7px 12px', color: '#ffcc00', fontSize: 11, letterSpacing: '0.04em',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}
        >
          <span>
            NOT SIGNED IN — showing only this server&apos;s own host metrics. Your account&apos;s
            agents, alerts, scans and per-IP data are unavailable until you sign in.
          </span>
          <button
            onClick={() => setGuestMode(false)}
            style={{
              marginLeft: 'auto', background: 'rgba(255,204,0,0.15)',
              border: '1px solid rgba(255,204,0,0.4)', color: '#ffcc00',
              fontSize: 11, padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap',
            }}
          >
            Sign in
          </button>
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    );
  }

  return <>{children}</>;
}