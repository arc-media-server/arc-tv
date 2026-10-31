import { useEffect, useState } from 'react';
import { api, type Item, type Season } from '../api';
import { formatTime, t } from '../i18n';
import { Artwork } from '../components/Artwork';
import { Row } from '../components/Row';
import { Button, Container, DefaultContainer } from '../components/spot';

// A movie, show or episode: backdrop, overview, Play/Resume, and a show's seasons and episodes
// in the profile's episode order (Arc's display ordering).
export function Details({ id, onPlay, onOpen }: { id: string; onPlay: (it: Item, startMs: number) => void; onOpen: (it: Item) => void }) {
  const [item, setItem] = useState<Item | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [season, setSeason] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setItem(null);
    api<Item>(`/items/${id}`).then(async (it) => {
      if (!live) return;
      setItem(it);
      if (it.kind === 'series') {
        const s = await api<{ seasons: Season[] }>(`/series/${id}/seasons`);
        if (!live) return;
        const list = s.seasons.filter((x) => x.episodes.some((e) => e.available));
        setSeasons(list);
        // Open on the first season with something unwatched.
        const first = list.findIndex((x) => x.season_number > 0 && x.episodes.some((e) => e.available && !e.user_data?.played));
        setSeason(Math.max(0, first));
      }
    }, (e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [id]);

  if (error) return <div className="screen centered"><p className="error">{error}</p></div>;
  if (!item) return <div className="screen centered"><p className="muted">{t('common.loading')}</p></div>;

  const resume = item.user_data?.position_ms ?? 0;
  const nextEpisode = seasons.flatMap((s) => s.episodes).find((e) => e.available && !e.user_data?.played && (e.season_number ?? 0) > 0);
  const meta = [item.year, item.content_rating, item.runtime_min ? t('details.minutes', { n: item.runtime_min }) : '', ...(item.genres ?? []).slice(0, 3)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="screen details">
      <Artwork className="details-art" path={item.images?.backdrop_full ?? item.images?.backdrop} />
      <div className="details-shade" />
      <div className="details-body">
        {item.images?.logo ? <Artwork className="details-logo" path={item.images.logo} alt={item.title} /> : <h1>{item.title}</h1>}
        {item.kind === 'episode' && <h2>{item.series_title} · {t('details.episode', { season: item.season_number ?? 0, episode: item.episode_number ?? 0 })}</h2>}
        <p className="muted">{meta}</p>
        {item.tagline && <p className="tagline">{item.tagline}</p>}
        {item.overview && <p className="overview">{item.overview}</p>}
        <DefaultContainer className="inline">
          {item.kind !== 'series' && resume > 0 && (
            <Button data-default onClick={() => onPlay(item, resume)}>{t('details.resume', { time: formatTime(resume) })}</Button>
          )}
          {item.kind !== 'series' && (
            <Button data-default={resume > 0 ? undefined : true} onClick={() => onPlay(item, 0)}>{resume > 0 ? t('details.fromStart') : t('details.play')}</Button>
          )}
          {item.kind === 'series' && nextEpisode && (
            <Button data-default onClick={() => onPlay(nextEpisode, nextEpisode.user_data?.position_ms ?? 0)}>
              {t('details.play')} · {t('details.episode', { season: nextEpisode.season_number ?? 0, episode: nextEpisode.episode_number ?? 0 })}
            </Button>
          )}
        </DefaultContainer>
        {seasons.length > 0 && (
          <>
            <Container className="inline seasons">
              {seasons.map((s, i) => (
                <Button key={s.season_number} className={i === season ? 'selected' : ''} onClick={() => setSeason(i)} onFocus={() => setSeason(i)}>
                  {s.name || t('details.season', { n: s.season_number })}
                </Button>
              ))}
            </Container>
            <Row
              title=""
              wide
              items={(seasons[season]?.episodes ?? []).filter((e) => e.available).map((e) => ({ ...e, series_title: item.title }))}
              onOpen={onOpen}
            />
          </>
        )}
      </div>
    </div>
  );
}
