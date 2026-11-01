import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Item, type Library } from '../api';
import { TitleGrid } from '../components/Grid';
import { Button, focusElement } from '../components/spot';
import { t } from '../i18n';
import { useBack } from '../lib/back';
import { cardFor, type Card } from '../lib/home';
import { useActive, useNav } from '../lib/nav';

// An Other videos library folder by folder, as the web's VideoFolders: the folders in the current
// one (each with a video's picture as its cover and how many videos it holds), then its own
// videos, oldest first. Back goes up a folder, landing on the one it came out of.

interface Folder { name: string; path: string; count: number; cover?: string }
interface FolderPage { path: string; trail: { name: string; path: string }[]; folders: Folder[]; items: Item[] }

const FOLDER = 'folder:';

const folderCard = (f: Folder): Card => ({
  key: FOLDER + f.path,
  item: { id: FOLDER + f.path, kind: 'folder', title: f.name },
  thumb: f.cover,
  tag: t('folders.tag'),
  sub: f.count === 1 ? t('folders.oneVideo') : t('folders.videos', { n: f.count }),
});

export function VideoFolders({ library, onLoaded }: { library: Library; onLoaded: () => void }) {
  const nav = useNav();
  const active = useActive();
  const [path, setPath] = useState('');
  // The folder asked for ('' the top) and what came back for it.
  const [loaded, setLoaded] = useState<{ path: string; page: FolderPage } | null>(null);
  const [error, setError] = useState('');
  // The folder just left, to put the focus back on it one level up.
  const cameFrom = useRef('');
  const holder = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setError('');
    api<FolderPage>(`/libraries/${library.id}/folders${path ? `?path=${encodeURIComponent(path)}` : ''}`).then((page) => setLoaded({ path, page }), (e) => setError((e as Error).message));
  }, [library.id, path]);
  useEffect(load, [load]);
  const page = loaded?.path === path ? loaded.page : null;
  useEffect(() => { if (loaded || error) onLoaded(); }, [loaded, error, onLoaded]);

  // Into a folder or back out: the focus goes to its first card, or the folder it came out of.
  useEffect(() => {
    if (!page) return;
    const at = cameFrom.current ? page.folders.findIndex((f) => f.path === cameFrom.current) : -1;
    if (!cameFrom.current && !path) return; // first visit: the tabs keep the focus
    const timer = window.setTimeout(() => {
      const el = holder.current?.querySelector(`[data-index="${Math.max(at, 0)}"] .card-face`);
      if (el) focusElement(el);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [page, path]);

  const up = page?.trail.length ? page.trail[page.trail.length - 2]?.path ?? '' : '';
  useBack(() => { cameFrom.current = path; setPath(up); }, active && path !== '');

  if (error) return <div className="page-note"><p className="error">{error}</p><Button onClick={load}>{t('common.retry')}</Button></div>;
  if (!page) return <div className="page-note"><div className="spinner" /></div>;
  const all: Item[] = [...page.folders.map((f) => folderCard(f).item), ...page.items];
  if (!all.length) return <p className="muted page-note">{t('library.empty')}</p>;
  const trail = page.trail;
  return (
    <div className="library-titles" ref={holder}>
      <TitleGrid
        key={page.path}
        count={all.length}
        itemAt={(i) => all[i]}
        cardOf={(it) => (it.kind === 'folder' ? folderCard(page.folders.find((f) => FOLDER + f.path === it.id)!) : cardFor(it))}
        landscape
        top={trail.length ? 64 : 0}
        onOpen={(it) => {
          if (it.kind !== 'folder') { nav.open(it); return; }
          cameFrom.current = '';
          setPath(it.id.slice(FOLDER.length));
        }}
      >
        {trail.length > 0 && (
          <div className="folder-trail" style={{ paddingLeft: 192 }}>
            {[library.name, ...trail.map((c) => c.name)].join('  ›  ')}
          </div>
        )}
      </TitleGrid>
    </div>
  );
}
