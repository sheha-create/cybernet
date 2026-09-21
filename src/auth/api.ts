import { useAuthContext } from './AuthProvider';

export type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function useAuthedFetch(): ApiFetch {
  const { getIdToken } = useAuthContext();

  return async (input, init) => {
    const token = await getIdToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

