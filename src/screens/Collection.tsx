import { useEffect, useRef, useState } from 'react';
import { api, type CollectionPage as Page } from '../api';
import { TitleGrid } from '../components/Grid';
import { Button, useInitialFocus } from '../components/spot';
import { t } from '../i18n';
import { useNav } from '../lib/nav';
import { START } from './Home';

// A collection's page: its name and how many titles, then its titles in the library's grid.
export function CollectionPage({ id }: { id: string }) {
  const nav = useNav();
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
