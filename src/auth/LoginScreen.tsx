import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { describeAuthError } from './authErrors';
import { firebaseConfigError, firebaseProjectId } from './firebaseClient';

type Mode = 'login' | 'signup' | 'reset';

interface LoginScreenProps {
  onGuestContinue?: () => void;
}

export default function LoginScreen({ onGuestContinue }: LoginScreenProps) {
  const { signInWithGoogle, signInEmail, signUpEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(firebaseConfigError ?? '');
  const [notice, setNotice] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError('');
    try {
      await fn();
    } catch (e: unknown) {
      setError(describeAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (mode === 'login') run(() => signInEmail(address, password));
    if (mode === 'signup') {
      run(async () => {
        await signUpEmail(address, password);
        setNotice('Account created. You are now signed in.');
      });
    }
    if (mode === 'reset') {
      run(async () => {
        await resetPassword(address);
        setResetSent(true);
      });
    }
  };

  const heading = mode === 'login' ? 'Sign in to access the security dashboard'
    : mode === 'signup' ? 'Create your CYBERNET account'
    : 'Reset your password';

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--cyber-bg, #050d1a)', padding: 16, fontFamily: 'JetBrains Mono, monospace',
    }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(0,245,212,0.08) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />

      <div style={{
        width: '100%', maxWidth: 400, position: 'relative', zIndex: 1,
        background: 'rgba(10,22,40,0.95)',
        border: '1px solid rgba(0,245,212,0.2)',
        boxShadow: '0 0 40px rgba(0,245,212,0.1)',
        borderRadius: 6, padding: 32,
      }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ color: '#00f5d4', fontSize: 20, fontWeight: 700, letterSpacing: '0.15em', textShadow: '0 0 16px rgba(0,245,212,0.6)' }}>
            ⬡ CYBERNET
          </div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 4 }}>{heading}</div>
        </div>

        {resetSent ? (
          <div>
            <div style={{ color: '#00f5d4', fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
              ✓ Reset link sent to {email.trim()}. Check your inbox.
            </div>
            <button onClick={() => { setResetSent(false); setMode('login'); }} style={btnStyle('secondary')}>
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            {mode !== 'reset' && (
              <button
                disabled={loading || Boolean(firebaseConfigError)}
                onClick={() => run(signInWithGoogle)}
                style={{ ...btnStyle('google'), marginBottom: 16 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" style={{ marginRight: 8, flexShrink: 0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {loading ? 'Signing in…' : 'Continue with Google'}
              </button>
            )}

            {mode !== 'reset' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>OR</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </div>

              {mode !== 'reset' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(''); }}
                      required
                      minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      placeholder="••••••••"
                      style={{ ...inputStyle, paddingRight: 58 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-40%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                      }}
                    >
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div style={{ color: '#ff6b8a', fontSize: 11, marginBottom: 12, padding: '8px 10px', background: 'rgba(255,45,85,0.08)', border: '1px solid rgba(255,45,85,0.25)', borderRadius: 4, lineHeight: 1.5 }}>
                  {error}
                </div>
              )}

              {notice && (
                <div style={{ color: '#00f5d4', fontSize: 11, marginBottom: 12, padding: '8px 10px', background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.25)', borderRadius: 4, lineHeight: 1.5 }}>
                  {notice}
                </div>
              )}

              <button type="submit" disabled={loading || Boolean(firebaseConfigError)} style={btnStyle('primary')}>
                {loading ? 'Please wait…'
                  : mode === 'login' ? 'Sign In'
                  : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
              </button>
            </form>

            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              {mode === 'login' && (
                <>
                  <button onClick={() => { setMode('signup'); setError(''); setNotice(''); }} style={linkStyle}>
                    Don't have an account? Sign up
                  </button>
                  <button onClick={() => { setMode('reset'); setError(''); setNotice(''); }} style={linkStyle}>
                    Forgot password?
                  </button>
                </>
              )}
              {(mode === 'signup' || mode === 'reset') && (
                <button onClick={() => { setMode('login'); setError(''); setNotice(''); }} style={linkStyle}>
                  Back to Sign In
                </button>
              )}
              {onGuestContinue && (
                <button
                  type="button"
                  onClick={onGuestContinue}
                  style={{
                    marginTop: 8, background: 'none',
                    border: '1px dashed rgba(0,245,212,0.3)', borderRadius: 4,
                    padding: '6px 12px', color: 'rgba(0,245,212,0.8)',
                    fontSize: 11, fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer',
                  }}
                >
                  View server host metrics without signing in →
                </button>
              )}
            </div>
          </>
        )}

        {firebaseProjectId && (
          <div style={{
            marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 9, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6,
          }}>
            Firebase project: <span style={{ color: 'rgba(0,245,212,0.55)' }}>{firebaseProjectId}</span>
            {firebaseConfigError && (
              <div style={{ color: '#ff2d55', marginTop: 6 }}>{firebaseConfigError}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(0,245,212,0.2)',
  borderRadius: 4, padding: '8px 10px',
  color: '#e0e0e0', fontSize: 12,
  fontFamily: 'JetBrains Mono, monospace',
  outline: 'none', marginTop: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10, color: 'rgba(255,255,255,0.4)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

function btnStyle(variant: 'primary' | 'secondary' | 'google'): React.CSSProperties {
  const base: React.CSSProperties = {
    width: '100%', padding: '10px 16px', borderRadius: 4,
    fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.2s',
    border: 'none',
  };
  if (variant === 'primary') return { ...base, background: 'rgba(0,245,212,0.15)', border: '1px solid rgba(0,245,212,0.4)', color: '#00f5d4' };
  if (variant === 'google') return { ...base, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#e0e0e0' };
  return { ...base, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' };
}

const linkStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'rgba(0,245,212,0.6)', fontSize: 11,
  fontFamily: 'JetBrains Mono, monospace',
  textDecoration: 'underline',
};