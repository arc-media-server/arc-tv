// Arc's /api/v1, the stable API the Android app uses too. Requests carry the token as a Bearer
// header (Arc ignores cookies on cross-origin calls). Field names follow docs/api-v1-contract.txt;
// only the fields this app reads are typed.

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
  return /^https?:/.test(path) ? path : server + versioned(path);
}

/** Arc's own links (e.g. "/api/items/1/images/primary") are answered under /api/v1 too. */
function versioned(path: string): string {
  if (path.startsWith('/api/v1/') || /^https?:/.test(path)) return path;
  if (path.startsWith('/api/')) return '/api/v1/' + path.slice(5);
  return '/api/v1' + (path.startsWith('/') ? path : '/' + path);
}

export const enc = encodeURIComponent;

type Init = { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number };

/** Calls /api/v1{path}; 204 answers undefined, 202 adds `waiting: true`. */
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20000);
  if (init.signal) init.signal.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(serverURL(path), {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      credentials: 'omit',
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || res.statusText, data.needs);
    if (res.status === 202) return { ...data, waiting: true } as T;
    return data as T;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Like api(), but a 404 answers null (things a server may not have: palettes, trickplay, a queue). */
export async function apiOrNull<T>(path: string, init: Init = {}): Promise<T | null> {
  try {
    return await api<T>(path, init);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Fetches an authorised binary (artwork, thumbnails) as a Blob. */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(serverURL(path), { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'omit' });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}

/** Fetches an authorised text file (WebVTT subtitles). */
export async function apiText(path: string): Promise<string> {
  const res = await fetch(serverURL(path), { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'omit' });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.text();
}

export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (v === undefined || v === null || v === '' || v === false) continue;
    parts.push(`${enc(k)}=${enc(String(v === true ? 1 : v))}`);
  }
  return parts.length ? '?' + parts.join('&') : '';
}

// --- Types ---

export interface Discovered { product: string; id: string; name: string; version: string; api_version: number }

export interface Profile { id: string; name: string; color: string; has_pin: boolean; is_admin: boolean }

export interface AuthStatus { signed_in: boolean; password_session?: boolean; friend?: boolean; profile: Profile | null; profiles: Profile[] }

export interface Identity { id: string; name: string; version: string }

export interface UserData { position_ms?: number; played: boolean; watchlisted?: boolean }

export interface Images {
  primary?: string; backdrop?: string; backdrop_full?: string; logo?: string;
  series_primary?: string; series_backdrop?: string; series_logo?: string; season_primary?: string;
}

export interface MediaStream {
  index: number; kind: string; codec?: string; profile?: string; language?: string; title?: string;
  width?: number; height?: number; aspect_ratio?: number; frame_rate?: number; bitrate?: number; bit_depth?: number;
  channels?: number; color_primaries?: string; color_transfer?: string; dolby_vision?: boolean;
  dolby_vision_profile?: number; hdr10_plus?: boolean; is_forced?: boolean;
}

export interface MediaFile {
  id: number; duration_ms?: number; missing?: boolean; container?: string; size?: number; bitrate?: number;
  path?: string; edition?: string; part?: number; probe_error?: string; streams?: MediaStream[];
}

export interface Credit { person_id: number; name: string; role: string; character?: string; image?: string }
export interface Extra { id: string; title: string; kind: string; stream_url: string; duration_ms?: number }
export interface CollectionRef { id: string; title: string; kind?: string; count?: number; images?: Images }

export interface Item {
  id: string;
  library_id?: number;
  kind: 'movie' | 'series' | 'episode' | string;
  parent_id?: string;
  title: string;
  year?: number;
  overview?: string;
  tagline?: string;
  release_date?: string;
  studio?: string;
  original_language?: string;
  runtime_min?: number;
  content_rating?: string;
  rating?: number;
  genres?: string[];
  series_title?: string;
  season_number?: number;
  episode_number?: number;
  images?: Images;
  user_data?: UserData;
  unwatched_count?: number;
  files?: MediaFile[];
  available?: boolean;
  credits?: Credit[];
  extras?: Extra[];
  collections?: CollectionRef[];
}

export interface Library { id: number; name: string; kind: 'movies' | 'shows' | 'videos' | string; count: number }

export interface ItemPage { total: number; offset?: number; items: Item[]; letters?: { letter: string; count: number }[] }

export interface Facets { genres?: { value: string; count: number }[]; decades?: { value: string; count: number }[]; resolutions?: { value: string; count: number }[] }

export interface RecommendedRow { id?: string; type: string; title: string; name?: string; genre?: string; role?: string; style?: string; items: Item[] }

export interface RecentCard { type: 'series' | 'season' | 'episode' | string; item: Item; season_number?: number; episodes?: number; season_poster?: string }

export interface HomeRowPref { id: string; hidden?: boolean; title?: string; filter?: Record<string, unknown>; style?: string; shows_only?: boolean; posters?: string }

export interface Prefs {
  home?: HomeRowPref[];
  split_up_next?: boolean;
  library_order?: number[];
  watchlist_position?: number;
  subtitle_language?: string;
  subtitle_mode?: string;
  audio_language?: string;
  auto_play?: boolean;
  auto_skip?: boolean;
  subtitle_style?: { size?: string; color?: string; background?: string; position?: string };
}

export interface Person { id: number; name: string; image?: string; count?: number; known_for?: string }
export interface SearchResults { movies?: Item[]; shows?: Item[]; episodes?: Item[]; people?: Person[] }
export interface PersonPage { person: Person; credits: { item: Item; roles?: string[]; character?: string }[] }

export interface Season { season_number: number; name: string; poster?: string; episodes: Item[] }
export interface SeasonsResponse { series: Item; seasons: Season[]; unplaced?: Item[] }

export interface CollectionPage { collection: CollectionRef; items: Item[] }
export interface PlaylistPage { playlist: { id: string; title: string }; entries: { entry_id: number; item: Item }[] }

export interface Palette { available: boolean; colors?: { top_left: string; top_right: string; bottom_left: string; bottom_right: string } }

export interface Marker { kind: string; start_ms: number; end_ms: number }
export interface Chapter { start_ms: number; end_ms?: number; title?: string }
export interface AudioTrack { index: number; language?: string; title?: string; codec: string; channels: number; default?: boolean }
export interface SubtitleTrack { id: string; language?: string; title?: string; codec: string; forced?: boolean; default?: boolean; hearing_impaired?: boolean; image?: boolean }
export interface Version { file_id: number; edition?: string; width?: number; height?: number; video_codec?: string; hdr?: string; size?: number }

export interface Playback {
  method: 'direct' | 'remux' | 'transcode' | string;
  url: string;
  hls: boolean;
  reasons?: string[];
  session_id?: string;
  offset_ms: number;
  duration_ms: number;
  file_id: number;
  audio_stream: number;
  audio_tracks?: AudioTrack[];
  subtitle_tracks?: SubtitleTrack[];
  encoder?: string;
  tone_mapped?: boolean;
  versions?: Version[];
  chapters?: Chapter[];
  markers?: Marker[];
  source_kbps?: number;
  server_limit_kbps?: number;
  /** The audio as Arc sends it (codec as ffprobe names it, channels, whether converted). */
  audio_output?: { codec?: string; channels?: number; converted?: boolean };
}

export interface Trickplay { info: { interval_ms: number; width: number; height: number; columns: number; rows: number; count: number }; sheets: string[] }

export interface Capabilities { features?: Record<string, { supported: boolean; available: boolean; allowed: boolean }> }

export interface PlayQueueEntry { id: string; available: boolean; item_id?: string; item?: Item }
export interface PlayQueue { id: string; revision: number; current_entry_id: string; entries: PlayQueueEntry[] }
