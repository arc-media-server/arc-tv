import { useEffect, useRef, useState } from 'react';
import { api, enc, type SearchResults } from '../api';
import { cardFor, MediaCard, PersonCard, Shelf } from '../components/Cards';
import { Scroller } from '../components/Scroller';
import { SpotInput } from '../components/spot';
import { t } from '../i18n';
import { useNav } from '../lib/nav';
import { START } from './Home';

// Search, as the Android app's: a field at the top (the TV's own keyboard comes up on OK), and
// results as they're typed (once typing pauses): Movies, Shows, People, then Episodes.

let lastQuery = '';

export function SearchContent({ onReady }: { onReady: () => void }) {
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

  const groups = results ? [
    { title: t('search.movies'), items: results.movies ?? [], thumb: false },
    { title: t('search.shows'), items: results.shows ?? [], thumb: false },
  ] : [];
  const people = results?.people ?? [];
  const episodes = results?.episodes ?? [];
  const nothing = results && !groups.some((g) => g.items.length) && !people.length && !episodes.length;

  return (
    <div className="search">
      <div className="search-head" style={{ paddingLeft: START }}>
        <SpotInput
          className="search-input"
          data-default
          data-scrollable
          value={text}
          placeholder={t('search.placeholder')}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {!text.trim() && <p className="muted page-note">{t('search.hint')}</p>}
      {error && <p className="error page-note">{error}</p>}
      {nothing && <p className="muted page-note">{t('search.empty', { q: text.trim() })}</p>}
      {results && !nothing && (
        <Scroller className="search-body" pad={20}>
          {groups.map((g) => g.items.length > 0 && (
            <Shelf key={g.title} title={g.title} start={START}>
              {g.items.map((it) => <MediaCard key={it.id} card={cardFor(it)} onClick={() => nav.open(it)} />)}
            </Shelf>
          ))}
          {people.length > 0 && (
            <Shelf title={t('search.people')} start={START}>
              {people.map((p) => <PersonCard key={p.id} name={p.name} image={p.image} sub={p.known_for} onClick={() => nav.person(p.id)} />)}
            </Shelf>
          )}
          {episodes.length > 0 && (
            <Shelf title={t('search.episodes')} start={START}>
              {episodes.map((it) => <MediaCard key={it.id} card={cardFor(it)} look="thumb" onClick={() => nav.open(it)} />)}
            </Shelf>
          )}
        </Scroller>
      )}
    </div>
  );
}
