import { Spotlight } from '@enact/spotlight';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, query, type CollectionRef, type Facets, type Item, type ItemPage, type Library, type RecommendedRow } from '../api';
import { cardFor, MediaCard, Shelf } from '../components/Cards';
import { TitleGrid } from '../components/Grid';
import { Popover, PopoverItem } from '../components/Menu';
import { Scroller } from '../components/Scroller';
import { Button, Container, Focusable, focusElement } from '../components/spot';
import { t, tMaybe } from '../i18n';
import type { Card } from '../lib/home';
import { useNav } from '../lib/nav';
import { START } from './Home';

// A library, as the Android app's LibraryContent and Plex's TV app: its name and tabs
// (Recommended, its titles, Collections), then the chosen tab. The titles have the web's sort and
// filters, and an A–Z bar down the right while they're sorted by title.

type Tab = 'recommended' | 'titles' | 'collections';

export interface LibraryQuery { sort: string; reverse: boolean; unwatched: boolean; genre?: string; decade?: number; resolution?: string }

const defaultQuery: LibraryQuery = { sort: 'title', reverse: false, unwatched: false };
// Each library's sort and filters, kept while the app runs, as the web keeps them per library.
const queries = new Map<number, LibraryQuery>();

const filterCount = (q: LibraryQuery) => [q.unwatched, !!q.genre, !!q.decade, !!q.resolution].filter(Boolean).length;

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

type FilterPage = 'main' | 'genre' | 'decade' | 'quality';

function FilterPanel({ q, facets, from, onChoose, onClose }: { q: LibraryQuery; facets: Facets; from?: ClientRect; onChoose: (q: LibraryQuery) => void; onClose: () => void }) {
  const [page, setPage] = useState<FilterPage>('main');
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
  return (
    <Popover from={from} title={page === 'main' ? t('library.filters') : t(page === 'genre' ? 'filter.genre' : page === 'decade' ? 'filter.decade' : 'filter.quality')} place="below" onClose={close}>
      <Scroller className="popover-list" pad={24}>
        {page === 'main' && (
          <>
            <PopoverItem first label={t('filter.unwatched')} icon={q.unwatched ? 'check' : ''} onClick={() => onChoose({ ...q, unwatched: !q.unwatched })} />
            {!!facets.genres?.length && <PopoverItem icon="" label={`${t('filter.genre')}: ${q.genre ?? any}`} onClick={() => setPage('genre')} />}
            {!!facets.decades?.length && <PopoverItem icon="" label={`${t('filter.decade')}: ${q.decade ? t('filter.decadeValue', { n: q.decade }) : any}`} onClick={() => setPage('decade')} />}
            {!!facets.resolutions?.length && <PopoverItem icon="" label={`${t('filter.quality')}: ${q.resolution ? qualityName(q.resolution) : any}`} onClick={() => setPage('quality')} />}
            {filterCount(q) > 0 && <PopoverItem icon="close" label={t('filter.clear')} onClick={() => onChoose({ ...q, unwatched: false, genre: undefined, decade: undefined, resolution: undefined })} />}
          </>
        )}
        {page === 'genre' && (
          <>
            <PopoverItem first label={any} icon={!q.genre ? 'check' : ''} onClick={() => pick({ ...q, genre: undefined })} />
            {facets.genres!.map((g) => <PopoverItem key={g.value} label={g.value} icon={q.genre === g.value ? 'check' : ''} onClick={() => pick({ ...q, genre: g.value })} />)}
          </>
        )}
        {page === 'decade' && (
          <>
            <PopoverItem first label={any} icon={!q.decade ? 'check' : ''} onClick={() => pick({ ...q, decade: undefined })} />
            {facets.decades!.map((d) => parseInt(d.value, 10)).filter((d) => d > 0).sort((a, b) => b - a).map((d) => (
              <PopoverItem key={d} label={t('filter.decadeValue', { n: d })} icon={q.decade === d ? 'check' : ''} onClick={() => pick({ ...q, decade: d })} />
            ))}
          </>
        )}
        {page === 'quality' && (
          <>
            <PopoverItem first label={any} icon={!q.resolution ? 'check' : ''} onClick={() => pick({ ...q, resolution: undefined })} />
            {facets.resolutions!.map((r) => <PopoverItem key={r.value} label={qualityName(r.value)} icon={q.resolution === r.value ? 'check' : ''} onClick={() => pick({ ...q, resolution: r.value })} />)}
          </>
        )}
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

const collectionCard = (c: CollectionRef): Card => ({
  key: c.id, item: { id: c.id, kind: 'collection', title: c.title, images: c.images }, poster: c.images?.primary, thumb: c.images?.backdrop ?? c.images?.primary,
});

function Tabs({ tabs, current, onSelect }: { tabs: { id: Tab; label: string }[]; current: Tab; onSelect: (t: Tab) => void }) {
  return (
    <Container className="tabs">
      {tabs.map((tab) => (
        <Focusable key={tab.id} className={`tab${tab.id === current ? ' selected' : ''}`} onFocus={() => onSelect(tab.id)} onClick={() => onSelect(tab.id)}>
          {tab.label}
        </Focusable>
      ))}
    </Container>
  );
}

type Load<T> = { value?: T; error?: string };

export function LibraryContent({ library, visits, onReady }: { library: Library; visits: number; onReady: () => void }) {
  const nav = useNav();
  const [tab, setTab] = useState<Tab>(library.kind === 'videos' ? 'titles' : 'recommended');
  const [q, setQ] = useState<LibraryQuery>(queries.get(library.id) ?? defaultQuery);
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
  tabs.push({ id: 'titles', label: t(library.kind === 'shows' ? 'library.shows' : library.kind === 'videos' ? 'library.videos' : 'library.movies') });
  if (collections.value?.length) tabs.push({ id: 'collections', label: t('library.collections') });
  const shown = tabs.some((x) => x.id === tab) ? tab : 'titles';

  const readyNow = shown === 'titles' ? total !== null : shown === 'recommended' ? !!recommended.value || !!recommended.error : !!collections.value;
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
            {total !== null && <span className="muted head-count">{t('library.count', { n: total })}</span>}
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

/** The Watchlist from the sidebar: its name and count, then the titles in the library's grid. */
export function WatchlistContent({ visits, onReady }: { visits: number; onReady: () => void }) {
  const nav = useNav();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
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
        {items && <span className="muted head-count">{t('library.count', { n: items.length })}</span>}
      </div>
      {error && <div className="page-note"><p className="error">{error}</p><Button onClick={load}>{t('common.retry')}</Button></div>}
      {items && !items.length && <p className="muted page-note">{t('watchlist.empty')}</p>}
      {items && items.length > 0 && (
        <div className="library-titles">
          <TitleGrid count={items.length} itemAt={(i) => items[i]} landscape={false} onOpen={(it) => nav.open(it)} />
        </div>
      )}
    </div>
  );
}

