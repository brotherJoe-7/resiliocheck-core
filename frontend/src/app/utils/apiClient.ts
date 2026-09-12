const PRODUCTION_API = 'https://resiliocheck-api-451012324874.europe-west1.run.app';

export const TOKEN_KEY = 'rc_token';
export const USER_KEY = 'rc_user';

/** Custom event fired when the backend rejects our token (401). */
export const UNAUTHORIZED_EVENT = 'rc:unauthorized';

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || PRODUCTION_API;
  return raw.replace(/\/+$/, '');
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Low-level fetch wrapper: prefixes the API base URL and attaches the bearer
 * token. On a 401 it clears the stored session and notifies the AuthProvider
 * so the user is redirected to /login.
 */
export async function fetchApi(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 && typeof window !== 'undefined' && !endpoint.includes('/api/auth/login') && !endpoint.includes('/api/auth/register')) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
  return res;
}

/** Extract a human-readable message from a FastAPI error response. */
export async function readError(res: Response, fallback = 'Request failed'): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) {
      // Pydantic validation errors
      return data.detail.map((d: { msg?: string; loc?: unknown[] }) => `${(d.loc || []).slice(-1)[0] ?? ''}: ${d.msg ?? ''}`.trim()).join('; ');
    }
    if (data?.message) return String(data.message);
  } catch {
    /* non-JSON body */
  }
  return `${fallback} (HTTP ${res.status})`;
}

/**
 * Convenience helper: fetch + parse JSON, throwing an ApiError with a clean
 * message on non-2xx responses.
 */
export async function apiJson<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetchApi(endpoint, options);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError(`Cannot reach the ResilioCheck API (${msg}). Check that the backend is running.`, 0);
  }
  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }
  return (await res.json()) as T;
}
