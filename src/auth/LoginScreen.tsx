import React, { useState } from 'react';
import { loginWithEmail, loginWithGoogle } from './useAuth';

type Props = {
  onAuthed?: () => void;
};



const LoginScreen: React.FC<Props> = ({ onAuthed }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError('');
    try {
      await fn();
      onAuthed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--cyber-bg, #050d1a)',
        padding: 16,
      }}
    >
      <div className="cyber-card" style={{ width: 420, padding: 24 }}>
        <div className="font-mono" style={{ color: '#00f5d4', fontSize: 14, marginBottom: 8 }}>
          ⬡ CYBERNET // Sign in
        </div>
        <div className="font-mono" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 18 }}>
          OAuth-protected dashboard.
        </div>

        <div className="flex flex-col gap-2">
          <button
            disabled={loading}
            onClick={() => run(loginWithGoogle)}
            className="font-mono text-xs px-3 py-2 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)] transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>

          <button
            disabled={loading}
            onClick={() => run(loginWithEmail)}
            className="font-mono text-xs px-3 py-2 rounded border border-[rgba(255,45,85,0.3)] text-[#ff2d55] hover:bg-[rgba(255,45,85,0.08)] transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Continue with Email'}
          </button>
        </div>

        {error && (
          <div
            className="font-mono text-[11px]"
            style={{ color: '#ff2d55', marginTop: 12, lineHeight: 1.3 }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginScreen;

