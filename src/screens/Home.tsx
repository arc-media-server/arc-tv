import { useHideSpoilers } from '../lib/useSpoilers';
import { spoilerSafeItem } from '../lib/spoilers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item, Library, Prefs } from '../api';
import { backdropOf, HeroBackdrop, RoundButton, TitleLogo } from '../components/Backdrop';
import { Icon } from '../components/Icon';
import { ContinueRowContext, MediaCard, Strip } from '../components/Cards';
import { Scroller } from '../components/Scroller';
import { Button, Container } from '../components/spot';
import { formatRuntime, formatTime, t } from '../i18n';
import { episodeCode, formatLabels, resumeMs } from '../lib/format';
import { cardFor, loadRow, resolveHomeRows, rowTitle, type Card, type RowSpec } from '../lib/home';
import { useNav } from '../lib/nav';
import { RoomCards, useRooms } from '../components/RoomsRow';
import { queue, queues, upcoming, useOffContinue } from '../lib/store';

// Home, as the Apple TV app's (owner, 31 October): a full-screen hero of featured titles (the
// first of each row) with Play and More Info, Left and Right moving between them and the next one
// coming by itself; the profile's rows peek in below and scroll up over a dimmed copy of the
// artwork. Rows with nothing in them are left out.

export const START = 192;
const WIDTH = { poster: 236, thumb: 472, backdrop: 400 };

type RowState = { cards: Card[] | null; error?: string };

const HERO_MAX = 6;
const HERO_SECONDS = 9;

/** The hero's titles: the first two of each row with artwork, one per title, at most six. */
function featured(cardsByRow: Card[][]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (let i = 0; i < 2; i++) {
    for (const cards of cardsByRow) {
      const c = cards[i];
      const key = c && (c.item.kind === 'episode' ? c.item.parent_id ?? c.item.id : c.item.id);
      if (!c || !key || seen.has(key) || !backdropOf(c.item)) continue;
      seen.add(key);
      out.push(c);
      if (out.length === HERO_MAX) return out;
    }
  }
  return out;
}

const queueRow: RowSpec = { id: 'queue', source: { kind: 'queue' }, style: 'thumb' };

/** The line under the title in the summary: an episode's number and name, the year, rating, length, genres. */
export function summaryMeta(it: Item): string[] {
  return [
    it.kind === 'episode' ? [episodeCode(it), it.title].filter(Boolean).join(' · ') : '',
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
  const [heroAt, setHeroAt] = useState(0);
  const off = useOffContinue();
  const [scrolled, setScrolled] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const q = queue.use();
  const told = useRef(false);
  // Watch Together rooms waiting for this profile: their own row, first while there are any
  // (Android and the Apple TV app); not part of the hero.
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
  const heroes = featured(ready.map((sp) => stateOf(sp).cards!));
  const hero = heroes.length ? heroes[heroAt % heroes.length] : null;
  const step = (by: number) => setHeroAt((i) => (i + by + heroes.length) % Math.max(heroes.length, 1));

  // The next title comes by itself while the hero is in view.
  useEffect(() => {
    if (scrolled || heroes.length < 2) return;
    const timer = window.setTimeout(() => step(1), HERO_SECONDS * 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroAt, scrolled, heroes.length]);

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
  const heroResume = heroItem ? resumeMs(heroItem) : 0;
  const heroPlayable = heroItem && (heroItem.kind === 'movie' || heroItem.kind === 'episode');
  const heroCode = heroItem?.kind === 'episode' ? episodeCode(heroItem) : '';
  const heroPlay = !heroItem ? '' : !heroPlayable ? t('home.hero.view')
    : heroResume > 0 && heroCode ? t('details.resumeEpisode', { code: heroCode })
    : heroResume > 0 ? t('details.resume', { time: formatTime(heroResume) })
    : heroCode ? t('details.playEpisode', { code: heroCode }) : t('details.play');
  // Left from the first button and Right from the last move to the previous and next title; Left
  // on the first title goes on to the sidebar, as the Apple TV app's.
  const onHeroKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (heroes.length < 2) return;
    const buttons = Array.from(e.currentTarget.querySelectorAll('.spottable'));
    const at = buttons.indexOf(document.activeElement as Element);
    if (e.keyCode === 37 && at === 0 && heroAt % heroes.length > 0) { step(-1); e.stopPropagation(); e.preventDefault(); }
    if (e.keyCode === 39 && at === buttons.length - 1) { step(1); e.stopPropagation(); e.preventDefault(); }
  };

  return (
    <div className="home">
      {heroItem && <HeroBackdrop item={heroItem} dim={scrolled} />}
      <Scroller className="home-page" pad={72} onMove={(o) => setScrolled(o > 40)}>
        {heroItem && (
          <section className="home-hero" data-section>
            <div key={hero!.key} className="home-hero-text fade-in">
              <TitleLogo item={heroItem} />
              <div className="hero-meta home-hero-meta">
                <span>{summaryMeta(heroItem).filter(Boolean).join(' · ')}</span>
                {formatLabels(heroItem.files).map((l) => <span key={l} className="label">{l}</span>)}
              </div>
              {heroItem.overview && <p className="hero-overview home-hero-overview">{heroItem.overview}</p>}
            </div>
            <div className="home-hero-actions" onKeyDownCapture={onHeroKey}>
              <Container className="actions">
                <Button className="primary" data-default onClick={() => (heroPlayable ? nav.play(heroItem, heroResume) : nav.open(heroItem))}>
                  <Icon name="play" size={32} /> {heroPlay}
                </Button>
                <RoundButton icon="info" label={t('home.hero.info')} onClick={() => nav.open(heroItem)} onLabel={setLabel} />
              </Container>
              <div className="action-label">{label}</div>
            </div>
            {heroes.length > 1 && (
              <div className="home-hero-dots">
                {heroes.map((h, i) => <span key={h.key} className={`hero-dot${i === heroAt % heroes.length ? ' on' : ''}`} />)}
              </div>
            )}
          </section>
        )}
        {rooms.length > 0 && (
          <section className="home-row" data-section data-row="watch-together">
            <h2 className="row-title" style={{ paddingLeft: START }}>{t('together.rowTitle')}</h2>
            <RoomCards rooms={rooms} start={START} width={WIDTH.thumb} />
          </section>
        )}
        {visible.map((spec) => {
          const st = stateOf(spec);
          return (
            <section key={spec.id} className="home-row" data-section data-row={spec.id}>
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
                        first={!heroItem && card === firstCard}
                        onClick={() => open(card)}
                      />
                    ))}
                  </Strip>
                </Container>
                </ContinueRowContext.Provider>
              )}
            </section>
          );
        })}
      </Scroller>
    </div>
  );
}
