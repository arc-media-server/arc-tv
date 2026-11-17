import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Item, type PlaylistPage as Page, type PlaylistRef } from '../api';
import { TitleGrid } from '../components/Grid';
import { Icon } from '../components/Icon';
import { useCanQueue } from '../components/TitleMenu';
import { Button, Container, useInitialFocus } from '../components/spot';
import { formatRuntime, t } from '../i18n';
import { countLabel } from '../lib/format';
import type { Card } from '../lib/home';
import { useNav } from '../lib/nav';
import { shuffled, usePlayAll } from '../lib/playAll';
import { queues } from '../lib/store';
import { START } from './Home';

// Playlists, as the web's and Plex's: the profile's playlists (made on the web) from the sidebar,
// each a mosaic of its posters, and a playlist's page with Play, Shuffle and its titles in order.

/** A playlist's count and length: "6 titles · 12 hr 49 min". */
function playlistLine(p: PlaylistRef, n = p.count ?? 0): string {
  const min = Math.round((p.duration_ms ?? 0) / 60000);
  return [countLabel(n), min > 0 ? formatRuntime(min) : ''].filter(Boolean).join(' · ');
}

const playlistCard = (p: PlaylistRef): Card => ({
  key: p.id,
  item: { id: p.id, kind: 'playlist', title: p.title },
  poster: p.images?.[0],
  mosaic: p.images,
  sub: countLabel(p.count ?? 0),
});

/** The sidebar's Playlists: its name and count, then the playlists in the library's grid. */
export function PlaylistsContent({ visits, onReady }: { visits: number; onReady: () => void }) {
  const nav = useNav();
  const [list, setList] = useState<PlaylistRef[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api<PlaylistRef[]>('/playlists').then((l) => setList(l ?? []), (e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load, visits]);
  const told = useRef(false);
  useEffect(() => {
    if ((list || error) && !told.current) { told.current = true; onReady(); }
  }, [list, error, onReady]);
  return (
    <div className="library">
      <div className="page-head" style={{ paddingLeft: START }}>
        <h1 className="page-title">{t('nav.playlists')}</h1>
        {list && <span className="muted head-count">{list.length === 1 ? t('playlists.one') : t('playlists.count', { n: list.length })}</span>}
      </div>
      {error && <div className="page-note"><p className="error">{error}</p><Button onClick={load}>{t('common.retry')}</Button></div>}
      {list && !list.length && <p className="muted page-note">{t('playlists.empty')}</p>}
      {list && list.length > 0 && (
        <div className="library-titles">
          <TitleGrid
            count={list.length}
            itemAt={(i) => playlistCard(list[i]).item}
            cardOf={(it) => playlistCard(list.find((p) => p.id === it.id)!)}
            landscape={false}
            onOpen={(it) => nav.playlist(it.id)}
          />
        </div>
      )}
    </div>
  );
}

/** A playlist's page: its name, count and length, Play and Shuffle, then its titles in order. */
export function PlaylistPage({ id }: { id: string }) {
  const nav = useNav();
  const canQueue = useCanQueue();
  const root = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const playAll = usePlayAll(t('playlists.playFailed'));
  const load = () => {
    setError('');
    api<Page>(`/playlists/${encodeURIComponent(id)}`).then(setPage, (e) => setError((e as Error).message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id]);
  useInitialFocus(root, !!page || !!error);
  if (error) return <div className="screen centered" ref={root}><p className="error">{error}</p><Button data-default onClick={load}>{t('common.retry')}</Button></div>;
  if (!page) return <div className="screen centered" ref={root}><div className="spinner" /></div>;
  const items: Item[] = (page.entries ?? []).map((e) => e.item);
  // In order, Arc snapshots the playlist itself; shuffled, its titles go in mixed up.
  const play = () => playAll(() => queues.start({ playlistId: id }), false);
  const shuffle = () => playAll(() => queues.start(shuffled(items).map((it) => it.id)), true);
  return (
    <div className="screen page" ref={root}>
      <div className="page-head" style={{ paddingLeft: START }}>
        <h1 className="page-title">{page.playlist.title}</h1>
        <span className="muted head-count">{playlistLine(page.playlist, items.length)}</span>
        {canQueue && items.length > 0 && (
          <Container className="head-buttons collection-play">
            <Button className="primary" data-default onClick={() => void play()}><Icon name="play" size={30} /> {t('details.play')}</Button>
            <Button onClick={() => void shuffle()}><Icon name="shuffle" size={30} /> {t('action.shuffle')}</Button>
          </Container>
        )}
      </div>
      {!items.length && <p className="muted page-note">{t('playlists.emptyPlaylist')}</p>}
      {items.length > 0 && (
        <div className="library-titles">
          <TitleGrid count={items.length} itemAt={(i) => items[i]} landscape={false} onOpen={(it) => nav.open(it)} />
        </div>
      )}
    </div>
  );
}
