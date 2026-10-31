import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, type CollectionPage, type Item, type Season, type SeasonsResponse } from '../api';
import { ImmersiveBackdrop, TitleSummary } from '../components/Backdrop';
import { cardFor, CardMenuContext, ExtraCard, MediaCard, PersonCard, Pressable, ProgressLine, Shelf, Strip, WatchBadge } from '../components/Cards';
import { Artwork } from '../components/Artwork';
import { Icon } from '../components/Icon';
import { Scroller } from '../components/Scroller';
import { Button, Container, Focusable, useInitialFocus } from '../components/spot';
import { MediaInfo, MoreMenu, toggleWatched, toggleWatchlist, useCanQueue } from '../components/TitleMenu';
import { formatRuntime, formatTime, t } from '../i18n';
import { episodeCode, formatLabels, resumeMs, watched } from '../lib/format';
import { useActive, useNav } from '../lib/nav';
import { queues, useChanges, withChanges } from '../lib/store';

// A title's page, as the Android app's DetailsScreen: the same summary as Home's over the title's
// backdrop, then Play (or Resume), Shuffle for a show, and Plex's round Watched, Watchlist and ⋯
// buttons; a show's seasons and episodes in its display order; then the cast, the collections it's
// in, More Like This and extras. Opened from an episode, it lands on that episode in its show.

const PAGE_START = 96;

interface Related { key: string; title?: string; items: Item[]; landscape: boolean }

/** The episode to carry on with: one part-way through, else the first not watched, specials last. */
function nextEpisode(seasons: Season[]): Item | undefined {
  const ordered = seasons.filter((s) => s.season_number > 0).concat(seasons.filter((s) => s.season_number <= 0));
  const eps = ordered.reduce<Item[]>((all, s) => all.concat(s.episodes), []).filter((e) => e.available !== false);
  return eps.find((e) => resumeMs(e) > 0) ?? eps.find((e) => !e.user_data?.played) ?? eps[0];
}

function seasonName(s: Season) {
  return s.name || (s.season_number === 0 ? t('details.specials') : t('details.season', { n: s.season_number }));
}

function shuffled<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** An episode: its picture with progress and a tick, its number and name, its length, and (focused) its description. */
function EpisodeCard({ ep, first, onPlay }: { ep: Item; first: boolean; onPlay: () => void }) {
  const [focused, setFocused] = useState(false);
  const menu = useContext(CardMenuContext);
  const card = cardFor(ep);
  const sub = [ep.runtime_min ? formatRuntime(ep.runtime_min) : '', ep.available === false ? t('details.missing') : ''].filter(Boolean).join(' · ');
  return (
    <div className="card card-thumb episode-card">
      <Pressable className="card-face" onClick={onPlay} onHold={menu ? (el) => menu(ep, el) : undefined} data-default={first || undefined}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        <Artwork path={card.thumb} label={ep.title} className="ratio-16x9" />
        <WatchBadge item={ep} />
        <ProgressLine progress={card.progress} />
      </Pressable>
      <div className="card-caption">
        <div className="card-title">{[ep.episode_number !== undefined ? `${ep.episode_number}.` : '', ep.title].filter(Boolean).join(' ')}</div>
        {sub && <div className="card-sub">{sub}</div>}
        <div className="episode-overview">{focused && ep.overview}</div>
      </div>
    </div>
  );
}

function Seasons({ seasons, initial, focusId, onPlay }: { seasons: Season[]; initial: number; focusId?: string; onPlay: (ep: Item) => void }) {
  const [selected, setSelected] = useState(initial);
  const changes = useChanges();
  if (!seasons.length) return <p className="muted" style={{ paddingLeft: PAGE_START }}>{t('details.noEpisodes')}</p>;
  const season = seasons[Math.min(selected, seasons.length - 1)];
  return (
    <section className="seasons" data-section>
      <Container className="tabs" style={{ marginLeft: PAGE_START - 16 }}>
        {seasons.map((s, i) => (
          <Focusable key={s.season_number} className={`tab${i === selected ? ' selected' : ''}`} onFocus={() => setSelected(i)} onClick={() => setSelected(i)}>
            {seasonName(s)}
          </Focusable>
        ))}
      </Container>
      <Container className="episodes">
        <EpisodeStrip key={season.season_number} episodes={season.episodes.map((e) => withChanges(e, changes))} focusId={focusId} onPlay={onPlay} />
      </Container>
    </section>
  );
}

function EpisodeStrip({ episodes, focusId, onPlay }: { episodes: Item[]; focusId?: string; onPlay: (ep: Item) => void }) {
  return (
    <Strip start={PAGE_START}>
      {episodes.map((ep) => <EpisodeCard key={ep.id} ep={ep} first={ep.id === focusId} onPlay={() => onPlay(ep)} />)}
    </Strip>
  );
}

function RoundButton({ icon, label, on, onClick, onLabel }: { icon: string; label: string; on?: boolean; onClick: () => void; onLabel: (l: string | null) => void }) {
  return (
    <Focusable className={`round-btn${on ? ' on' : ''}`} onClick={onClick} onFocus={() => onLabel(label)} onBlur={() => onLabel(null)}>
      <Icon name={icon} size={40} />
    </Focusable>
  );
}

export function Details({ id, episodeId }: { id: string; episodeId?: string }) {
  const nav = useNav();
  const active = useActive();
  const root = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState<Item | null>(null);
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [related, setRelated] = useState<Related[]>([]);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<'more' | 'info' | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const changes = useChanges();
  const canQueue = useCanQueue();

  const load = useCallback((quiet: boolean) => {
    if (!quiet) setError('');
    api<Item>(`/items/${encodeURIComponent(id)}`).then(async (it) => {
      if (it.kind === 'series') {
        const s = await api<SeasonsResponse>(`/series/${encodeURIComponent(id)}/seasons`);
        setSeasons((s.seasons ?? []).filter((x) => x.episodes && x.episodes.length));
      }
      setBase(it);
      if (it.kind === 'episode') return;
      // The rows under the title: each collection it's in (without it), then More Like This.
      const rows = await Promise.all([
        ...(it.collections ?? []).map((c) => api<CollectionPage>(`/collections/${encodeURIComponent(c.id)}`).then(
          (p) => ({ key: `collection:${c.id}`, title: c.title, items: p.items.filter((x) => x.id !== it.id), landscape: p.collection.kind === 'folder' }),
          () => null,
        )),
        api<Item[]>(`/items/${encodeURIComponent(it.id)}/similar`).then((items) => ({ key: 'similar', items: items ?? [], landscape: false }), () => null),
      ]);
      setRelated(rows.filter((r): r is Related => !!r && r.items.length > 0));
    }).catch((e) => { if (!quiet) setError((e as Error).message); });
  }, [id]);

  useEffect(() => { load(false); }, [load]);

  // Coming back from the player: the new resume point and watched state.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) load(true);
    wasActive.current = active;
  }, [active, load]);

  const item = base ? withChanges(base, changes) : null;
  const next = seasons ? nextEpisode(seasons) : undefined;
  const focusEp = episodeId && seasons ? seasons.reduce<Item | undefined>((f, s) => f ?? s.episodes.find((e) => e.id === episodeId), undefined) : undefined;
  const land = focusEp ?? next;
  const initialSeason = seasons && land ? Math.max(0, seasons.findIndex((s) => s.episodes.some((e) => e.id === land.id))) : 0;
  useInitialFocus(root, !!item && (item.kind !== 'series' || !!seasons));

  if (error) {
    return (
      <div className="screen centered">
        <p className="error">{error}</p>
        <Button data-default onClick={() => load(false)}>{t('common.retry')}</Button>
      </div>
    );
  }
  if (!item) return <div className="screen centered"><div className="spinner" /></div>;

  const series = item.kind === 'series';
  const target = series ? next : item;
  const resume = target ? resumeMs(target) : 0;
  const code = series && target ? episodeCode(target) : '';
  const playLabel = resume > 0 && code ? t('details.resumeEpisode', { code })
    : resume > 0 ? t('details.resume', { time: formatTime(resume) })
      : code ? t('details.playEpisode', { code }) : t('details.play');
  const left = item.unwatched_count ?? 0;
  const meta = [
    item.kind === 'episode' ? [episodeCode(item), item.title].filter(Boolean).join(' · ') : '',
    item.year ? String(item.year) : '',
    !series && item.runtime_min ? formatRuntime(item.runtime_min) : '',
    series && left > 0 ? (left === 1 ? t('details.oneEpisodeLeft') : t('details.episodesLeft', { n: left })) : '',
    item.rating ? `★ ${item.rating.toFixed(1)}` : '',
    (item.genres ?? []).slice(0, 2).join(', '),
  ];
  const canWatchlist = item.kind === 'movie' || series;
  const available = (seasons ?? []).reduce<Item[]>((all, s) => all.concat(s.episodes), []).filter((e) => e.available !== false);
  const cast = (item.credits ?? []).filter((c) => c.role === 'actor');

  const shuffle = async () => {
    const q = await queues.start(shuffled(available).map((e) => e.id));
    const first = q?.entries.find((e) => e.id === q.current_entry_id && e.available && e.item);
    if (first?.item) nav.play(first.item, 0, { entryId: first.id });
  };
  const onWatched = () => {
    void toggleWatched(item).then(() => { if (series) load(true); });
  };

  return (
    <div className="screen details" ref={root}>
      <ImmersiveBackdrop item={item} delay={0} />
      <Scroller className="details-page" pad={72}>
        <section className="details-head" data-section>
          <TitleSummary item={item} meta={meta} labels={formatLabels(item.files)} />
          <Container className="actions">
            {target && (
              <Button className="primary" data-default={!focusEp || undefined} onClick={() => nav.play(target, resume)}>
                <Icon name="play" size={32} /> {playLabel}
              </Button>
            )}
            {target && resume > 0 && (
              <Button onClick={() => nav.play(target, 0)}><Icon name="restart" size={32} /> {t('details.fromStart')}</Button>
            )}
            {series && canQueue && available.length > 0 && (
              <Button onClick={() => void shuffle()}><Icon name="shuffle" size={32} /> {t('action.shuffle')}</Button>
            )}
            {item.kind === 'episode' && item.parent_id && (
              <Button onClick={() => nav.open({ id: item.parent_id!, kind: 'series', title: item.series_title ?? '' })}><Icon name="tv" size={32} /> {t('details.goToShow')}</Button>
            )}
            <RoundButton icon="circleCheck" on={watched(item)} label={t(watched(item) ? 'action.markUnwatched' : 'action.markWatched')} onClick={onWatched} onLabel={setLabel} />
            {canWatchlist && (
              <RoundButton
                icon={item.user_data?.watchlisted ? 'bookmarkOn' : 'bookmark'}
                on={!!item.user_data?.watchlisted}
                label={t(item.user_data?.watchlisted ? 'action.removeWatchlist' : 'action.addWatchlist')}
                onClick={() => void toggleWatchlist(item)}
                onLabel={setLabel}
              />
            )}
            <RoundButton icon="more" label={t('action.more')} onClick={() => setPanel('more')} onLabel={setLabel} />
          </Container>
          <div className="action-label">{label}</div>
        </section>
        {series && seasons && <Seasons key={initialSeason} seasons={seasons} initial={initialSeason} focusId={focusEp?.id} onPlay={(ep) => nav.play(ep, resumeMs(ep))} />}
        {cast.length > 0 && (
          <Shelf title={t('details.cast')} start={PAGE_START}>
            {cast.map((c) => <PersonCard key={c.person_id} name={c.name} image={c.image} sub={c.character} onClick={() => nav.person(c.person_id)} />)}
          </Shelf>
        )}
        {related.map((row) => (
          <Shelf key={row.key} title={row.title ?? t('details.moreLikeThis')} start={PAGE_START}>
            {row.items.map((it) => <MediaCard key={it.id} card={cardFor(it)} look={row.landscape ? 'thumb' : 'poster'} onClick={() => nav.open(it)} />)}
          </Shelf>
        ))}
        {(item.extras ?? []).length > 0 && (
          <Shelf title={t('details.extras')} start={PAGE_START}>
            {item.extras!.map((e) => <ExtraCard key={e.id} extra={e} onClick={() => nav.playExtra(e)} />)}
          </Shelf>
        )}
      </Scroller>
      {panel === 'more' && <MoreMenu item={item} onMediaInfo={item.files?.length ? () => setPanel('info') : undefined} onClose={() => setPanel(null)} />}
      {panel === 'info' && <MediaInfo item={item} onClose={() => setPanel(null)} />}
    </div>
  );
}
