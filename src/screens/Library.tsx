import { Spotlight } from '@enact/spotlight';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, query, type CollectionRef, type Facets, type Item, type ItemPage, type Library, type RecommendedRow } from '../api';
import { cardFor, MediaCard, Shelf } from '../components/Cards';
import { TitleGrid } from '../components/Grid';
import { Popover, PopoverItem } from '../components/Menu';
import { Scroller } from '../components/Scroller';
import { audioCodecName, channelsName, countLabel, videoCodecName } from '../lib/format';
import { Button, Container, Focusable, focusElement } from '../components/spot';
import { t, tMaybe } from '../i18n';
import type { Card } from '../lib/home';
import { useNav } from '../lib/nav';
import { VideoFolders } from './Folders';
import { START } from './Home';

// A library, as the Android app's LibraryContent and Plex's TV app: its name and tabs
// (Recommended, its titles, Folders for home videos, Collections), then the chosen tab. The titles have the web's sort and
// filters, and an A–Z bar down the right while they're sorted by title.

type Tab = 'recommended' | 'titles' | 'folders' | 'collections';

export interface LibraryQuery {
  sort: string; reverse: boolean; unwatched: boolean; genre?: string; decade?: number; resolution?: string;
  /** played or unstarted; it and Unwatched only exclude each other, as on the web. */
  watchState?: string;
  /** dolby_vision, hdr10_plus, hlg, hdr10, sdr or unknown. */
  dynamicRange?: string; videoCodec?: string; audioCodec?: string; audioChannels?: number;
}

const defaultQuery: LibraryQuery = { sort: 'title', reverse: false, unwatched: false };
// Each library's sort and filters, kept while the app runs, as the web keeps them per library.
const queries = new Map<number, LibraryQuery>();

const filterCount = (q: LibraryQuery) => [
  q.unwatched, !!q.genre, !!q.decade, !!q.resolution, !!q.watchState, !!q.dynamicRange, !!q.videoCodec, !!q.audioCodec, !!q.audioChannels,
].filter(Boolean).length;

/** No filters (the sort stays). */
const cleared = (q: LibraryQuery): LibraryQuery => ({ sort: q.sort, reverse: q.reverse, unwatched: false });

/** A media filter shows when the library has more than one value, or one is already chosen (the web's offered). */
const offered = (values: unknown[] | undefined, chosen: unknown) => (values?.length ?? 0) > 1 || chosen != null;

const PAGE = 60;

function params(lib: Library, q: LibraryQuery, offset: number) {
  return query({
    library_id: lib.id,
    kind: lib.kind === 'shows' ? 'series' : 'movie',
    sort: q.sort,
    limit: PAGE,
    offset: offset || undefined,
    reverse: q.reverse && q.sort !== 'shuffle' ? 1 : undefined,
    unwatched: q.unwatched ? 1 : undefined,
    genre: q.genre,
    decade: q.decade,
    resolution: q.resolution,
    watch_state: q.watchState,
    dynamic_range: q.dynamicRange,
    video_codec: q.videoCodec,
    audio_codec: q.audioCodec,
    audio_channels: q.audioChannels,
    letters: offset === 0 && q.sort === 'title' ? 1 : undefined,
  });
}

/** Where each letter's first title is in the list, in the list's order (web letterOffsets). */
function letterOffsets(letters: { letter: string; count: number }[], reverse: boolean): [string, number][] {
  const out: [string, number][] = [];
  let at = 0;
  for (const l of reverse ? letters.slice().reverse() : letters) {
    const up = l.letter.toUpperCase();
    const key = up.length === 1 && up >= 'A' && up <= 'Z' ? up : '#';
    if (!out.some(([k]) => k === key)) out.push([key, at]);
    at += l.count;
  }
  return out;
}

export const sorts = ['title', 'added', 'watched', 'release', 'year', 'rating', 'runtime', 'shuffle'];
export const sortLabel = (s: string) => tMaybe(`sort.${s}`) ?? t('sort.title');

function directions(sort: string): [string, string] {
  switch (sort) {
    case 'title': return [t('dir.aToZ'), t('dir.zToA')];
    case 'rating': return [t('dir.highest'), t('dir.lowest')];
    case 'runtime': return [t('dir.longest'), t('dir.shortest')];
    case 'watched': return [t('dir.mostRecent'), t('dir.leastRecent')];
    default: return [t('dir.newest'), t('dir.oldest')];
  }
}

function qualityName(v: string) {
  return ({ '4k': '4K', '1080': '1080p', '720': '720p', sd: 'SD' } as Record<string, string>)[v] ?? v;
}

function SortPanel({ q, from, onChoose, onClose }: { q: LibraryQuery; from?: ClientRect; onChoose: (q: LibraryQuery) => void; onClose: () => void }) {
  const [usual, other] = directions(q.sort);
  const tick = (on: boolean) => (on ? 'check' : '');
  // The Apple TV app's floating list, under the Sort button (owner, 1 November).
  return (
    <Popover title={t('library.sort')} place="below" from={from} onClose={onClose}>
      <Scroller className="popover-list" pad={24}>
        {sorts.map((s) => (
          <PopoverItem key={s} label={sortLabel(s)} icon={tick(q.sort === s)} first={q.sort === s} onClick={() => { if (s !== q.sort) onChoose({ ...q, sort: s, reverse: false }); }} />
        ))}
        {q.sort !== 'shuffle' && (
          <div data-section>
            <div className="popover-title popover-subtitle">{t('sort.order')}</div>
            <PopoverItem label={usual} icon={tick(!q.reverse)} onClick={() => { if (q.reverse) onChoose({ ...q, reverse: false }); }} />
            <PopoverItem label={other} icon={tick(q.reverse)} onClick={() => { if (!q.reverse) onChoose({ ...q, reverse: true }); }} />
          </div>
        )}
      </Scroller>
    </Popover>
  );
}

type FilterPage = 'main' | 'genre' | 'decade' | 'quality' | 'watchState' | 'hdr' | 'video' | 'audio' | 'channels';

const pageTitles: Record<Exclude<FilterPage, 'main'>, Parameters<typeof t>[0]> = {
  genre: 'filter.genre', decade: 'filter.decade', quality: 'filter.quality', watchState: 'filter.watchState',
  hdr: 'filter.hdr', video: 'filter.videoFormat', audio: 'filter.audioFormat', channels: 'filter.channels',
};

const watchStateName = (v: string) => t(v === 'played' ? 'filter.watched' : 'filter.notStarted');

/** Dolby Vision, HDR10+, HLG, HDR10, SDR, or "Not known yet" (the web's dynamicRangeLabel). */
function dynamicRangeName(v: string) {
  return ({ dolby_vision: 'Dolby Vision', hdr10_plus: 'HDR10+', hlg: 'HLG', hdr10: 'HDR10', sdr: 'SDR' } as Record<string, string>)[v]
    ?? (v === 'unknown' ? t('filter.hdrUnknown') : v);
}

/** The library's values for a filter, plus the chosen one if the library no longer has it, so it can be seen and changed. */
function withChosen<T>(values: T[], chosen: T | undefined): T[] {
  return chosen == null || values.includes(chosen) ? values : [...values, chosen];
}

function FilterPanel({ q, facets, from, onChoose, onClose }: { q: LibraryQuery; facets: Facets; from?: ClientRect; onChoose: (q: LibraryQuery) => void; onClose: () => void }) {
  const [page, setPageState] = useState<FilterPage>('main');
  // The row a list was opened from, so coming back to Filters lands on it again.
  const [cameFrom, setCameFrom] = useState<FilterPage | null>(null);
  const setPage = (next: FilterPage) => { if (next === 'main') setCameFrom(page === 'main' ? null : page); setPageState(next); };
  const pick = (next: LibraryQuery) => { onChoose(next); setPage('main'); };
  const any = t('filter.any');
  // Back from a list returns to the filters, then closes them.
  const close = () => (page === 'main' ? onClose() : setPage('main'));
  // One list whose page changes (not a new one each time, which lost where to go back to): the
  // focus moves to the new page's current choice.
  const shownPage = useRef(page);
  useEffect(() => {
    if (shownPage.current === page) return;
    shownPage.current = page;
    const timer = window.setTimeout(() => {
      const el = document.querySelector('.popover .popover-item[data-default]') ?? document.querySelector('.popover .popover-item');
      if (el) focusElement(el);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [page]);

  const values = (list?: { value: string }[]) => (list ?? []).map((f) => f.value);
  const channels = Array.from(new Set(values(facets.audio_channels).map((v) => parseInt(v, 10)).filter((n) => n > 0))).sort((a, b) => b - a);

  // A row on the main page: the filter's name and what it's set to, opening its own list.
  const row = (to: FilterPage, label: string, value: string | undefined) => (
    <PopoverItem icon="" first={cameFrom === to} label={`${label}: ${value ?? any}`} onClick={() => setPage(to)} />
  );
  // A filter's own list: Any, then its choices; choosing goes back to Filters.
  function choices<T extends string | number>(list: T[], chosen: T | undefined, name: (v: T) => string, set: (v: T | undefined) => LibraryQuery) {
    return (
      <>
        <PopoverItem first={chosen == null} label={any} icon={chosen == null ? 'check' : ''} onClick={() => pick(set(undefined))} />
        {withChosen(list, chosen).map((v) => <PopoverItem key={String(v)} first={chosen === v} label={name(v)} icon={chosen === v ? 'check' : ''} onClick={() => pick(set(v))} />)}
      </>
    );
  }

  const decades = values(facets.decades).map((d) => parseInt(d, 10)).filter((d) => d > 0).sort((a, b) => b - a);
  return (
    <Popover from={from} title={page === 'main' ? t('library.filters') : t(pageTitles[page])} place="below" onClose={close}>
      <Scroller className="popover-list" pad={24}>
        {page === 'main' && (
          <>
            <PopoverItem first={!cameFrom} label={t('filter.unwatched')} icon={q.unwatched ? 'check' : ''} onClick={() => onChoose({ ...q, unwatched: !q.unwatched, watchState: q.unwatched ? q.watchState : undefined })} />
            {row('watchState', t('filter.watchState'), q.watchState && watchStateName(q.watchState))}
            {!!facets.genres?.length && row('genre', t('filter.genre'), q.genre)}
            {!!facets.decades?.length && row('decade', t('filter.decade'), q.decade ? t('filter.decadeValue', { n: q.decade }) : undefined)}
            {!!facets.resolutions?.length && row('quality', t('filter.quality'), q.resolution && qualityName(q.resolution))}
            {offered(facets.dynamic_ranges, q.dynamicRange) && row('hdr', t('filter.hdr'), q.dynamicRange && dynamicRangeName(q.dynamicRange))}
            {offered(facets.video_codecs, q.videoCodec) && row('video', t('filter.videoFormat'), q.videoCodec && videoCodecName(q.videoCodec))}
            {offered(facets.audio_codecs, q.audioCodec) && row('audio', t('filter.audioFormat'), q.audioCodec && audioCodecName(q.audioCodec))}
            {offered(channels, q.audioChannels) && row('channels', t('filter.channels'), q.audioChannels ? channelsName(q.audioChannels) : undefined)}
            {filterCount(q) > 0 && <PopoverItem icon="close" label={t('filter.clear')} onClick={() => onChoose(cleared(q))} />}
          </>
        )}
        {page === 'watchState' && choices(['played', 'unstarted'], q.watchState, watchStateName, (v) => ({ ...q, watchState: v, unwatched: v ? false : q.unwatched }))}
        {page === 'genre' && choices(values(facets.genres), q.genre, (v) => v, (v) => ({ ...q, genre: v }))}
        {page === 'decade' && choices(decades, q.decade, (v) => t('filter.decadeValue', { n: v }), (v) => ({ ...q, decade: v }))}
        {page === 'quality' && choices(values(facets.resolutions), q.resolution, qualityName, (v) => ({ ...q, resolution: v }))}
        {page === 'hdr' && choices(values(facets.dynamic_ranges), q.dynamicRange, dynamicRangeName, (v) => ({ ...q, dynamicRange: v }))}
        {page === 'video' && choices(values(facets.video_codecs), q.videoCodec, videoCodecName, (v) => ({ ...q, videoCodec: v }))}
        {page === 'audio' && choices(values(facets.audio_codecs), q.audioCodec, (v) => audioCodecName(v), (v) => ({ ...q, audioCodec: v }))}
        {page === 'channels' && choices(channels, q.audioChannels, channelsName, (v) => ({ ...q, audioChannels: v }))}
      </Scroller>
    </Popover>
  );
}

/** A Recommended row's title in the app's language, from what the server says it is (web recommendedTitle). */
function recommendedTitle(row: RecommendedRow, lib: Library): string {
  const shows = lib.kind === 'shows';
  const name = row.name ?? '';
  switch (row.type) {
    case 'continue': return t('rec.continue');
    case 'recently_released': return t('rec.recently_released');
    case 'recently_added': return t('rec.recently_added', { name: row.name ?? lib.name });
    case 'start_watching': return t('rec.start_watching');
    case 'because_you_watched': return t('rec.because_you_watched', { name });
    case 'top_rated': return t(shows ? 'rec.top_rated_shows' : 'rec.top_rated_movies');
    case 'recently_watched': return t(shows ? 'rec.recently_watched_episodes' : 'rec.recently_watched');
    case 'rediscover': return t('rec.rediscover');
    case 'more_in_genre': return t('rec.more_in_genre', { name });
    case 'top_in_genre': return t(shows ? 'rec.top_shows_in_genre' : 'rec.top_movies_in_genre', { name });
    case 'top_by_person':
      if (row.role === 'director') return t(shows ? 'rec.top_shows_by' : 'rec.top_movies_by', { name });
      return t(shows ? 'rec.top_shows_with' : 'rec.top_movies_with', { name });
    case 'top_unwatched': return t('rec.top_unwatched');
    default: return row.title;
  }
}

function RecommendedView({ rows, lib, onOpen }: { rows: RecommendedRow[]; lib: Library; onOpen: (it: Item) => void }) {
  if (!rows.length) return <p className="muted page-note">{t('library.recommendedEmpty')}</p>;
  return (
    <Scroller className="library-body" pad={20}>
      {rows.map((row, ri) => {
        const style = row.style || (row.type === 'continue' || row.items.some((i) => i.kind === 'episode') ? 'thumb' : 'poster');
        const look = style === 'thumb' ? 'thumb' : style === 'arc' ? 'backdrop' : 'poster';
        return (
          <Shelf key={`${ri}:${row.type}:${row.name ?? ''}:${row.genre ?? ''}`} title={recommendedTitle(row, lib)} start={START}>
            {row.items.map((it, i) => (
              <MediaCard key={it.id} card={cardFor(it)} look={look} first={ri === 0 && i === 0} onClick={() => onOpen(it)} />
            ))}
          </Shelf>
        );
      })}
    </Scroller>
  );
}

export const collectionCard = (c: CollectionRef): Card => ({
  key: c.id, item: { id: c.id, kind: 'collection', title: c.title, images: c.images }, poster: c.images?.primary, thumb: c.images?.backdrop ?? c.images?.primary,
});

function Tabs({ tabs, current, onSelect }: { tabs: { id: Tab; label: string }[]; current: Tab; onSelect: (t: Tab) => void }) {
  return (
    <Container className="tabs">
      {tabs.map((tab) => (
        <Focusable key={tab.id} className={`tab${tab.id === current ? ' selected' : ''}`} data-default={tab.id === current || undefined} onFocus={() => onSelect(tab.id)} onClick={() => onSelect(tab.id)}>
          {tab.label}
        </Focusable>
      ))}
    </Container>
  );
}

type Load<T> = { value?: T; error?: string };

export function LibraryContent({ library, genre, visits, onReady }: { library: Library; genre?: string; visits: number; onReady: () => void }) {
  const nav = useNav();
  // Opened on a genre (from Search): its titles, filtered to that genre, as the web's genre links.
  const [tab, setTab] = useState<Tab>(library.kind === 'videos' || genre ? 'titles' : 'recommended');
  const [q, setQ] = useState<LibraryQuery>(() => (genre ? { ...defaultQuery, genre } : queries.get(library.id) ?? defaultQuery));
  const [total, setTotal] = useState<number | null>(null);
  const [items, setItems] = useState<Record<number, Item>>({});
  const [letters, setLetters] = useState<{ letter: string; count: number }[]>([]);
  const [error, setError] = useState('');
  const [recommended, setRecommended] = useState<Load<RecommendedRow[]>>({});
  const [collections, setCollections] = useState<Load<CollectionRef[]>>({});
  const [facets, setFacets] = useState<Facets>({});
  const [panel, setPanelState] = useState<'sort' | 'filters' | null>(null);
  // Where the button that opened the list is, so the list stays under it as choices change things.
  const [panelFrom, setPanelFrom] = useState<ClientRect | undefined>(undefined);
  const setPanel = (p: 'sort' | 'filters' | null) => {
    const el = p ? (Spotlight.getCurrent() as HTMLElement | null) : null;
    setPanelFrom(el ? el.getBoundingClientRect() : undefined);
    setPanelState(p);
  };
  const [jump, setJump] = useState<{ index: number; n: number } | undefined>();
  const pages = useRef(new Set<number>());
  const generation = useRef(0);
  const told = useRef(false);

  const loadTitles = useCallback((query: LibraryQuery) => {
    const gen = ++generation.current;
    pages.current = new Set([0]);
    setError('');
    api<ItemPage>(`/items${params(library, query, 0)}`).then((page) => {
      if (gen !== generation.current) return;
      const next: Record<number, Item> = {};
      page.items.forEach((it, i) => { next[i] = it; });
      setItems(next);
      setTotal(page.total);
      setLetters(page.letters ?? []);
    }, (e) => { if (gen === generation.current) setError((e as Error).message); });
  }, [library]);

  const loadExtras = useCallback(() => {
    if (library.kind !== 'videos') {
      api<{ rows: RecommendedRow[] }>(`/libraries/${library.id}/recommended`).then((r) => setRecommended({ value: r.rows ?? [] }), (e) => setRecommended({ error: (e as Error).message }));
    }
    api<CollectionRef[]>(`/libraries/${library.id}/collections`).then((c) => setCollections({ value: c ?? [] }), (e) => setCollections({ error: (e as Error).message }));
    api<Facets>(`/libraries/${library.id}/facets`).then(setFacets, () => {});
  }, [library]);

  useEffect(() => { loadTitles(q); }, [q, loadTitles, visits]);
  useEffect(loadExtras, [loadExtras, visits]);

  // Loads the page with position i (and the next) when the grid reaches it.
  const need = useCallback((i: number) => {
    if (total === null || i >= total) return;
    const page = Math.floor(i / PAGE);
    if (pages.current.has(page)) return;
    pages.current.add(page);
    const gen = generation.current;
    api<ItemPage>(`/items${params(library, q, page * PAGE)}`).then((p) => {
      if (gen !== generation.current) return;
      setItems((cur) => {
        const next = { ...cur };
        p.items.forEach((it, k) => { next[page * PAGE + k] = it; });
        return next;
      });
    }, () => pages.current.delete(page));
  }, [library, q, total]);

  const tabs: { id: Tab; label: string }[] = [];
  if (library.kind !== 'videos') tabs.push({ id: 'recommended', label: t('library.recommended') });
  // As Android's: the heading is the library's name, so the titles' tab is just Library.
  tabs.push({ id: 'titles', label: t('library.library') });
  // Home videos can be browsed folder by folder too, as on the web.
  if (library.kind === 'videos') tabs.push({ id: 'folders', label: t('library.folders') });
  if (collections.value?.length) tabs.push({ id: 'collections', label: t('library.collections') });
  const shown = tabs.some((x) => x.id === tab) ? tab : 'titles';

  const [foldersReady, setFoldersReady] = useState(false);
  const foldersLoaded = useCallback(() => setFoldersReady(true), []);
  const readyNow = shown === 'titles' ? total !== null : shown === 'folders' ? foldersReady : shown === 'recommended' ? !!recommended.value || !!recommended.error : !!collections.value;
  useEffect(() => {
    if (readyNow && !told.current) {
      told.current = true;
      onReady();
    }
  }, [readyNow, onReady]);

  const choose = (next: LibraryQuery) => {
    queries.set(library.id, next);
    setQ(next);
  };
  const offsets = q.sort === 'title' ? letterOffsets(letters, q.reverse) : [];
  const n = filterCount(q);
  const landscape = library.kind === 'videos';

  return (
    <div className="library">
      {/* Not a container: Up from the grid goes to whatever's above (the tabs, or Sort and Filters). */}
      <div className="page-head" style={{ paddingLeft: START }}>
        <h1 className="page-title">{library.name}</h1>
        {tabs.length > 1 && <Tabs tabs={tabs} current={shown} onSelect={setTab} />}
        {shown === 'titles' && (
          <>
            <div className="head-spacer" />
            {total !== null && <span className="muted head-count">{countLabel(total)}</span>}
            <Container className="head-buttons">
              <Button className="small" onClick={() => setPanel('sort')}>{sortLabel(q.sort)}</Button>
              <Button className="small" onClick={() => setPanel('filters')}>{n > 0 ? t('library.filtersOn', { n }) : t('library.filters')}</Button>
            </Container>
          </>
        )}
      </div>
      {shown === 'titles' && (error
        ? <div className="page-note"><p className="error">{error}</p><Button onClick={() => loadTitles(q)}>{t('common.retry')}</Button></div>
        : total === 0
          ? <p className="muted page-note">{t(n > 0 ? 'library.nothingMatches' : 'library.empty')}</p>
          : total !== null && (
            <div className="library-titles">
              <TitleGrid key={JSON.stringify(q)} count={total} itemAt={(i) => items[i]} landscape={landscape} onOpen={(it) => nav.open(it)} onNeed={need} jumpTo={jump} />
              {offsets.length > 1 && (
                <Container className="letter-bar">
                  {offsets.map(([letter, at]) => (
                    <Focusable key={letter} className="letter" onClick={() => { need(at); setJump({ index: at, n: Date.now() }); }}>{letter}</Focusable>
                  ))}
                </Container>
              )}
            </div>
          ))}
      {shown === 'recommended' && (recommended.error
        ? <div className="page-note"><p className="error">{recommended.error}</p><Button onClick={loadExtras}>{t('common.retry')}</Button></div>
        : recommended.value
          ? <RecommendedView rows={recommended.value} lib={library} onOpen={(it) => nav.open(it)} />
          : <div className="page-note"><div className="spinner" /></div>)}
      {shown === 'folders' && <VideoFolders library={library} onLoaded={foldersLoaded} />}
      {shown === 'collections' && collections.value && (
        <div className="library-titles">
          <TitleGrid
            count={collections.value.length}
            itemAt={(i) => collectionCard(collections.value![i]).item}
            cardOf={(it) => collectionCard(collections.value!.find((c) => c.id === it.id)!)}
            landscape={collections.value.every((c) => c.kind === 'folder')}
            onOpen={(it) => nav.collection(it.id)}
          />
        </div>
      )}
      {panel === 'sort' && <SortPanel q={q} from={panelFrom} onChoose={choose} onClose={() => setPanel(null)} />}
      {panel === 'filters' && <FilterPanel q={q} facets={facets} from={panelFrom} onChoose={choose} onClose={() => setPanel(null)} />}
    </div>
  );
}

type WatchShow = 'all' | 'movies' | 'shows';
type WatchSort = 'added' | 'title' | 'released';
const watchShows: WatchShow[] = ['all', 'movies', 'shows'];
const watchSorts: WatchSort[] = ['added', 'title', 'released'];
/** A title without a leading "The", "A" or "An", as libraries sort them. */
const sortTitle = (x: string) => x.toLowerCase().replace(/^(the|a|an) /, '');
/** The Watchlist's pills, as Android's (and the Apple TV app's): what's shown and in which order. Date Added is Arc's own order. */
function watchlistShown(items: Item[], show: WatchShow, sort: WatchSort): Item[] {
  const kept = items.filter((it) => show === 'all' || (show === 'movies' ? it.kind === 'movie' : it.kind === 'series'));
  if (sort === 'title') return kept.slice().sort((a, b) => (sortTitle(a.title) < sortTitle(b.title) ? -1 : sortTitle(a.title) > sortTitle(b.title) ? 1 : 0));
  if (sort === 'released') {
    const key = (it: Item) => it.release_date ?? (it.year ? String(it.year) : '');
    return kept.slice().sort((a, b) => (key(a) > key(b) ? -1 : key(a) < key(b) ? 1 : sortTitle(a.title) < sortTitle(b.title) ? -1 : 1));
  }
  return kept;
}

/** The Watchlist from the sidebar: its name with the All and Date Added pills at the right, then the titles in the library's grid. */
export function WatchlistContent({ visits, onReady }: { visits: number; onReady: () => void }) {
  const nav = useNav();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [show, setShow] = useState<WatchShow>('all');
  const [sort, setSort] = useState<WatchSort>('added');
  const [open, setOpen] = useState<'show' | 'sort' | null>(null);
  const shown = items ? watchlistShown(items, show, sort) : [];
  const load = useCallback(() => {
    setError('');
    api<Item[]>('/watchlist').then((list) => setItems(list ?? []), (e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load, visits]);
  const told = useRef(false);
  useEffect(() => {
    if (items && !told.current) { told.current = true; onReady(); }
  }, [items, onReady]);
  return (
    <div className="library">
      <div className="page-head" style={{ paddingLeft: START }}>
        <h1 className="page-title">{t('nav.watchlist')}</h1>
        {items && items.length > 0 && (
          <>
            <div className="head-spacer" />
            <Container className="head-buttons">
              <Button className="small" onClick={() => setOpen('show')}>{t(`watchlist.show.${show}`)}</Button>
              <Button className="small" onClick={() => setOpen('sort')}>{t(`watchlist.sort.${sort}`)}</Button>
            </Container>
          </>
        )}
      </div>
      {open && (
        <Popover place="below" onClose={() => setOpen(null)}>
          {(open === 'show' ? watchShows : watchSorts).map((v) => {
            const on = open === 'show' ? v === show : v === sort;
            return <PopoverItem key={v} first={on} icon={on ? 'check' : ''} label={open === 'show' ? t(`watchlist.show.${v as WatchShow}`) : t(`watchlist.sort.${v as WatchSort}`)} onClick={() => { if (open === 'show') setShow(v as WatchShow); else setSort(v as WatchSort); setOpen(null); }} />;
          })}
        </Popover>
      )}
      {error && <div className="page-note"><p className="error">{error}</p><Button onClick={load}>{t('common.retry')}</Button></div>}
      {items && !items.length && <p className="muted page-note">{t('watchlist.empty')}</p>}
      {items && items.length > 0 && (
        <div className="library-titles">
          <TitleGrid key={`${show}:${sort}`} count={shown.length} itemAt={(i) => shown[i]} landscape={false} onOpen={(it) => nav.open(it)} />
        </div>
      )}
    </div>
  );
}
