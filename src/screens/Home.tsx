import { useHideSpoilers } from '../lib/useSpoilers';
import { spoilerSafeItem } from '../lib/spoilers';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item, Library, Prefs } from '../api';
import { HeroBackdrop, TitleLogo } from '../components/Backdrop';
import { ContinueRowContext, MediaCard, Strip } from '../components/Cards';
import { Scroller } from '../components/Scroller';
import { Button, Container } from '../components/spot';
import { formatRuntime, t } from '../i18n';
import { episodeHeading, formatLabels } from '../lib/format';
import { cardFor, loadRow, resolveHomeRows, rowTitle, type Card, type RowSpec } from '../lib/home';
import { useNav } from '../lib/nav';
import { RoomCards, useRooms } from '../components/RoomsRow';
import { queue, queues, upcoming, useOffContinue } from '../lib/store';

// Home, as Android's and the Apple TV app's: the hero describes the focused title (its logo or
// name, details and description over its artwork) with the profile's rows just under it,
// Continue Watching first. Focus starts on the first card and moving along a row changes the
// hero; it has no buttons of its own (OK on a card opens it, holding OK gives its actions).
// Further down, the rows scroll up over a dimmed copy of the artwork. Empty rows are left out.

export const START = 192;
const WIDTH = { poster: 236, thumb: 472, backdrop: 400 };

type RowState = { cards: Card[] | null; error?: string };

/** How long the focus rests on a card before the hero follows it (moving along a row is quick). */
const HERO_FOLLOW_MS = 200;

const queueRow: RowSpec = { id: 'queue', source: { kind: 'queue' }, style: 'thumb' };

/** The line under the title in the summary: an episode's number and name, the year, rating, length, genres. */
export function summaryMeta(it: Item): string[] {
  return [
    it.kind === 'episode' ? episodeHeading(it) : '',
    it.kind !== 'episode' && it.year ? String(it.year) : '',
    it.content_rating ?? '',
    it.runtime_min ? formatRuntime(it.runtime_min) : '',
    (it.genres ?? []).slice(0, 2).join(', '),
  ];
}

export function HomeContent({ prefs, libraries, visits, onReady }: { prefs: Prefs; libraries: Library[]; visits: number; onReady: () => void }) {
  const nav = useNav();
  const specs = useMemo(() => resolveHomeRows(prefs, libraries), [prefs, libraries]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  // The hero's title: the card last focused (rooms aside); before any, the first row's first.
  const [focused, setFocused] = useState<Card | null>(null);
  const follow = useRef<number | undefined>(undefined);
  const off = useOffContinue();
  const [scrolled, setScrolled] = useState(false);
  const q = queue.use();
  const told = useRef(false);
  // Watch Together rooms waiting for this profile: their own row while there are any, under
  // Continue Watching (or the first row without it) in every Arc app; not part of the hero.
  const rooms = useRooms(visits);

  const loadOne = useCallback((spec: RowSpec) => {
    loadRow(spec).then(
      (cards) => setRows((r) => ({ ...r, [spec.id]: { cards } })),
      (e) => setRows((r) => (r[spec.id]?.cards?.length ? r : { ...r, [spec.id]: { cards: null, error: (e as Error).message } })),
    );
  }, []);

  // Everything again on each visit (coming back from playing changes Continue Watching), keeping
  // what's shown until the new rows arrive.
  useEffect(() => {
    specs.forEach(loadOne);
    void queues.refresh();
  }, [specs, visits, loadOne]);

  const queueCards: Card[] = upcoming(q).map((e) => ({ ...cardFor(e.item!, `queue:${e.id}`), queueEntry: e.id }));
  const all = specs.concat(queueCards.length ? [queueRow] : []);
  const stateOf = (spec: RowSpec): RowState => {
    if (spec.id === 'queue') return { cards: queueCards };
    const st = rows[spec.id] ?? { cards: null };
    // Titles taken out of Continue Watching leave at once, without reloading the row.
    return spec.source.kind === 'continue' && st.cards ? { ...st, cards: st.cards.filter((c) => !off[c.item.id]) } : st;
  };
  const visible = all.filter((s) => { const c = stateOf(s).cards; return !c || c.length > 0; });
  const ready = visible.filter((s) => stateOf(s).cards);
  const firstCard = ready.length ? stateOf(ready[0]).cards![0] : null;
  const hero = focused ?? firstCard;
  const onCardFocus = (card: Card) => {
    window.clearTimeout(follow.current);
    follow.current = window.setTimeout(() => setFocused(card), HERO_FOLLOW_MS);
  };
  useEffect(() => () => window.clearTimeout(follow.current), []);

  useEffect(() => {
    if (firstCard && !told.current) {
      told.current = true;
      onReady();
    }
  }, [firstCard, onReady]);

  const allEmpty = specs.length > 0 && specs.every((s) => rows[s.id]?.cards?.length === 0) && !queueCards.length;
  if (!specs.length || allEmpty) {
    return (
      <div className="home-empty">
        <h2>{t('home.emptyTitle')}</h2>
        <p className="muted">{t('home.emptyBody')}</p>
      </div>
    );
  }

  const open = (card: Card) => {
    if (card.queueEntry) nav.play(card.item, card.item.user_data?.position_ms ?? 0, { entryId: card.queueEntry });
    else nav.open(card.item);
  };

  const hideSpoilers = useHideSpoilers();
  const heroItem = hero?.item ? spoilerSafeItem(hero.item, hideSpoilers) : undefined;
  // The hero shares a block with the first row, so that row's focus keeps the hero in view.
  const heroBlock = heroItem && (
    <div className="home-hero">
      <div key={hero!.key} className="home-hero-text fade-in">
        <TitleLogo item={heroItem} />
        <div className="hero-meta home-hero-meta">
          <span>{summaryMeta(heroItem).filter(Boolean).join(' · ')}</span>
          {formatLabels(heroItem.files).map((l) => <span key={l} className="label">{l}</span>)}
        </div>
        {heroItem.overview && <p className="hero-overview home-hero-overview">{heroItem.overview}</p>}
      </div>
    </div>
  );

  // The rooms' row: under Continue Watching, or under the first row without it (owner, 27 November).
  const roomsAfter = Math.max(0, visible.findIndex((s) => s.source.kind === 'continue'));
  const roomsRow = (first: boolean) => rooms.length > 0 && (
    <section className="home-row" data-section data-row="watch-together">
      <h2 className="row-title" style={{ paddingLeft: START }}>{t('together.rowTitle')}</h2>
      <RoomCards rooms={rooms} start={START} width={WIDTH.thumb} first={first} />
    </section>
  );

  return (
    <div className="home">
      {heroItem && <HeroBackdrop item={heroItem} dim={scrolled} />}
      <Scroller className="home-page" pad={72} onMove={(o) => setScrolled(o > 40)}>
        {!visible.length && roomsRow(true)}
        {visible.map((spec, i) => {
          const st = stateOf(spec);
          return (
            <Fragment key={spec.id}>
            <section className={`home-row${i === 0 && heroBlock ? ' home-first' : ''}`} data-section data-row={spec.id}>
              {i === 0 && heroBlock}
              <h2 className="row-title" style={{ paddingLeft: START }}>{rowTitle(spec)}</h2>
              {!st.cards && !st.error && <div className="row-loading" style={{ paddingLeft: START }}><div className="spinner" /></div>}
              {!st.cards && st.error && (
                <Container className="row-failed" style={{ paddingLeft: START }}>
                  <span className="muted">{t('row.failed')} {st.error}</span>
                  <Button onClick={() => loadOne(spec)}>{t('common.retry')}</Button>
                </Container>
              )}
              {st.cards && (
                <ContinueRowContext.Provider value={spec.source.kind === 'continue'}>
                <Container className="row-cards">
                  <Strip start={START}>
                    {st.cards.map((card) => (
                      <MediaCard
                        key={card.key}
                        card={card}
                        look={spec.style}
                        seasonPoster={spec.seasonPosters}
                        width={WIDTH[spec.style]}
                        first={card === firstCard}
                        onClick={() => open(card)}
                        onFocus={() => onCardFocus(card)}
                      />
                    ))}
                  </Strip>
                </Container>
                </ContinueRowContext.Provider>
              )}
            </section>
            {i === roomsAfter && roomsRow(false)}
            </Fragment>
          );
        })}
      </Scroller>
    </div>
  );
}
