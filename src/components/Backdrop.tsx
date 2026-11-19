import { useSpoilerItem } from '../lib/useSpoilers';
import { useEffect, useState } from 'react';
import { apiOrNull, type Item, type Palette } from '../api';
import { useArtwork } from './Artwork';
import { Icon } from './Icon';
import { Focusable } from './spot';

// The whole-screen backdrop behind Home and a title's page, as the Android app's (and Plex's TV
// app): the art sits whole in the top right over an Ultra Blur wash of its own colours (worked out
// by Arc), and its left and bottom edges fade into the wash.

/** The backdrop for a title: its own, or its show's for an episode. */
export function backdropOf(it: Item): string | undefined {
  const img = it.images ?? {};
  return it.kind === 'episode' ? img.series_backdrop ?? img.backdrop_full ?? img.backdrop : img.backdrop_full ?? img.backdrop;
}

/** Whose palette matches backdropOf: the show's for an episode shown with its show's backdrop. */
function paletteIdOf(it: Item): string {
  return it.kind === 'episode' && it.images?.series_backdrop && it.parent_id ? it.parent_id : it.id;
}

export function logoOf(it: Item): string | undefined {
  const img = it.images ?? {};
  return it.kind === 'episode' ? img.series_logo ?? img.logo : img.logo;
}

const palettes = new Map<string, string[] | null>();

/** A colour brought down to wash brightness: its hue kept, its light capped well below text. */
function darkened(hex: string): string | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  let [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const light = Math.max(r, g, b);
  const scale = light > 0.42 ? 0.42 / light : 1;
  // Mixed a quarter of the way to the page colour (#0B0B10), so bright art doesn't glare.
  const mix = (c: number, page: number) => Math.round((c * scale * 0.75 + page * 0.25) * 255);
  [r, g, b] = [mix(r, 11 / 255), mix(g, 11 / 255), mix(b, 16 / 255)];
  return `${r},${g},${b}`;
}

async function paletteFor(id: string): Promise<string[] | null> {
  if (palettes.has(id)) return palettes.get(id)!;
  try {
    const p = await apiOrNull<Palette>(`/items/${encodeURIComponent(id)}/artwork/palette`);
    const c = p?.available ? p.colors : undefined;
    const out = c ? [c.top_left, c.top_right, c.bottom_left, c.bottom_right].map(darkened) : null;
    const ok = out && out.every(Boolean) ? (out as string[]) : null;
    palettes.set(id, ok);
    return ok;
  } catch {
    return null; // couldn't ask now: not remembered
  }
}

function washStyle(colors: string[]): React.CSSProperties {
  const at = ['0 0', '100% 0', '0 100%', '100% 100%'];
  return {
    backgroundImage: colors.map((c, i) => `radial-gradient(1800px circle at ${at[i]}, rgba(${c},1), rgba(${c},0))`).join(','),
  };
}

/** Shows the newest of a changing value fading in over the one before. */
function useLayers<T>(value: T, key: (v: T) => string): { v: T; k: string }[] {
  const [layers, setLayers] = useState<{ v: T; k: string }[]>([]);
  useEffect(() => {
    const k = key(value);
    setLayers((ls) => (ls.length && ls[ls.length - 1].k === k ? ls : [...ls.slice(-1), { v: value, k }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return layers;
}

function Art({ path }: { path: string }) {
  const url = useArtwork(path);
  return url ? <img className="backdrop-img fade-in" src={url} alt="" /> : null;
}

/** The backdrop and wash for `item`; changes wait a moment so moving quickly along a row stays smooth. */
export function ImmersiveBackdrop({ item: original, delay = 250 }: { item: Item | null | undefined; delay?: number }) {
  const item = useSpoilerItem(original);
  const [shown, setShown] = useState<{ art?: string; colors: string[] | null }>({ colors: null });
  useEffect(() => {
    if (!item) return;
    let live = true;
    const art = backdropOf(item);
    const timer = window.setTimeout(() => {
      void paletteFor(paletteIdOf(item)).then((colors) => { if (live) setShown({ art, colors }); });
    }, delay);
    return () => { live = false; window.clearTimeout(timer); };
  }, [item, delay]);
  const washes = useLayers(shown.colors, (c) => (c ? c.join('|') : 'none'));
  const arts = useLayers(shown.art, (a) => a ?? '');
  return (
    <div className="immersive">
      {washes.map((w) => <div key={w.k} className="wash fade-in" style={w.v ? washStyle(w.v) : undefined} />)}
      <div className="backdrop-frame">
        {item && item !== original ? (backdropOf(item) ? <Art key={backdropOf(item)} path={backdropOf(item)!} /> : null) : arts.map((a) => (a.v ? <Art key={a.k} path={a.v} /> : null))}
      </div>
    </div>
  );
}

/** A title's clear logo, or its name in large type when it has none (or it doesn't load). */
export function TitleLogo({ item }: { item: Item }) {
  const logo = useArtwork(logoOf(item));
  const title = item.kind === 'episode' ? item.series_title ?? item.title : item.title;
  if (logo) return <img className="title-logo" src={logo} alt={title} />;
  if (logo === null && logoOf(item)) return <div className="title-logo" />;
  return <h1 className="title-name">{title}</h1>;
}

/**
 * A title's logo (or name), one line of details and three lines of its description: the same on
 * Home and on the title's page, at the same place, so moving between them doesn't jump.
 */
export function TitleSummary({ item: original, meta, labels }: { item: Item; meta: string[]; labels?: string[] }) {
  const item = useSpoilerItem(original);
  const line = meta.filter(Boolean).join('  ·  ');
  return (
    <div className="summary">
      <TitleLogo item={item} />
      {line && <div className="summary-meta">{line}</div>}
      {labels && labels.length > 0 && <div className="labels">{labels.map((l) => <span key={l} className="label">{l}</span>)}</div>}
      {item.overview && <p className="summary-overview">{item.overview}</p>}
    </div>
  );
}

/** The full-screen artwork behind the page, dimmed once the page scrolls past the top. */
export function HeroBackdrop({ item: original, dim }: { item: Item; dim: boolean }) {
  const item = useSpoilerItem(original);
  const art = useArtwork(backdropOf(item));
  return (
    <div className="hero-backdrop">
      {art && <img className="hero-img fade-in" src={art} alt="" />}
      <div className="hero-shade" />
      <div className={`hero-dim${dim ? ' on' : ''}`} />
    </div>
  );
}


export function RoundButton({ icon, label, on, onClick, onLabel }: { icon: string; label: string; on?: boolean; onClick: () => void; onLabel: (l: string | null) => void }) {
  return (
    <Focusable className={`round-btn${on ? ' on' : ''}`} onClick={onClick} onFocus={() => onLabel(label)} onBlur={() => onLabel(null)}>
      <Icon name={icon} size={40} />
    </Focusable>
  );
}
