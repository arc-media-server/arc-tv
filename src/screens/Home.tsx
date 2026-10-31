import { useEffect, useState } from 'react';
import { api, type Item, type Library, type RecommendedRow } from '../api';
import { t } from '../i18n';
import { Artwork } from '../components/Artwork';
import { Row, caption } from '../components/Row';
import { Button } from '../components/spot';

interface HomeRow { key: string; title: string; items: Item[]; wide?: boolean }

// Home: Continue Watching (with Up Next), then each library's recommended rows, the same rows the
// web app and Android TV show. The focused title's backdrop fills the top.
export function Home({ profileName, onOpen, onSwitchProfile }: { profileName: string; onOpen: (it: Item) => void; onSwitchProfile: () => void }) {
  const [rows, setRows] = useState<HomeRow[] | null>(null);
  const [hero, setHero] = useState<Item | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [cont, libs] = await Promise.all([
          api<Item[]>('/home/continue?with_up_next=1'),
          api<Library[]>('/libraries'),
        ]);
        const out: HomeRow[] = [{ key: 'continue', title: t('home.continue'), items: cont, wide: true }];
        const recs = await Promise.all(
          libs.filter((l) => l.kind === 'movies' || l.kind === 'shows').map((l) =>
            api<{ rows: RecommendedRow[] }>(`/libraries/${l.id}/recommended`).then(
              (r) => r.rows.slice(0, 4).map((row) => ({ key: `${l.id}:${row.id}`, title: `${row.title} · ${l.name}`, items: row.items })),
              () => [] as HomeRow[],
            ),
          ),
        );
        for (const r of recs) out.push(...r);
        if (!live) return;
        setRows(out.filter((r) => r.items.length));
        setHero(out.find((r) => r.items.length)?.items[0] ?? null);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();
    return () => { live = false; };
  }, []);

  return (
    <div className="screen home">
      <div className="hero">
        {hero && <Artwork className="hero-art" path={hero.images?.backdrop_full ?? hero.images?.backdrop} />}
        <div className="hero-shade" />
        <div className="hero-text">
          {hero && <h1>{caption(hero)}</h1>}
          {hero?.overview && <p className="overview">{hero.overview}</p>}
        </div>
        <div className="top-bar">
          <Button onClick={onSwitchProfile}>{profileName} · {t('home.switchProfile')}</Button>
        </div>
      </div>
      <div className="rows">
        {rows === null && !error && <p className="muted">{t('common.loading')}</p>}
        {rows?.length === 0 && <p className="muted">{t('home.empty')}</p>}
        {error && <p className="error">{error}</p>}
        {rows?.map((r) => <Row key={r.key} title={r.title} items={r.items} wide={r.wide} onOpen={onOpen} onFocusItem={setHero} />)}
      </div>
    </div>
  );
}
