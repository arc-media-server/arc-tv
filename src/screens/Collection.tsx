import { useEffect, useRef, useState } from 'react';
import type { Item } from '../api';
import { api, type CollectionPage as Page } from '../api';
import { TitleGrid } from '../components/Grid';
import { Button, Container, useInitialFocus } from '../components/spot';
import { Icon } from '../components/Icon';
import { useCanQueue } from '../components/TitleMenu';
import { queues } from '../lib/store';
import { toast } from '../lib/toast';
import { t } from '../i18n';
import { useNav } from '../lib/nav';
import { START } from './Home';

/** A copy of a list in a random order. */
function shuffled<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const x = out[i]; out[i] = out[j]; out[j] = x;
  }
  return out;
}

// A collection's page: its name and how many titles, Play and Shuffle (as the web's), then its
// titles in the library's grid.
export function CollectionPage({ id }: { id: string }) {
  const nav = useNav();
  const canQueue = useCanQueue();
  const [starting, setStarting] = useState(false);
  // Plays the collection through Arc's play queue, in its order or shuffled; Arc adds a show's
  // episodes in its place (the web's collectionQueue does the same).
  const start = async (items: Item[], shuffle: boolean) => {
    if (starting) return;
    setStarting(true);
    try {
      let q = await queues.start((shuffle ? shuffled(items) : items).map((it) => it.id));
      if (q && shuffle) q = (await queues.shuffle()) ?? q;
      const first = q?.entries.find((e) => e.id === q!.current_entry_id && e.available && e.item);
      if (first?.item) nav.play(first.item, 0, { entryId: first.id });
      else toast(t('collection.playFailed'));
    } finally {
      setStarting(false);
    }
  };
  const root = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    api<Page>(`/collections/${encodeURIComponent(id)}`).then(setPage, (e) => setError((e as Error).message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id]);
  useInitialFocus(root, !!page || !!error);
  if (error) return <div className="screen centered" ref={root}><p className="error">{error}</p><Button data-default onClick={load}>{t('common.retry')}</Button></div>;
  if (!page) return <div className="screen centered" ref={root}><div className="spinner" /></div>;
  const items = page.items ?? [];
  return (
    <div className="screen page" ref={root}>
      <div className="page-head" style={{ paddingLeft: START }}>
        <h1 className="page-title">{page.collection.title}</h1>
        <span className="muted head-count">{t('library.count', { n: items.length })}</span>
        {canQueue && items.length > 0 && (
          <Container className="head-buttons collection-play">
            <Button className="primary" data-default onClick={() => void start(items, false)}><Icon name="play" size={30} /> {t('details.play')}</Button>
            <Button onClick={() => void start(items, true)}><Icon name="shuffle" size={30} /> {t('action.shuffle')}</Button>
          </Container>
        )}
      </div>
      {!items.length && <p className="muted page-note">{t('collection.empty')}</p>}
      {items.length > 0 && (
        <div className="library-titles">
          <TitleGrid count={items.length} itemAt={(i) => items[i]} landscape={page.collection.kind === 'folder'} onOpen={(it) => nav.open(it)} />
        </div>
      )}
    </div>
  );
}
