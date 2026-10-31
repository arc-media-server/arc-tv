// Arc's /api/v1, the stable API the Android app uses too. Requests carry the token as a Bearer
// header (Arc ignores cookies on cross-origin calls). Field names follow docs/api-v1-contract.txt.

export class ApiError extends Error {
  constructor(public status: number, message: string, public needs?: string) {
    super(message);
  }
}

let server = '';
let token = '';

/** Sets the server (e.g. "http://192.168.1.10:8099", or "" for the dev proxy) and token. */
export function configure(next: { server?: string; token?: string }) {
  if (next.server !== undefined) server = next.server.replace(/\/+$/, '');
  if (next.token !== undefined) token = next.token;
}

export function serverURL(path: string): string {
  return /^https?:/.test(path) ? path : server + path;
}

/** Calls /api/v1{path}. Arc's own links (e.g. "/api/items/1/images/primary") are versioned too. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const url = serverURL(versioned(path));
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20000);
  init.signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      credentials: 'omit',
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data.needs);
    if (res.status === 202) return { ...data, waiting: true } as T;
    return data as T;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Fetches an authorised binary (artwork) as a Blob. */
export async function apiBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(serverURL(versioned(path)), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
    credentials: 'omit',
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}

function versioned(path: string): string {
  if (path.startsWith('/api/v1/') || /^https?:/.test(path)) return path;
  if (path.startsWith('/api/')) return '/api/v1/' + path.slice(5);
  return '/api/v1' + (path.startsWith('/') ? path : '/' + path);
}

// --- Types (only the fields this app reads) ---

export interface Discovered { product: string; id: string; name: string; version: string; api_version: number }

export interface Profile { id: string; name: string; color: string; has_pin: boolean; is_admin: boolean }

export interface AuthStatus { signed_in: boolean; profile: Profile | null; profiles: Profile[] }

export interface UserData { position_ms?: number; played: boolean }

export interface Item {
  id: string;
  kind: 'movie' | 'series' | 'episode' | string;
  title: string;
  year?: number;
  overview?: string;
  tagline?: string;
  runtime_min?: number;
  content_rating?: string;
  genres?: string[];
  series_title?: string;
  season_number?: number;
  episode_number?: number;
  parent_id?: string;
  images?: { primary?: string; backdrop?: string; backdrop_full?: string; logo?: string };
  user_data?: UserData;
  unwatched_count?: number;
}

export interface Library { id: number; name: string; kind: string; count: number }

export interface RecommendedRow { id: string; title: string; items: Item[] }

export interface Season { season_number: number; name: string; episodes: (Item & { available: boolean })[] }

export interface Marker { kind: string; start_ms: number; end_ms: number }

export interface Playback {
  method: 'direct' | 'remux' | 'transcode' | string;
  url: string;
  hls: boolean;
  session_id?: string;
  offset_ms: number;
  duration_ms: number;
  markers?: Marker[];
  reasons?: string[];
}
