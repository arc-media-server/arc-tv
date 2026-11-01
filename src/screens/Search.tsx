import { useEffect, useRef, useState } from 'react';
import { api, enc, type GenreMatch, type SearchResults } from '../api';
import { cardFor, MediaCard, PersonCard, Shelf } from '../components/Cards';
import { Scroller } from '../components/Scroller';
import { SpotInput } from '../components/spot';
import { Icon } from '../components/Icon';
import type { Item } from '../api';
import { t } from '../i18n';
import { useNav } from '../lib/nav';
import { START } from './Home';
import { collectionCard } from './Library';
import { Focusable } from '../components/spot';

// Search, as the Apple TV app's (owner, 1 November): a glass field at the top (the TV's own
// keyboard comes up on OK), and results as they're typed (once typing pauses): Top Results
// (movies and shows together, as wide artwork cards), then People and Episodes.

/** Movies and shows together, alternating, each list keeping Arc's best-first order. */
function topResults(movies: Item[], shows: Item[]): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < Math.max(movies.length, shows.length); i++) {
    if (movies[i]) out.push(movies[i]);
    if (shows[i]) out.push(shows[i]);
  }
  return out;
}

let lastQuery = '';

export function SearchContent({ onReady, onGenre }: { onReady: () => void; onGenre: (g: GenreMatch) => void }) {
  const nav = useNav();
  const [text, setText] = useState(lastQuery);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState('');
  const asked = useRef(0);

  useEffect(() => { onReady(); }, [onReady]);

  useEffect(() => {
    lastQuery = text;
    const q = text.trim();
    if (!q) {
      setResults(null);
      setError('');
      return;
    }
    const n = ++asked.current;
    const timer = window.setTimeout(() => {
      api<SearchResults>(`/search?q=${enc(q)}`).then(
        (r) => { if (n === asked.current) { setResults(r); setError(''); } },
        () => { if (n === asked.current) setError(t('search.failed')); },
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const top = results ? topResults(results.movies ?? [], results.shows ?? []) : [];
  const people = results?.people ?? [];
  const episodes = results?.episodes ?? [];
  const collections = results?.collections ?? [];
  const genres = results?.genres ?? [];
  const nothing = results && !top.length && !people.length && !episodes.length && !collections.length && !genres.length;

  return (
    <div className="search">
      <div className="search-head" style={{ paddingLeft: START }}>
        <div className="search-field">
          <SpotInput
            className="search-input"
            data-default
            data-scrollable
            value={text}
            placeholder={t('search.placeholder')}
            onChange={(e) => setText(e.target.value)}
          />
          <Icon name="search" size={36} />
        </div>
      </div>
      {!text.trim() && (
        <div className="search-empty">
          <Icon name="search" size={96} />
          <p>{t('search.hint')}</p>
        </div>
      )}
      {error && <p className="error page-note">{error}</p>}
      {nothing && <p className="muted page-note">{t('search.empty', { q: text.trim() })}</p>}
      {results && !nothing && (
        <Scroller className="search-body" pad={20}>
          {top.length > 0 && (
            <Shelf title={t('search.top')} start={START}>
              {top.map((it) => <MediaCard key={it.id} card={cardFor(it)} look="backdrop" width={400} onClick={() => nav.open(it)} />)}
            </Shelf>
          )}
          {people.length > 0 && (
            <Shelf title={t('search.people')} start={START}>
              {people.map((p) => <PersonCard key={p.id} name={p.name} image={p.image} sub={p.known_for} onClick={() => nav.person(p.id)} />)}
            </Shelf>
          )}
          {collections.length > 0 && (
            <Shelf title={t('search.collections')} start={START}>
              {collections.map((c) => <MediaCard key={c.id} card={collectionCard(c)} look="poster" onClick={() => nav.collection(c.id)} />)}
            </Shelf>
          )}
          {episodes.length > 0 && (
            <Shelf title={t('search.episodes')} start={START}>
              {episodes.map((it) => <MediaCard key={it.id} card={cardFor(it)} look="thumb" onClick={() => nav.open(it)} />)}
            </Shelf>
          )}
          {/* As the web: a genre opens its library's titles filtered to it. */}
          {genres.length > 0 && (
            <Shelf title={t('search.genres')} start={START}>
              {genres.map((g) => (
                <Focusable key={`${g.library_id}:${g.name}`} className="genre-pill" onClick={() => onGenre(g)}>
                  <span className="genre-name">{g.name}</span>
                  <span className="genre-where">{[g.library_name, g.count].filter((x) => x !== undefined && x !== '').join(' · ')}</span>
                </Focusable>
              ))}
            </Shelf>
          )}
        </Scroller>
      )}
    </div>
  );
}
