import { useSpoilerItem } from '../lib/useSpoilers';
import { createContext, useContext, useRef, type ReactNode } from 'react';
import type { Extra, Item } from '../api';
import { formatRuntime, t, tMaybe } from '../i18n';
import { cardFor, type Card, type CardStyle } from '../lib/home';
import { episodeCode } from '../lib/format';
import { useChanges, withChanges } from '../lib/store';
import { Artwork, useArtwork } from './Artwork';
import { Icon } from './Icon';
import { Focusable } from './spot';
import { Scroller } from './Scroller';

// Cards as the Android app draws them (ui/components/Cards.kt): artwork with a tick or an
// unwatched count in the corner and progress along the bottom; the title and a line under it.

/** Holding OK on a card opens its title's menu (Watched, Watchlist, Play Next…), as Plex's long press. */
/** Where a card is: Home's Continue Watching row, or the play queue's row (its entry). */
export interface CardPlace { inContinue?: boolean; queueEntry?: string }
export const CardMenuContext = createContext<((item: Item, from: HTMLElement | null, place?: CardPlace) => void) | null>(null);
/** Set around Home's Continue Watching row, so its cards' menus can offer Remove from Continue Watching. */
export const ContinueRowContext = createContext(false);

export const menuKinds = ['movie', 'series', 'episode'];

/**
 * A focusable that tells a press from a hold: OK held down (the key repeats) calls onHold, and
 * the click that follows when it's let go is ignored.
 */
export function Pressable({ onClick, onHold, className, children, ...rest }: {
  onClick: () => void;
  onHold?: (el: HTMLElement) => void;
  className?: string;
  children: ReactNode;
  'data-default'?: boolean;
  spotlightId?: string;
  onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
}) {
  const held = useRef(false);
  return (
    <Focusable
      className={className}
      {...rest}
      onKeyDown={(e) => {
        if (e.keyCode !== 13) return;
        if (!e.repeat) held.current = false;
        else if (onHold && !held.current) {
          held.current = true;
          onHold(e.currentTarget);
        }
      }}
      onContextMenu={(e) => {
        if (!onHold) return;
        e.preventDefault();
        onHold(e.currentTarget);
      }}
      onClick={() => {
        if (held.current) { held.current = false; return; }
        onClick();
      }}
    >
      {children}
    </Focusable>
  );
}

/** A tick in the corner for something watched; the number of episodes left for a show. */
export function WatchBadge({ item }: { item: Item }) {
  const left = item.unwatched_count ?? 0;
  if (item.kind === 'series' && left > 0) return <div className="badge count">{left}</div>;
  if (item.user_data?.played) return <div className="badge tick">✓</div>;
  return null;
}

export function ProgressLine({ progress }: { progress?: number }) {
  if (progress === undefined) return null;
  return <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>;
}

/** A card's title: the show's for an episode or a season, as Plex labels them on Home. */
export function cardTitle(card: Card): string {
  return card.item.kind === 'episode' ? card.item.series_title ?? card.item.title : card.item.title;
}

function cardSubtitle(card: Card, thumb: boolean): string {
  const it = card.item;
  if (card.sub !== undefined) return card.sub;
  if (card.seasonNumber !== undefined) return `${t('details.season', { n: card.seasonNumber })} · ${t('details.newEpisodes', { n: card.newEpisodes ?? 0 })}`;
  if (it.kind === 'episode') {
    const code = episodeCode(it);
    return thumb && it.title !== cardTitle(card) ? [code, it.title].filter(Boolean).join(' · ') : code;
  }
  return it.year ? String(it.year) : '';
}

/** A Backdrops card (Home's "Arc" look): the background art with the title's logo low on it. */
function BackdropArt({ card }: { card: Card }) {
  const logo = useArtwork(card.logo);
  return (
    <div className="backdrop-art">
      <Artwork path={card.backdrop} />
      <div className="backdrop-shade" />
      {logo ? <img className="backdrop-logo" src={logo} alt="" /> : logo === false && <div className="backdrop-title">{cardTitle(card)}</div>}
    </div>
  );
}

/** Four posters two by two (a playlist's picture, as the web's PlaylistCover). */
function Mosaic({ paths }: { paths: string[] }) {
  return (
    <div className="artwork ratio-2x3 mosaic">
      {paths.slice(0, 4).map((p, i) => <Artwork key={i} path={p} className={`mosaic-${i}`} />)}
    </div>
  );
}

export function MediaCard({ card, look = 'poster', seasonPoster, caption = true, width, onClick, onFocus, first }: {
  card: Card;
  look?: CardStyle;
  seasonPoster?: boolean;
  /** Captions on by default: the title and a line under it (S1 · E3 for an episode), on Home too as Plex shows them. */
  caption?: boolean;
  width?: number;
  onClick: () => void;
  onFocus?: () => void;
  first?: boolean;
}) {
  const changes = useChanges();
  const menu = useContext(CardMenuContext);
  const inContinue = useContext(ContinueRowContext);
  const original = withChanges(card.item, changes);
  const item = useSpoilerItem(original);
  const shown: Card = item === original ? (item === card.item ? card : { ...card, item, progress: cardFor(item).progress })
    : { ...card, ...cardFor(item), item, mosaic: undefined };
  const thumb = look === 'thumb';
  const art = thumb ? shown.thumb : seasonPoster ? shown.seasonPoster ?? shown.poster : shown.poster;
  const sub = caption ? cardSubtitle(shown, thumb) : '';
  const canMenu = menu && menuKinds.indexOf(item.kind) >= 0 && item.id !== '';
  return (
    <div className={`card card-${look}`} style={width ? { width } : undefined}>
      <Pressable
        className="card-face"
        onClick={onClick}
        onHold={canMenu ? (el) => menu(item, el, { inContinue, queueEntry: card.queueEntry }) : undefined}
        onFocus={onFocus ? () => onFocus() : undefined}
        data-default={first || undefined}
      >
        {look === 'backdrop' ? <BackdropArt card={shown} /> : shown.mosaic && shown.mosaic.length >= 4 ? <Mosaic paths={shown.mosaic} /> : <Artwork path={art} label={cardTitle(shown)} className={thumb ? 'ratio-16x9' : 'ratio-2x3'} />}
        {shown.tag && <span className="card-tag"><Icon name="folder" size={20} /> {shown.tag}</span>}
        <WatchBadge item={item} />
        <ProgressLine progress={shown.progress} />
      </Pressable>
      {caption && (
        <div className="card-caption">
          <div className="card-title">{cardTitle(shown)}</div>
          {sub && <div className="card-sub">{sub}</div>}
        </div>
      )}
    </div>
  );
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

/** A person: a round picture (or initials), their name and a line under it. */
export function PersonCard({ name, image, sub, onClick }: { name: string; image?: string; sub?: string; onClick: () => void }) {
  return (
    <div className="person-card">
      <Focusable className="person-face" onClick={onClick}>
        <Artwork path={image} label={initials(name)} />
      </Focusable>
      <div className="card-title">{name}</div>
      {sub && <div className="card-sub two-lines">{sub}</div>}
    </div>
  );
}

export function extraKindName(kind: string): string {
  return tMaybe(`extra.${kind}`) ?? t('extra.other');
}

/** An extra: a wide card with its name, and what kind of extra it is and how long. */
export function ExtraCard({ extra, onClick }: { extra: Extra; onClick: () => void }) {
  const min = Math.round((extra.duration_ms ?? 0) / 60000);
  return (
    <div className="card card-thumb">
      <Focusable className="card-face" onClick={onClick}>
        <Artwork label={extra.title} className="ratio-16x9" />
        <div className="play-glyph">▶</div>
      </Focusable>
      <div className="card-caption">
        <div className="card-title">{extra.title}</div>
        <div className="card-sub">{[extraKindName(extra.kind), min > 0 ? formatRuntime(min) : ''].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}

/** A titled row of cards (search results, a title's cast and related rows). */
export function Shelf({ title, children, start = 96, className = '' }: { title: string; children: ReactNode; start?: number; className?: string }) {
  return (
    <section className={`shelf ${className}`} data-section>
      <h2 className="shelf-title" style={{ paddingLeft: start }}>{title}</h2>
      <Strip start={start}>{children}</Strip>
    </section>
  );
}

/** A row of cards that slides along to keep the focused one in view, lined up with the page's text at `start`. */
export function Strip({ start = 96, children, resetKey }: { start?: number; children: ReactNode; resetKey?: unknown }) {
  return (
    <Scroller axis="x" pad={start} padEnd={start} className="strip" innerClassName="strip-inner" resetKey={resetKey}>
      <div className="strip-items" style={{ paddingLeft: start, paddingRight: start }}>{children}</div>
    </Scroller>
  );
}

export { cardFor };
