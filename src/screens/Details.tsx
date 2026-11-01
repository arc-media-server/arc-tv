import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, type CollectionPage, type Item, type Season, type SeasonsResponse } from '../api';
import { HeroBackdrop, RoundButton, TitleLogo } from '../components/Backdrop';
import { cardFor, CardMenuContext, ExtraCard, MediaCard, PersonCard, Pressable, ProgressLine, Shelf, Strip, WatchBadge } from '../components/Cards';
import { Artwork } from '../components/Artwork';
import { Icon } from '../components/Icon';
import { Scroller } from '../components/Scroller';
import { Button, Container, Focusable, useInitialFocus } from '../components/spot';
import { Overlay, Popover, PopoverItem } from '../components/Menu';
import { MediaInfo, MoreMenu, toggleWatched, toggleWatchlist, useCanQueue } from '../components/TitleMenu';
import { formatRuntime, formatTime, t } from '../i18n';
import { episodeCode, formatLabels, languageName, resumeMs, versionLabel, versionsOf, watched } from '../lib/format';
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

/**
 * An episode as the Apple TV app shows one: its picture with progress and a tick, then its number,
 * its name, a few lines of its description, and its length (or what's left of it).
 */
function EpisodeCard({ ep, first, onPlay }: { ep: Item; first: boolean; onPlay: () => void }) {
  const menu = useContext(CardMenuContext);
  const card = cardFor(ep);
  const pos = resumeMs(ep);
  const length = ep.runtime_min
    ? pos > 0 ? t('details.timeLeft', { time: formatRuntime(Math.max(1, Math.round(ep.runtime_min - pos / 60000))) }) : formatRuntime(ep.runtime_min)
    : '';
  const sub = [length, ep.available === false ? t('details.missing') : ''].filter(Boolean).join(' · ');
  return (
    <div className="card card-thumb episode-card">
      <Pressable className="card-face" onClick={onPlay} onHold={menu ? (el) => menu(ep, el) : undefined} data-default={first || undefined}>
        <Artwork path={card.thumb} label={ep.title} className="ratio-16x9" />
        <WatchBadge item={ep} />
        <ProgressLine progress={card.progress} />
      </Pressable>
      <div className="card-caption">
        {ep.episode_number !== undefined && <div className="episode-kicker">{t('details.episodeN', { n: ep.episode_number })}</div>}
        <div className="card-title">{ep.title}</div>
        {ep.overview && <div className="episode-overview">{ep.overview}</div>}
        {sub && <div className="card-sub">{sub}</div>}
      </div>
    </div>
  );
}

/**
 * The description beside the buttons: three lines, and when that cuts it short, focusable with
 * MORE at its end to open the whole text, as the Apple TV app.
 */
function About({ item, meta }: { item: Item; meta: string }) {
  const text = useRef<HTMLParagraphElement>(null);
  const [cut, setCut] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = text.current;
    setCut(!!el && el.scrollHeight > el.clientHeight + 2);
  }, [item.overview]);
  const body = (
    <>
      {item.overview && <p ref={text} className="hero-overview">{item.overview}</p>}
      {cut && <span className="hero-more">{t('details.more')}</span>}
      <div className="hero-meta">
        <span>{meta}</span>
        {formatLabels(item.files).map((l) => <span key={l} className="label">{l}</span>)}
      </div>
    </>
  );
  return (
    <>
      {cut ? <Focusable className="hero-about can-open" onClick={() => setOpen(true)}>{body}</Focusable> : <div className="hero-about">{body}</div>}
      {open && (
        <Overlay width={1100} onClose={() => setOpen(false)}>
          <div className="overlay-title">{item.title}</div>
          <Focusable className="about-text" onClick={() => setOpen(false)}>{item.overview}</Focusable>
        </Overlay>
      )}
    </>
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

/** The Apple TV app's Information block at the foot of a title's page. */
function InfoSection({ item }: { item: Item }) {
  const names = (role: string, n = 4) => (item.credits ?? []).filter((c) => c.role === role).slice(0, n).map((c) => c.name).join(', ');
  const released = item.release_date ? new Date(item.release_date + 'T12:00:00').toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' }) : item.year ? String(item.year) : '';
  const rows: [string, string][] = [
    [t('details.info.genre'), (item.genres ?? []).join(', ')],
    [t('details.info.released'), released],
    [t('details.info.runtime'), item.kind !== 'series' && item.runtime_min ? formatRuntime(item.runtime_min) : ''],
    [t('details.info.rated'), item.content_rating ?? ''],
    [t('details.info.studio'), item.studio ?? ''],
    [t('details.info.language'), languageName(item.original_language)],
    [t('details.info.starring'), names('actor', 5)],
    [t('details.info.directors'), names('director')],
    [t('details.info.writers'), names('writer')],
  ];
  const shown = rows.filter((r) => r[1]);
  if (!shown.length) return null;
  return (
    <section className="info-section" data-section>
      <h2 className="shelf-title">{t('details.info')}</h2>
      {/* Focusable so the page can scroll down to it; there's nothing to press. */}
      <Focusable className="info-grid">
        {shown.map(([k, v]) => (
          <div key={k} className="info-cell">
            <div className="info-key">{k}</div>
            <div className="info-value">{v}</div>
          </div>
        ))}
      </Focusable>
    </section>
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
  const [scrolled, setScrolled] = useState(false);
  const [panel, setPanel] = useState<'more' | 'info' | 'version' | null>(null);
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
    (item.genres ?? []).slice(0, 2).join(', '),
    item.year ? String(item.year) : '',
    !series && item.runtime_min ? formatRuntime(item.runtime_min) : '',
    series && left > 0 ? (left === 1 ? t('details.oneEpisodeLeft') : t('details.episodesLeft', { n: left })) : '',
    item.content_rating ?? '',
    item.rating ? `★ ${item.rating.toFixed(1)}` : '',
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
      <HeroBackdrop item={item} dim={scrolled} />
      <Scroller className="details-page" pad={72} onMove={(o) => setScrolled(o > 40)}>
        {/* As the Apple TV app: the artwork fills the screen, the logo sits low on it, and the
            buttons and description share a line beneath; the rest scrolls up over a dimmed copy. */}
        <section className="details-hero" data-section>
          <TitleLogo item={item} />
          {item.kind === 'episode' && <div className="hero-episode">{[episodeCode(item), item.title].filter(Boolean).join(' · ')}</div>}
          <div className="hero-row">
            <div className="hero-actions">
              <Container className="actions">
                {target && (
                  <Button className="primary" data-default={!focusEp || undefined} onClick={() => nav.play(target, resume)}>
                    <Icon name="play" size={32} /> {playLabel}
                  </Button>
                )}
                {target && resume > 0 && <RoundButton icon="restart" label={t('details.fromStart')} onClick={() => nav.play(target, 0)} onLabel={setLabel} />}
                {series && canQueue && available.length > 0 && <RoundButton icon="shuffle" label={t('action.shuffle')} onClick={() => void shuffle()} onLabel={setLabel} />}
                {item.kind === 'episode' && item.parent_id && (
                  <RoundButton icon="tv" label={t('details.goToShow')} onClick={() => nav.open({ id: item.parent_id!, kind: 'series', title: item.series_title ?? '' })} onLabel={setLabel} />
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
            </div>
            <About item={item} meta={meta.filter(Boolean).join(' · ')} />
          </div>
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
        <InfoSection item={item} />
      </Scroller>
      {panel === 'more' && (
        <MoreMenu
          item={item}
          onMediaInfo={item.files?.length ? () => setPanel('info') : undefined}
          onPlayVersion={!series && versionsOf(item).length > 1 ? () => setPanel('version') : undefined}
          onClose={() => setPanel(null)}
        />
      )}
      {/* Plex's Play Version…: choose an edition or copy before playing, from where it was left. */}
      {panel === 'version' && (
        <Popover title={t('details.chooseVersion')} onClose={() => setPanel(null)}>
          {versionsOf(item).map((f, i) => {
            const v = versionLabel(f);
            return <PopoverItem key={f.id} first={i === 0} icon="play" label={v.name} detail={v.detail} onClick={() => { setPanel(null); nav.play(item, resume, { fileId: f.id }); }} />;
          })}
        </Popover>
      )}
      {panel === 'info' && <MediaInfo item={item} onClose={() => setPanel(null)} />}
    </div>
  );
}
