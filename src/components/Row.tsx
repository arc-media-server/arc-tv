import type { Item } from '../api';
import { t } from '../i18n';
import { Artwork } from './Artwork';
import { Container, Focusable } from './spot';

// A titled row of posters (or episode stills), scrolled so the focused one stays in view.

function progress(it: Item): number {
  const pos = it.user_data?.position_ms ?? 0;
  const total = (it.runtime_min ?? 0) * 60000;
  return pos > 0 && total > 0 ? Math.min(1, pos / total) : 0;
}

export function caption(it: Item): string {
  if (it.kind === 'episode') {
    return `${it.series_title ?? ''} · ${t('details.episode', { season: it.season_number ?? 0, episode: it.episode_number ?? 0 })}`;
  }
  return it.year ? `${it.title} (${it.year})` : it.title;
}

export function Row({ title, items, wide, onOpen, onFocusItem }: {
  title: string;
  items: Item[];
  wide?: boolean;
  onOpen: (it: Item) => void;
  onFocusItem?: (it: Item) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="row">
      <h2>{title}</h2>
      <Container className="row-items">
        {items.map((it) => {
          const p = progress(it);
          return (
            <Focusable
              key={it.id}
              className={wide ? 'card wide' : 'card'}
              onClick={() => onOpen(it)}
              onFocus={(e) => {
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center' });
                onFocusItem?.(it);
              }}
            >
              <Artwork className="card-art" path={wide ? it.images?.backdrop ?? it.images?.primary : it.images?.primary} />
              {p > 0 && <div className="card-progress"><div style={{ width: `${p * 100}%` }} /></div>}
              <div className="card-title">{caption(it)}</div>
            </Focusable>
          );
        })}
      </Container>
    </section>
  );
}
