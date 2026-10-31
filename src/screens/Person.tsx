import { useEffect, useRef, useState } from 'react';
import { api, type PersonPage as Page } from '../api';
import { Artwork } from '../components/Artwork';
import { TitleGrid } from '../components/Grid';
import { Button, useInitialFocus } from '../components/spot';
import { t } from '../i18n';
import { useNav } from '../lib/nav';
import { START } from './Home';

// Someone from a title's cast or a search: their picture, name and how many titles, then the
// titles in your libraries they're in.
export function PersonPage({ id }: { id: number }) {
  const nav = useNav();
  const root = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    api<Page>(`/people/${id}`).then(setPage, (e) => setError((e as Error).message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id]);
  useInitialFocus(root, !!page || !!error);
  if (error) return <div className="screen centered" ref={root}><p className="error">{error}</p><Button data-default onClick={load}>{t('common.retry')}</Button></div>;
  if (!page) return <div className="screen centered" ref={root}><div className="spinner" /></div>;
  const items = (page.credits ?? []).map((c) => c.item);
  const initials = page.person.name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return (
    <div className="screen page" ref={root}>
      <div className="page-head person-head" style={{ paddingLeft: START }}>
        <Artwork className="person-photo" path={page.person.image} label={initials} />
        <div>
          <h1 className="page-title">{page.person.name}</h1>
          <span className="muted">{t('person.titles', { n: items.length })}</span>
        </div>
      </div>
      {!items.length && <p className="muted page-note">{t('person.empty')}</p>}
      {items.length > 0 && (
        <div className="library-titles person-titles">
          <TitleGrid count={items.length} itemAt={(i) => items[i]} landscape={false} onOpen={(it) => nav.open(it)} />
        </div>
      )}
    </div>
  );
}
