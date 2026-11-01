import { api, query, type HomeRowPref, type Item, type Library, type PlaylistPage, type CollectionPage, type Prefs, type RecentCard } from '../api';
import { t } from '../i18n';
import { durationMs, resumeMs } from './format';

// Home's rows, arranged as the web's web/src/lib/home.ts resolveRows and the Android app's
// HomeRows.kt: carrying on watching and the seasonal row first, then the Watchlist where it sits
// among the libraries, each library's Recently Added and its own filter rows in the profile's
// library order, and collections and playlists last. The layout is arranged on the web (Edit
// Home, Reorder libraries); the TV follows it.

export type CardStyle = 'poster' | 'thumb' | 'backdrop';

export type RowSource =
  | { kind: 'continue'; withUpNext: boolean }
  | { kind: 'nextUp' }
  | { kind: 'watchlist' }
  | { kind: 'recent'; library: Library; showsOnly: boolean }
  | { kind: 'custom'; title: string; library: Library; filter: Record<string, unknown> }
  | { kind: 'seasonal'; pick: Seasonal }
  | { kind: 'collection'; id: string; title: string }
  | { kind: 'playlist'; id: string; title: string }
  | { kind: 'queue' };

export interface RowSpec { id: string; source: RowSource; style: CardStyle; seasonPosters?: boolean }

/** A card on a row: a title, or a season of a show with new episodes. */
export interface Card {
  key: string;
  item: Item;
  seasonNumber?: number;
  newEpisodes?: number;
  poster?: string;
  seasonPoster?: string;
  thumb?: string;
  backdrop?: string;
  logo?: string;
  /** How far through, 0–1, or undefined when not started. */
  progress?: number;
  /** A Queue row card: the entry it stands for. */
  queueEntry?: string;
  /** A playlist's picture: up to four of its titles' posters, two by two. */
  mosaic?: string[];
  /** The line under the title, when it isn't the title's own (a playlist's count). */
  sub?: string;
}

type Seasonal = 'romance' | 'horror' | 'christmas';
const seasons: { pick: Seasonal; from: number; to: number; query: Record<string, string> }[] = [
  { pick: 'romance', from: 201, to: 214, query: { kind: 'movie', genre: 'Romance', sort: 'shuffle' } },
  { pick: 'horror', from: 1001, to: 1031, query: { kind: 'movie', genre: 'Horror', sort: 'shuffle' } },
  { pick: 'christmas', from: 1201, to: 1231, query: { kind: 'movie', about: 'christmas,santa,xmas,north pole,reindeer,elves', sort: 'shuffle' } },
];

export function seasonalOn(d: Date): Seasonal | null {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  return seasons.find((s) => md >= s.from && md <= s.to)?.pick ?? null;
}

function styleOf(saved?: string): CardStyle | null {
  return saved === 'poster' ? 'poster' : saved === 'thumb' ? 'thumb' : saved === 'arc' ? 'backdrop' : null;
}

/** The profile's libraries in its own order (Arc's order for any it hasn't placed). */
export function orderLibraries(libs: Library[], order: number[] = []): Library[] {
  const at = (id: number) => { const i = order.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  return libs.slice().sort((a, b) => at(a.id) - at(b.id));
}

export function resolveHomeRows(prefs: Prefs, libraries: Library[], today = new Date()): RowSpec[] {
  const home = prefs.home ?? [];
  const saved: Record<string, HomeRowPref> = {};
  for (const r of home) saved[r.id] = r;
  const shown = (id: string) => !saved[id]?.hidden;
  const out: RowSpec[] = [];
  const carryOn = (id: string, source: RowSource) => out.push({ id, source, style: styleOf(saved[id]?.style) ?? 'thumb', seasonPosters: saved[id]?.posters === 'season' });
  if (shown('continue')) carryOn('continue', { kind: 'continue', withUpNext: !prefs.split_up_next });
  if (prefs.split_up_next && shown('next-up')) carryOn('next-up', { kind: 'nextUp' });
  const pick = seasonalOn(today);
  if (pick && shown('seasonal')) out.push({ id: 'seasonal', source: { kind: 'seasonal', pick }, style: 'poster' });
  const watchlistAt = Math.max(0, Math.min(prefs.watchlist_position ?? 0, libraries.length));
  libraries.forEach((lib, i) => {
    if (i === watchlistAt && shown('watchlist')) out.push({ id: 'watchlist', source: { kind: 'watchlist' }, style: 'poster' });
    // Home videos rarely have posters worth showing: their rows use thumbnails.
    const look: CardStyle = lib.kind === 'videos' ? 'thumb' : 'poster';
    const recent = `recent:${lib.id}`;
    if (shown(recent)) out.push({ id: recent, source: { kind: 'recent', library: lib, showsOnly: !!saved[recent]?.shows_only }, style: look, seasonPosters: true });
    for (const row of home) {
      if (!row.id.startsWith('custom:') || row.hidden || !row.filter || !row.title) continue;
      if (String(row.filter.library_id) !== String(lib.id)) continue;
      out.push({ id: row.id, source: { kind: 'custom', title: row.title, library: lib, filter: row.filter }, style: look });
    }
  });
  if (watchlistAt === libraries.length && shown('watchlist')) out.push({ id: 'watchlist', source: { kind: 'watchlist' }, style: 'poster' });
  for (const row of home) {
    if (row.hidden) continue;
    if (row.id.startsWith('collection:')) out.push({ id: row.id, source: { kind: 'collection', id: row.id.slice(11), title: row.title ?? '' }, style: 'poster' });
    if (row.id.startsWith('playlist:')) out.push({ id: row.id, source: { kind: 'playlist', id: row.id.slice(9), title: row.title ?? '' }, style: 'poster' });
  }
  return out;
}

export function rowTitle(spec: RowSpec): string {
  const s = spec.source;
  switch (s.kind) {
    case 'continue': return t('row.continue');
    case 'nextUp': return t('row.nextUp');
    case 'watchlist': return t('row.watchlist');
    case 'queue': return t('row.queue');
    case 'recent': return t('row.recent', { library: s.library.name });
    case 'custom': return s.title;
    case 'seasonal': return t(`row.seasonal.${s.pick}` as 'row.seasonal.horror');
    case 'collection': case 'playlist': return s.title;
  }
}

/** Turns an item into a card, choosing artwork as the web's PosterCard and EpisodeCard do. */
export function cardFor(item: Item, key = item.id): Card {
  const img = item.images ?? {};
  const ep = item.kind === 'episode';
  const d = durationMs(item);
  const r = resumeMs(item);
  return {
    key,
    item,
    poster: ep ? img.series_primary ?? img.primary : img.primary,
    seasonPoster: ep ? img.season_primary : undefined,
    thumb: ep ? img.primary ?? img.series_backdrop ?? img.backdrop : img.backdrop ?? img.primary,
    backdrop: ep ? img.series_backdrop ?? img.primary : img.backdrop ?? img.primary,
    logo: ep ? img.series_logo : img.logo,
    progress: r > 0 && d > 0 ? Math.min(1, Math.max(0.02, r / d)) : undefined,
  };
}

/** A TV library's Recently Added card: a new show, new episodes of a season, or one episode. */
function recentCard(c: RecentCard): Card {
  const base = cardFor(c.item, `${c.type}:${c.item.id}:${c.season_number ?? ''}`);
  return c.type === 'season' ? { ...base, seasonNumber: c.season_number, newEpisodes: c.episodes, seasonPoster: c.season_poster ?? base.poster } : base;
}

const libraryKind = (lib: Library) => (lib.kind === 'shows' ? 'series' : 'movie');

/** /items query for a custom row's filter (web/src/lib/home.ts rowQuery). */
function customQuery(filter: Record<string, unknown>, lib: Library): Record<string, string> {
  const keys = ['library_id', 'genre', 'language', 'label', 'decade', 'resolution', 'unwatched', 'added_within', 'min_runtime', 'max_runtime', 'min_rating', 'sort'];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = filter[k];
    if (v === undefined || v === null || v === '' || v === 0 || v === '0' || v === false) continue;
    out[k] = v === true ? '1' : String(v);
  }
  out.kind = libraryKind(lib);
  out.limit = '24';
  return out;
}

export async function loadRow(spec: RowSpec): Promise<Card[]> {
  const s = spec.source;
  const items = (list: Item[]) => list.map((it) => cardFor(it));
  switch (s.kind) {
    case 'continue': return items(await api<Item[]>(`/home/continue${s.withUpNext ? '?with_up_next=1' : ''}`));
    case 'nextUp': return items(await api<Item[]>('/home/next-up'));
    case 'watchlist': return items(await api<Item[]>('/watchlist'));
    case 'recent':
      if (s.library.kind === 'shows' && !s.showsOnly) return (await api<RecentCard[]>(`/libraries/${s.library.id}/recent-shows`)).map(recentCard);
      return items((await api<{ items: Item[] }>(`/items${query({ library_id: s.library.id, kind: libraryKind(s.library), sort: 'added', limit: 24 })}`)).items);
    case 'custom': return items((await api<{ items: Item[] }>(`/items${query(customQuery(s.filter, s.library))}`)).items);
    case 'seasonal': return items((await api<{ items: Item[] }>(`/items${query({ ...seasons.find((x) => x.pick === s.pick)!.query, limit: 24 })}`)).items);
    case 'collection': return items((await api<CollectionPage>(`/collections/${encodeURIComponent(s.id)}`)).items);
    case 'playlist': return (await api<PlaylistPage>(`/playlists/${encodeURIComponent(s.id)}`)).entries.map((e) => cardFor(e.item, `entry:${e.entry_id}`));
    case 'queue': return [];
  }
}
