export interface ApiError {
  status: number;
  code?: string;
  message: string;
}

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch {}
    throw new HttpError(body?.error || res.statusText, res.status, body?.code);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return res.text() as unknown as T;
}

export function get<T>(path: string, params?: Record<string, unknown> | object) {
  const url = buildUrl(path, params as Record<string, unknown>);
  return api<T>(url, { method: 'GET' });
}

export function post<T>(path: string, body?: unknown, options?: RequestInit) {
  return api<T>(path, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    ...options,
  });
}

export function patch<T>(path: string, body?: unknown) {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
}

export function put<T>(path: string, body?: unknown) {
  return api<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
}

export function del<T>(path: string) {
  return api<T>(path, { method: 'DELETE' });
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  if (!params) return path;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.append(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${path}?${qs}` : path;
}

export { HttpError };