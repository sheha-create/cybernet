import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentRegistry } from '../hooks/useBackendData';
import { AuthContext } from '../auth/AuthProvider';

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: () => () => {},
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  GoogleAuthProvider: class {},
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  getAuth: () => ({ name: 'test-auth' }),
}));

const issued = { id: 'agent-1', label: 'My Desktop', token: 'cyb_test', createdAt: new Date().toISOString() };

function wrapper({ children }: { children: React.ReactNode }) {
  const value = {
    user: { uid: 'u1', email: 'a@b.c' },
    loading: false,
    getIdToken: async () => 'fake-token',
    signInWithGoogle: async () => {},
    signInEmail: async () => {},
    signUpEmail: async () => {},
    resetPassword: async () => {},
    logout: async () => {},
    doLogout: async () => {},
  };
  return <AuthContext.Provider value={value as never}>{children}</AuthContext.Provider>;
}

describe('useAgentRegistry', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/agent/list')) {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(url).endsWith('/api/agent/token')) {
        return new Response(JSON.stringify(issued), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(url).endsWith('/api/agent/revoke')) {
        return new Response(JSON.stringify({ revoked: 'agent-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }));
  });

  it('issues a token without throwing "getIdToken is not a function"', async () => {
    const { result } = renderHook(() => useAgentRegistry(), { wrapper });

    let created: unknown = null;
    await act(async () => { created = await result.current.issueToken('My Desktop'); });

    expect(result.current.error).toBe('');
    expect(created).toEqual(issued);
  });

  it('sends the bearer token and the label in the POST body', async () => {
    const { result } = renderHook(() => useAgentRegistry(), { wrapper });
    await act(async () => { await result.current.issueToken('My Desktop'); });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .find(c => String(c[0]).endsWith('/api/agent/token'));
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer fake-token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ label: 'My Desktop' });
    expect(init.method).toBe('POST');
  });

  it('revokes a token without throwing', async () => {
    const { result } = renderHook(() => useAgentRegistry(), { wrapper });
    await act(async () => { await result.current.revoke('agent-1'); });
    expect(result.current.error).toBe('');
  });
});
