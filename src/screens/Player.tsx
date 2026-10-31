import { Spotlight } from '@enact/spotlight';
import { useCallback, useEffect, useRef, useState } from 'react';
import platform from '@platform';
import { api, type Item, type Marker, type Playback } from '../api';
import type { NativePlayer, PlayerCaps } from '../platform/types';
import { formatTime, t } from '../i18n';

// Full-screen playback with the TV's own player. Arc decides direct play, remux or conversion
// from the TV's caps; the native player can't send the sign-in header, so the stream URL is
// swapped for a link with a token in it (POST /cast, as casting does). If a file the TV said it
// could play fails, it falls back like the web app: direct -> remux -> convert.

type Attempt = 'direct' | 'remux' | 'convert';

function capsFor(caps: PlayerCaps, attempt: Attempt): PlayerCaps {
  if (attempt === 'remux') return { ...caps, containers: [] };
  if (attempt === 'convert') return { ...caps, containers: [], video: [] };
  return caps;
}

const SEEK_MS = 10000;

export function Player({ item, startMs, onExit, onPlayNext }: { item: Item; startMs: number; onExit: () => void; onPlayNext: (next: Item) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<NativePlayer | null>(null);
  const plan = useRef<Playback | null>(null);
  const attempt = useRef<Attempt>('direct');
  const caps = useRef<PlayerCaps | null>(null);
  const [now, setNow] = useState(startMs);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [osd, setOsd] = useState(true);
  const [status, setStatus] = useState(t('common.loading'));
  const [failed, setFailed] = useState('');
  const [next, setNext] = useState<Item | null>(null);
  const nextRef = useRef<Item | null>(null);
  nextRef.current = next;
  const osdTimer = useRef(0);

  // Position in the title: converted streams start at the seek point, so add their offset.
  const position = useCallback(() => (plan.current?.offset_ms ?? 0) + (player.current?.position() ?? 0), []);

  const report = useCallback((state: 'playing' | 'paused' | 'stopped') => {
    const d = plan.current?.duration_ms || duration;
    if (!plan.current || !d) return;
    void api(`/items/${item.id}/progress`, { method: 'PUT', body: { position_ms: Math.round(position()), duration_ms: d, state } }).catch(() => {});
  }, [item.id, duration, position]);

  const stopSession = () => {
    const sid = plan.current?.session_id;
    if (sid) void api(`/transcode/${sid}`, { method: 'DELETE' }).catch(() => {});
  };

  const start = useCallback(async (fromMs: number) => {
    setStatus(t('common.loading'));
    setFailed('');
    player.current?.destroy();
    player.current = null;
    stopSession();
    try {
      caps.current ??= await platform.caps();
      const p = await api<Playback>(`/items/${item.id}/playback`, { method: 'POST', body: { caps: capsFor(caps.current, attempt.current), start_ms: Math.round(fromMs) } });
      plan.current = p;
      if (p.method !== 'direct') setStatus(t('player.converting'));
      const { url } = await api<{ url: string }>('/cast', { method: 'POST', body: { url: p.url } });
      const native = platform.createPlayer(host.current!);
      player.current = native;
      native.on((ev, detail) => {
        if (ev === 'time') setNow(position());
        if (ev === 'playing') { setPaused(false); setStatus(''); }
        if (ev === 'paused') setPaused(true);
        if (ev === 'ended') {
          report('stopped');
          if (nextRef.current) onPlayNext(nextRef.current);
          else onExit();
        }
        if (ev === 'error') fail(detail ?? 'error');
      });
      // Direct and remuxed streams start at 0 and seek; converted ones already start at fromMs.
      await native.load(url, p.hls ? 0 : fromMs);
      setDuration(p.duration_ms || native.duration());
      native.play();
    } catch (e) {
      fail((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const fail = (why: string) => {
    if (attempt.current !== 'convert') {
      attempt.current = attempt.current === 'direct' ? 'remux' : 'convert';
      void start(position() || startMs);
      return;
    }
    setFailed(`${t('player.failed')} (${why})`);
  };

  useEffect(() => {
    Spotlight.pause();
    void start(startMs);
    api<Item | undefined>(`/items/${item.id}/next`).then((n) => setNext(n ?? null), () => {});
    const progress = window.setInterval(() => report(player.current?.paused() ? 'paused' : 'playing'), 10000);
    const ping = window.setInterval(() => {
      const sid = plan.current?.session_id;
      if (sid) void api(`/transcode/${sid}/ping`, { method: 'POST' }).catch(() => {});
    }, 30000);
    return () => {
      window.clearInterval(progress);
      window.clearInterval(ping);
      report('stopped');
      player.current?.destroy();
      stopSession();
      Spotlight.resume();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const showOsd = () => {
    setOsd(true);
    window.clearTimeout(osdTimer.current);
    osdTimer.current = window.setTimeout(() => setOsd(false), 4000);
  };

  const seekTo = (ms: number) => {
    const target = Math.max(0, Math.min(ms, (duration || Infinity) - 1000));
    setNow(target);
    // A converted or remuxed stream only has what's been made so far: start a new one there.
    if (plan.current?.hls) void start(target);
    else player.current?.seek(target - (plan.current?.offset_ms ?? 0));
  };

  const marker: Marker | undefined = plan.current?.markers?.find((m) => now >= m.start_ms && now < m.end_ms - 1000 && m.kind !== 'credits');
  const credits = plan.current?.markers?.find((m) => m.kind === 'credits');
  const inCredits = !!credits && now >= credits.start_ms;

  const togglePause = () => {
    const p = player.current;
    if (!p) return;
    if (p.paused()) p.play();
    else { p.pause(); report('paused'); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = platform.remoteKey(e.keyCode);
      showOsd();
      if (key === 'back' || key === 'stop') { e.preventDefault(); e.stopPropagation(); onExit(); return; }
      if (key === 'playPause') togglePause();
      else if (key === 'play') player.current?.play();
      else if (key === 'pause') player.current?.pause();
      else if (key === 'forward' || e.key === 'ArrowRight') seekTo(position() + (key ? 30000 : SEEK_MS));
      else if (key === 'rewind' || e.key === 'ArrowLeft') seekTo(position() - (key ? 30000 : SEEK_MS));
      else if (e.key === 'Enter') {
        if (inCredits && next) onPlayNext(next);
        else if (marker) seekTo(marker.end_ms);
        else togglePause();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const skipLabel = marker?.kind === 'recap' ? t('player.skipRecap') : marker?.kind === 'credits' ? t('player.skipCredits') : t('player.skipIntro');
  return (
    <div className="player" onMouseMove={showOsd}>
      <div ref={host} className="player-host" />
      {(status || failed) && <div className="player-status">{failed || status}</div>}
      {marker && !inCredits && <div className="skip-button focused">{skipLabel}</div>}
      {inCredits && next && (
        <div className="up-next">
          <div className="muted">{t('player.upNext', { title: next.title })}</div>
          <div className="skip-button focused">{t('player.playNext')}</div>
        </div>
      )}
      {(osd || paused) && (
        <div className="osd">
          <div className="osd-title">{item.series_title ? `${item.series_title} · ${item.title}` : item.title}</div>
          <div className="osd-bar"><div style={{ width: duration ? `${(now / duration) * 100}%` : 0 }} /></div>
          <div className="osd-times"><span>{formatTime(now)}</span><span>{paused ? '❚❚' : ''}</span><span>{formatTime(duration)}</span></div>
        </div>
      )}
    </div>
  );
}
