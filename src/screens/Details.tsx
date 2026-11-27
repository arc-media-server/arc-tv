import { useHideSpoilers } from '../lib/useSpoilers';
import { spoilerSafeItem } from '../lib/spoilers';
// Live updates
import { useLiveRefresh } from '../lib/live-updates';
import { liveTopics } from '../lib/live-hints';
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
import { episodeCode, episodeHeading, formatCapsules, languageName, nextEpisode, resumeMs, versionLabel, versionsOf, watched, yearAndEdition } from '../lib/format';
import { useActive, useNav } from '../lib/nav';
import { prefs, queues, setSeasonPlayed, useChanges, withChanges } from '../lib/store';
import { shuffled, usePlayAll } from '../lib/playAll';
import { toast } from '../lib/toast';
// Theme music
import { useThemeMusic } from '../lib/themeMusic';

// A title's page, as the Android app's DetailsScreen: the same summary as Home's over the title's
// backdrop, then Play (or Resume), Shuffle for a show, and Plex's round Watched, Watchlist and ⋯
// buttons; a show's seasons and episodes in its display order; then the cast, the collections it's
// in, More Like This and extras. Opened from an episode, it lands on that episode in its show.
// Episodes on disk that the show's episode order leaves out get a last tab, Not in This Order, so
// nothing silently disappears (Arc's rule); Play, Resume and Shuffle still follow the order.

const PAGE_START = 96;

interface Related { key: string; title?: string; items: Item[]; landscape: boolean }

/** A tab under the show: one of its seasons, or the episodes its order doesn't include. */
interface EpisodeTab { key: string; name: string; episodes: Item[]; unplaced: boolean; seasonNumber?: number }

function seasonName(s: Season) {
  return s.name || (s.season_number === 0 ? t('details.specials') : t('details.season', { n: s.season_number }));
}

/**
 * An episode as the Apple TV app shows one: its picture with progress and a tick, then its number,
 * its name, a few lines of its description, and its length (or what's left of it).
 */
function EpisodeCard({ ep, first, unplaced, onPlay }: { ep: Item; first: boolean; unplaced: boolean; onPlay: () => void }) {
  const menu = useContext(CardMenuContext);
  const card = cardFor(ep);
  const pos = resumeMs(ep);
  const length = ep.runtime_min
    ? pos > 0 ? t('details.timeLeft', { time: formatRuntime(Math.max(1, Math.round(ep.runtime_min - pos / 60000))) }) : formatRuntime(ep.runtime_min)
    : '';
  const sub = [length, ep.available === false ? t('details.missing') : ''].filter(Boolean).join(' · ');
  return (
    <div className={`card card-thumb episode-card${ep.available === false ? ' missing' : ''}`}>
      <Pressable className="card-face" onClick={() => { if (ep.available !== false) onPlay(); }} onHold={menu && ep.available !== false ? (el) => menu(ep, el) : undefined} data-default={first || undefined}>
        <Artwork path={card.thumb} label={ep.title} className="ratio-16x9" />
        <WatchBadge item={ep} />
        <ProgressLine progress={card.progress} />
      </Pressable>
      <div className="card-caption">
        {/* "S1 · E4" ("Special 3") small over the name, as Android. An episode outside the order has no number in it, so none is shown (as the web). */}
        {!unplaced && episodeCode(ep) && <div className="episode-code">{episodeCode(ep)}</div>}
        <div className="card-title">{ep.title}</div>
        {ep.overview && <div className="episode-overview">{ep.overview}</div>}
        {sub && <div className="card-sub">{sub}</div>}
      </div>
    </div>
  );
}

/**
 * The description under the logo, above the buttons: three lines, and when that cuts it short, focusable with
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
      {/* The year and running time (or episodes left) and the score, then the quality capsules, as Android. */}
      <div className="hero-meta">
        {meta && <span>{meta}</span>}
        {formatCapsules(item.files).map((c) => (
          <span key={c.parts.join('|')} className={`capsule${c.filled ? ' filled' : ''}`}>
            {c.parts.map((part, i) => <span key={part} className={i > 0 ? 'capsule-part split' : 'capsule-part'}>{part}</span>)}
          </span>
        ))}
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

/** Who's in it and who made it, low on the right of the artwork, level with the buttons (as Android). */
function HeaderCredits({ item }: { item: Item }) {
  const names = (role: string) => (item.credits ?? []).filter((c) => c.role === role).slice(0, 3).map((c) => c.name).join(', ');
  const lines: [string, string][] = [[t('details.info.starring'), names('actor')], [t('details.info.directors'), names('director')]];
  const shown = lines.filter(([, who]) => who);
  if (!shown.length) return null;
  return (
    <div className="hero-credits">
      {shown.map(([label, who]) => <div key={label} className="hero-credit"><span className="muted-label">{label}</span> <b>{who}</b></div>)}
    </div>
  );
}

/** The show's seasons as tabs, then Not in This Order when the order leaves episodes out. */
function episodeTabs(seasons: Season[], unplaced: Item[]): EpisodeTab[] {
  const tabs: EpisodeTab[] = seasons.map((s) => ({ key: `season:${s.season_number}`, name: seasonName(s), episodes: s.episodes, unplaced: false, seasonNumber: s.season_number }));
  if (unplaced.length) tabs.push({ key: 'unplaced', name: t('details.notInOrder'), episodes: unplaced, unplaced: true });
  return tabs;
}

/**
 * The seasons as tabs (then Not in This Order) with the chosen tab's episodes under them. OK on a
 * season's tab opens its menu, as on Android and in Kodi: Shuffle Season and Mark Season as
 * Watched (or Unwatched). Not in This Order isn't a
 * season, so it has no menu. Missing episodes follow the profile's Show Missing Episodes setting.
 */
/** A season's menu, drawn by the page over everything (outside the scrolling page, as the cards' menus are). */
interface SeasonMenu { title: string; canShuffle: boolean; watched: boolean; shuffle: () => void; mark: () => void }

function Seasons({ seriesId, tabs, orderName, initial, focusId, canQueue, onPlay, onSeasonMarked, onMenu }: {
  seriesId: string;
  tabs: EpisodeTab[];
  orderName?: string;
  initial: number;
  focusId?: string;
  canQueue: boolean;
  onPlay: (ep: Item) => void;
  onSeasonMarked: () => void;
  onMenu: (menu: SeasonMenu) => void;
}) {
  const [selectedKey, setSelectedKey] = useState(tabs[initial]?.key);
  const selected = Math.max(0, tabs.findIndex((x) => x.key === selectedKey));
  const changes = useChanges();
  const playAll = usePlayAll(t('details.seasonPlayFailed'));
  if (!tabs.length) return <section style={{ paddingLeft: PAGE_START }}><p className="muted">{t('details.noEpisodes')}</p></section>;
  const tab = tabs[Math.min(selected, tabs.length - 1)];
  const episodes = tab.episodes.map((e) => withChanges(e, changes));
  const onDisk = tab.unplaced ? [] : episodes.filter((e) => e.available !== false);
  const seasonWatched = onDisk.length > 0 && onDisk.every((e) => e.user_data?.played);
  const canShuffle = canQueue && onDisk.length > 1;
  // A season of only missing episodes has nothing to shuffle or mark, so no menu.
  const hasMenu = tab.seasonNumber !== undefined && onDisk.length > 0;
  const shuffleSeason = () => void playAll(() => queues.start(shuffled(onDisk).map((e) => e.id)), false);
  const openMenu = () => onMenu({ title: tab.name, canShuffle, watched: seasonWatched, shuffle: shuffleSeason, mark: markSeason });
  const markSeason = () => {
    if (tab.seasonNumber === undefined) return;
    setSeasonPlayed(seriesId, tab.seasonNumber, onDisk, !seasonWatched).then(onSeasonMarked, () => toast(t('action.watchedFailed')));
  };
  return (
    <section className="seasons" data-section>
      <div className="season-bar" style={{ marginLeft: PAGE_START - 16 }}>
        <Container className="tabs">
          {tabs.map((x, i) => (
            <Pressable
              key={x.key}
              className={`tab${i === selected ? ' selected' : ''}`}
              onFocus={() => setSelectedKey(x.key)}
              // The tab is selected as it takes the focus, so OK (or holding it) opens the focused
              // tab's menu, as on Android and in Kodi.
              onClick={() => { setSelectedKey(x.key); if (x.key === tab.key && hasMenu) openMenu(); }}
              onHold={x.key === tab.key && hasMenu ? openMenu : undefined}
            >
              {x.name}
            </Pressable>
          ))}
        </Container>
      </div>
      {tab.unplaced && (
        <p className="muted unplaced-note" style={{ paddingLeft: PAGE_START }}>
          {orderName ? t('details.unplacedNote', { order: orderName }) : t('details.unplacedNoteNoName')}
        </p>
      )}
      <Container className="episodes">
        <EpisodeStrip key={tab.key} episodes={episodes} unplaced={tab.unplaced} focusId={focusId} onPlay={onPlay} />
      </Container>
    </section>
  );
}

function EpisodeStrip({ episodes, unplaced, focusId, onPlay }: { episodes: Item[]; unplaced: boolean; focusId?: string; onPlay: (ep: Item) => void }) {
  return (
    <Strip start={PAGE_START}>
      {episodes.map((ep) => <EpisodeCard key={ep.id || `missing:${ep.season_number}:${ep.episode_number}`} ep={ep} first={ep.id === focusId} unplaced={unplaced} onPlay={() => onPlay(ep)} />)}
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
  const [unplaced, setUnplaced] = useState<Item[]>([]);
  const seasonsRequest = useRef(0);
  const [orderName, setOrderName] = useState<string | undefined>(undefined);
  const [related, setRelated] = useState<Related[]>([]);
  const [error, setError] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [panel, setPanel] = useState<'more' | 'info' | 'version' | null>(null);
  const [seasonMenu, setSeasonMenu] = useState<SeasonMenu | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const changes = useChanges();
  const canQueue = useCanQueue();

  // Missing episodes (not on disk) are listed when the profile's Show Missing Episodes setting is on.
  const loadSeasons = useCallback(async () => {
    const request = ++seasonsRequest.current;
    const missing = !!(await prefs()).show_missing_episodes;
    const s = await api<SeasonsResponse>(`/series/${encodeURIComponent(id)}/seasons${missing ? '?missing=1' : ''}`);
    if (request !== seasonsRequest.current) return;
    setSeasons((s.seasons ?? []).filter((x) => x.episodes && x.episodes.length));
    setUnplaced(s.unplaced ?? []);
    setOrderName(s.ordering?.name || undefined);
  }, [id]);
  useEffect(() => () => { ++seasonsRequest.current; }, [id]);

  const load = useCallback((quiet: boolean) => {
    if (!quiet) setError('');
    api<Item>(`/items/${encodeURIComponent(id)}`).then(async (it) => {
      if (it.kind === 'series') {
        await loadSeasons();
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
  }, [id, loadSeasons]);

  useEffect(() => { load(false); }, [load]);
  // Live updates: preserve the title and focused menu while hints arrive.
  useLiveRefresh(liveTopics.title, active && panel === null && !seasonMenu, () => load(true));
  // The profile's settings changed elsewhere (Show Missing Episodes among them).
  useLiveRefresh(liveTopics.prefs, active && panel === null && !seasonMenu, () => load(true));

  // Coming back from the player: the new resume point and watched state.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) load(true);
    wasActive.current = active;
  }, [active, load]);

  const hideSpoilers = useHideSpoilers();
  const item = base ? spoilerSafeItem(withChanges(base, changes), hideSpoilers) : null;
  useThemeMusic(id, base?.id === id ? base : null, active);
  const next = seasons ? nextEpisode(seasons) : undefined;
  // Play, Resume and Shuffle follow the order (seasons only); a tab opened on an episode can be
  // Not in This Order, when that's where the episode is.
  const tabs = seasons ? episodeTabs(seasons, unplaced).map((tab) => ({ ...tab, episodes: tab.episodes.map((ep) => spoilerSafeItem(withChanges(ep, changes), hideSpoilers, base)) })) : [];
  const focusEp = episodeId ? tabs.reduce<Item | undefined>((f, x) => f ?? x.episodes.find((e) => e.id === episodeId), undefined) : undefined;
  const land = focusEp ?? next;
  const initialSeason = land ? Math.max(0, tabs.findIndex((x) => x.episodes.some((e) => e.id === land.id))) : 0;
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
  // As Android: the age rating and genres above the description; the year, running time (or
  // episodes left) and score under it.
  const genres = (item.genres ?? []).slice(0, 3).join(' · ');
  const meta = [
    item.kind !== 'episode' ? yearAndEdition(item) : '',
    !series && item.runtime_min ? formatRuntime(item.runtime_min) : '',
    series && left > 0 ? (left === 1 ? t('details.oneEpisodeLeft') : t('details.episodesLeft', { n: left })) : '',
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
        {/* As Android and the Apple TV app: the artwork fills the screen with everything low on
            it (the logo, the description and details, then the buttons); the rest scrolls up over
            a dimmed copy. */}
        <section className={`details-hero${series ? '' : ' details-hero-film'}`} data-section>
          <div className="hero-row">
          <div className="hero-main">
          <TitleLogo item={item} />
          {item.kind === 'episode' && <div className="hero-episode">{episodeHeading(item)}</div>}
          {(item.content_rating || genres) && (
            <div className="hero-genres">
              {item.content_rating && <span className="age-rating">{item.content_rating}</span>}
              {genres && <span>{genres}</span>}
            </div>
          )}
          <About item={item} meta={meta.filter(Boolean).join(' · ')} />
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
          </div>
          <HeaderCredits item={item} />
          </div>
        </section>
        {series && seasons && (
          <Seasons
            key={id}
            seriesId={item.id}
            tabs={tabs}
            orderName={orderName}
            initial={initialSeason}
            focusId={focusEp?.id}
            canQueue={canQueue}
            onPlay={(ep) => { if (ep.available !== false) nav.play(ep, resumeMs(ep)); }}
            onSeasonMarked={() => load(true)}
            onMenu={setSeasonMenu}
          />
        )}
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
      {seasonMenu && (
        <Popover title={seasonMenu.title} onClose={() => setSeasonMenu(null)}>
          {seasonMenu.canShuffle && <PopoverItem first icon="shuffle" label={t('details.shuffleSeason')} onClick={() => { setSeasonMenu(null); seasonMenu.shuffle(); }} />}
          <PopoverItem
            first={!seasonMenu.canShuffle}
            icon={seasonMenu.watched ? 'circleCheck' : 'check'}
            label={t(seasonMenu.watched ? 'details.seasonUnwatched' : 'details.seasonWatched')}
            onClick={() => { setSeasonMenu(null); seasonMenu.mark(); }}
          />
        </Popover>
      )}
      {panel === 'more' && (
        <MoreMenu
          item={item}
          rating // Star rating: title pages only, as Android #34.
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
