/**
 * Resolves the base URL for API requests.
 *
 * Empty by default, which keeps requests same-origin. That is the correct setup when
 * a single host serves both the frontend and the API, either directly or through a
 * reverse proxy that forwards /api and /sse to the backend.
 *
 * Set VITE_API_BASE_URL when the frontend and the API live on different hosts, for
 * example the frontend on a static CDN and the API on a container host:
 *
 *   VITE_API_BASE_URL=https://cybernet-api.up.railway.app
 *
 * In that arrangement the API must also allow CORS from the frontend origin, which
 * the server does for the routes it serves.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/** Joins the configured base with an API path, avoiding a double slash. */
export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return `${API_BASE_URL}/${path}`;
  return `${API_BASE_URL}${path}`;
}