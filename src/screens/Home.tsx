import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item, Library, Prefs } from '../api';
import { ImmersiveBackdrop, TitleSummary } from '../components/Backdrop';
import { MediaCard, Strip } from '../components/Cards';
import { Scroller } from '../components/Scroller';
import { Button, Container } from '../components/spot';
import { formatRuntime, t } from '../i18n';
import { episodeCode } from '../lib/format';
import { cardFor, loadRow, resolveHomeRows, rowTitle, type Card, type RowSpec } from '../lib/home';
import { useNav } from '../lib/nav';
import { queue, queues, upcoming } from '../lib/store';

// Home, as the Android app's: the focused title's backdrop fills the screen over its colours, its
// logo, details and summary sit top left, and the profile's rows run along the bottom one at a
// time (as Plex): Up and Down slide the next row into the band, back to the card last focused
// there. Rows with nothing in them are left out.

export const START = 192;
const WIDTH = { poster: 236, thumb: 472, backdrop: 400 };

type RowState = { cards: Card[] | null; error?: string };

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
  const [focused, setFocused] = useState<Card | null>(null);
  const q = queue.use();
  const told = useRef(false);

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
  const stateOf = (spec: RowSpec): RowState => (spec.id === 'queue' ? { cards: queueCards } : rows[spec.id] ?? { cards: null });
  const visible = all.filter((s) => { const c = stateOf(s).cards; return !c || c.length > 0; });
  const ready = visible.filter((s) => stateOf(s).cards);
  const firstCard = ready.length ? stateOf(ready[0]).cards![0] : null;
  const shown = focused ?? firstCard;

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

  return (
    <div className="home">
      <ImmersiveBackdrop item={shown?.item} />
      {shown && <div className="home-summary"><TitleSummary key={shown.key} item={shown.item} meta={summaryMeta(shown.item)} /></div>}
      <Scroller className="home-band" align="start" pad={0}>
        {visible.map((spec) => {
          const st = stateOf(spec);
          return (
            <section key={spec.id} className="home-row" data-section>
              <h2 className="row-title" style={{ paddingLeft: START }}>{rowTitle(spec)}</h2>
              {!st.cards && !st.error && <div className="row-loading" style={{ paddingLeft: START }}><div className="spinner" /></div>}
              {!st.cards && st.error && (
                <Container className="row-failed" style={{ paddingLeft: START }}>
                  <span className="muted">{t('row.failed')} {st.error}</span>
                  <Button onClick={() => loadOne(spec)}>{t('common.retry')}</Button>
                </Container>
              )}
              {st.cards && (
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
                        onFocus={() => setFocused(card)}
                        onClick={() => open(card)}
                      />
                    ))}
                  </Strip>
                </Container>
              )}
            </section>
          );
        })}
      </Scroller>
    </div>
  );
}
