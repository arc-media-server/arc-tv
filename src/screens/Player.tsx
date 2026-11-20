import { useSpoilerItem } from '../lib/useSpoilers';
import { InvitePicker } from '../components/InvitePicker';
import { EndedPane, LeaveConfirm, RoomCard, RoomPill, useRoomNotice, WaitingPill } from '../components/Together';
import { endRoom, leaveRoom, together } from '../lib/together';
import { correction, following, hosting, keepNudging, startedOnce } from '../lib/watch-together';
import { Spotlight } from '@enact/spotlight';
import { useCallback, useEffect, useRef, useState } from 'react';
import platform from '@platform';
import { preroll, type PrerollClip, api, apiOrNull, apiText, ApiError, enc, type Extra, type Item, type Playback, type Prefs, type SubtitleTrack, type Trickplay } from '../api';
import { Artwork, useArtwork } from '../components/Artwork';
import { cardFor } from '../components/Cards';
import { Icon } from '../components/Icon';
import { Popover, PopoverItem } from '../components/Menu';
import { Scroller } from '../components/Scroller';
import { Button, Container, focusElement, Focusable, Trap } from '../components/spot';
import { formatTime, t } from '../i18n';
import { toast } from '../lib/toast';
import { useBack } from '../lib/back';
import { audioCodecName, audioTrackName, channelsName, episodeCode, kbpsName, languageName, sameLanguage, videoCodecName } from '../lib/format';
import { useNav } from '../lib/nav';
import { clearChange, nextInQueue, prefs as loadPrefs, queue, queues, savePrefs } from '../lib/store';
import { activeCues, chooseSubtitle as pickSubtitle, parseVTT, playableSubtitles, rememberedSubtitleLanguage, subtitleLook, type Cue } from '../lib/subtitles';
import { adjustable, cueTime, MAX_MS, offsetFor, shifted, STEP_MS, timingKey, timingSeconds, timingWay } from '../lib/subtitle-timing';
import type { NativePlayer, PlayerCaps } from '../platform/types';

// Full-screen playback with the TV's own player, as the Android app's player: Arc decides direct
// play, repackaging or conversion from the TV's caps (falling back direct -> remux -> convert if
// the TV can't play what it said it could); the stream URL goes through POST /cast because the
// TV's player can't send the sign-in header. Progress is saved every 10 seconds and on pause and
// close, a converting session is kept alive and ended on close. The controls match the web
// player's: title and Close at the top; the timeline (with thumbnails while scrubbing); play,
// next, back and forward 10 seconds; then audio, subtitles, version, quality, chapters, speed and
// playback info. Skip Intro / Credits and the Up Next countdown follow Arc's markers. Text
// subtitles are drawn by the app; a picture track (PGS, VobSub) is burned into the video by Arc,
// which restarts the stream converted, as the web player does.
//
// In a Watch Together room (`together`), the room decides where and whether it plays: Play,
// Pause and seeks go to the room as commands, and this player follows the room (keeping within
// half a second of it) rather than acting on its own keys. The lobby shows until the room first
// plays; Back opens the room's panel rather than closing the player, which keeps the room until
// Leave. Audio, subtitles, version and quality stay this TV's own.

type Attempt = 'direct' | 'remux' | 'convert';
type Menu = 'audio' | 'subtitles' | 'timing' | 'version' | 'quality' | 'chapters' | 'speed' | 'info' | null;

function capsFor(caps: PlayerCaps, attempt: Attempt): PlayerCaps {
  if (attempt === 'remux') return { ...caps, containers: [] };
  if (attempt === 'convert') return { ...caps, containers: [], video: [] };
  return caps;
}

/** Quality limits the player offers (kbit/s), as the web player's. */
const qualities = [20000, 12000, 8000, 4000, 3000, 2000, 1500, 720];
const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
const COUNTDOWN = 10;

export function qualityName(kbps: number): string {
  const height = kbps >= 8000 ? 1080 : kbps >= 2000 ? 720 : kbps >= 1500 ? 480 : 360;
  return `${kbpsName(kbps)} ${height}p`;
}

/** The skip offered now: an intro or recap while it plays, or the credits. */
function skippable(p: Playback | null, ms: number) {
  return p?.markers?.find((m) => ms >= m.start_ms && ms < m.end_ms - 1500);
}

function subtitleName(s: SubtitleTrack, i: number) {
  return languageName(s.language) || s.title || t('player.track', { n: i + 1 });
}
function subtitleDetail(s: SubtitleTrack) {
  const title = s.title && !sameLanguage(s.title, s.language) && !/^(forced|sdh)$/i.test(s.title) ? s.title : '';
  return [s.forced ? t('player.forced') : '', s.hearing_impaired ? 'SDH' : '', s.image ? t('player.burnedIn') : '', title].filter(Boolean).join(' · ');
}

/** One timeline thumbnail: the sheet shown at its scale, moved so only this tile shows. */
function Thumb({ tp, ms, left }: { tp: Trickplay; ms: number; left: number }) {
  const { info, sheets } = tp;
  const index = Math.max(0, Math.min(info.count - 1, Math.floor(ms / info.interval_ms)));
  const per = info.columns * info.rows;
  const sheet = sheets[Math.floor(index / per)];
  const url = useArtwork(sheet);
  if (!sheet || !info.width) return null;
  const w = 480;
  const scale = w / info.width;
  const pos = index % per;
  return (
    <div className="trick-thumb" style={{
      left: Math.max(0, Math.min(left - w / 2, 1728 - w)),
      width: w,
      height: Math.round(info.height * scale),
      backgroundImage: url ? `url(${url})` : undefined,
      backgroundSize: `${info.columns * info.width * scale}px ${info.rows * info.height * scale}px`,
      backgroundPosition: `${-(pos % info.columns) * info.width * scale}px ${-Math.floor(pos / info.columns) * info.height * scale}px`,
    }} />
  );
}

function methodLabel(p: Playback): [string, string] {
  const reasons = (p.reasons ?? []).join(', ');
  if (p.method === 'direct') return [t('method.directTitle'), t('method.direct')];
  if (p.method === 'remux') return [t('method.remuxTitle'), t('method.remux', { reasons })];
  let body = p.encoder ? t('method.convertingWith', { reasons, encoder: p.encoder }) : t('method.converting', { reasons });
  if (p.tone_mapped) body += ' ' + t('method.toneMapped');
  return [t('method.convertingTitle'), body];
}

// Pre-roll: keep the film player unmounted until the clips finish, so they never report
// film progress, start a conversion, or advance its queue. Replacements skip this gate.
type PlayerProps = { item: Item; startMs: number; entryId?: string; carryOn?: boolean; fileId?: number; preroll?: boolean; together?: boolean };
export function Player(props: PlayerProps) {
  const nav = useNav();
  const enabled = props.preroll !== false && props.startMs <= 0 && props.item.kind === 'movie' && !props.together;
  const [clips, setClips] = useState<PrerollClip[] | null>(enabled ? null : []);
  const [index, setIndex] = useState(0);
  useBack(() => { nav.back(); }, clips === null || index < clips.length);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const ctrl = new AbortController();
    // The deadline is independent of fetch cancellation (some older TVs finish it late).
    const timer = window.setTimeout(() => {
      if (!live) return;
      live = false; ctrl.abort(); setClips([]);
      console.warn('Arc: pre-roll list timed out; playing the film');
    }, 3000);
    preroll(props.item.id, ctrl.signal).then((list) => {
      if (!live) return;
      setClips(Array.isArray(list) ? list.filter((c) => c && typeof c.url === 'string' && c.url) : []);
    }).catch(() => {
      if (live) { setClips([]); console.warn('Arc: pre-roll list failed; playing the film'); }
    }).finally(() => window.clearTimeout(timer));
    return () => { live = false; window.clearTimeout(timer); ctrl.abort(); };
  }, [enabled, props.item.id]);
  const nextClip = useCallback(() => setIndex((n) => n + 1), []);
  if (clips === null) return <div className="screen player"><div className="player-spinner"><div className="spinner" /></div></div>;
  if (index < clips.length) return <Preroll key={index} clip={clips[index]} onDone={nextClip} />;
  return <FilmPlayer {...props} />;
}

function Preroll({ clip, onDone }: { clip: PrerollClip; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const finish = useRef<() => void>(() => {});
  useEffect(() => {
    let finished = false;
    const native = platform.createPlayer(host.current!);
    const done = () => { if (!finished) { finished = true; onDone(); } };
    finish.current = done;
    native.on((event) => {
      if (event === 'error') { console.warn('Arc: pre-roll failed; moving on'); done(); }
      if (event === 'ended') done();
    });
    void api<{ url: string }>('/cast', { method: 'POST', body: { url: clip.url } }).then(async ({ url }) => {
      if (finished) return;
      await native.load(url, 0);
      if (!finished) native.play();
    }).catch(() => {
      if (!finished) { console.warn('Arc: pre-roll failed; moving on'); done(); }
    });
    Spotlight.resume();
    const focus = window.setTimeout(() => Spotlight.focus('preroll-skip'), 0);
    return () => { finished = true; window.clearTimeout(focus); native.destroy(); };
  }, [clip, onDone]);
  return <div className="screen player">
    <div ref={host} className="player-host" />
    <Trap className="preroll-skip"><Button spotlightId="preroll-skip" data-default className="primary" onClick={() => finish.current()}>{t('player.skipPreroll')}</Button></Trap>
  </div>;
}

function FilmPlayer({ item: start, startMs, entryId, carryOn, fileId, together: forRoom }: PlayerProps) {
  const nav = useNav();
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<NativePlayer | null>(null);
  const planRef = useRef<Playback | null>(null);
  const attempt = useRef<Attempt>('direct');
  const retried = useRef(false);
  const caps = useRef<PlayerCaps | null>(null);
  const prefsRef = useRef<Prefs>({});
  const maxKbps = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const ended = useRef(false);
  /** The picture subtitle track being burned into the video; restarts (seeks, audio, quality) keep it. */
  const burn = useRef<string | undefined>(undefined);
  const itemId = start.id;

  const [item, setItem] = useState<Item>(start);
  const [plan, setPlan] = useState<Playback | null>(null);
  const [pos, setPos] = useState(startMs);
  const [buffered, setBuffered] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState('');
  const [stopped, setStopped] = useState<string | null>(null);
  const [atEnd, setAtEnd] = useState(false);
  const [next, setNext] = useState<{ item: Item; entryId?: string } | null>(null);
  const [subtitle, setSubtitle] = useState<SubtitleTrack | null>(null);
  // Subtitle timing by file and track, for this playback only (never saved): another track or file
  // starts at 0.0s, and going back to one finds its timing as it was.
  const [subtitleOffsets, setSubtitleOffsets] = useState<Record<string, number>>({});
  const [cues, setCues] = useState<Cue[]>([]);
  const [quality, setQuality] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [trick, setTrick] = useState<Trickplay | null>(null);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState<Menu>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [upNextIn, setUpNextIn] = useState<number | null>(null);
  const [creditsOffered, setCreditsOffered] = useState(false);
  const [style, setStyle] = useState<Prefs['subtitle_style']>({});
  const lastInput = useRef(Date.now());
  const [inputTick, setInputTick] = useState(0);

  // Watch Together: the room this player follows, while this TV is in one.
  const session = together.session.use();
  const roomState = together.room.use();
  const endedHow = together.ended.use();
  const connected = together.connected.use();
  const s = forRoom && session ? session : null;
  const room = s ? roomState : null;
  const sessionRef = useRef(s);
  sessionRef.current = s;
  const loadingRef = useRef(true);
  loadingRef.current = loading;
  const failedRef = useRef(false);
  failedRef.current = !!failed || stopped !== null;
  const scrubRef = useRef<number | null>(null);
  scrubRef.current = scrub;
  const [lobbyDone, setLobbyDone] = useState(false);
  if (room && !lobbyDone && (s ? s.started : startedOnce(room))) setLobbyDone(true);
  const relation = room ? following(room, itemId) : null;
  const inLobby = !!room && relation === 'follow' && !lobbyDone;
  const hostingRoom = !!room && hosting(room);
  const [roomPanel, setRoomPanel] = useState<'panel' | 'confirm' | 'invite' | null>(null);
  const [endedPane, setEndedPane] = useState(false);
  const [lostNote, setLostNote] = useState('');
  const notice = useRoomNotice(room);
  const wasInRoom = useRef(false);
  if (s) wasInRoom.current = true;
  /** This TV ended the room itself (no "the host ended it" pane). */
  const iEnded = useRef(false);
  const nudging = useRef(false);
  /** After this TV's own seek, drift isn't corrected until the room takes it (new generation) or 3 s pass. */
  const seekGuard = useRef<{ gen: number; until: number } | null>(null);

  /** Where in the file the player is: a converted stream starts at its offset. */
  const position = useCallback(() => {
    const p = planRef.current;
    const at = player.current?.position() ?? 0;
    return p ? (p.hls ? p.offset_ms + at : at) : startMs;
  }, [startMs]);

  const report = useCallback((state: 'playing' | 'paused' | 'stopped', at?: number) => {
    const p = planRef.current;
    if (!p || !p.duration_ms) return;
    const position_ms = Math.max(0, Math.min(Math.round(at ?? position()), p.duration_ms));
    api(`/items/${enc(itemId)}/progress`, { method: 'PUT', body: { position_ms, duration_ms: p.duration_ms, state } }).catch((e) => {
      // Arc answers 403 (needs "stopped") when an admin ends this playback from the Dashboard.
      if (e instanceof ApiError && (e.needs === 'stopped' || e.status === 403)) {
        player.current?.pause();
        setStopped(e.message);
      }
    });
  }, [itemId, position]);

  const stopSession = (p: Playback | null) => {
    if (p?.session_id) void api(`/transcode/${p.session_id}`, { method: 'DELETE' }).catch(() => {});
  };

  /** Starts (or restarts) playback at a point in the file, with another audio track or version if given. */
  const load = useCallback(async (fromMs: number, opts: { audio?: number; fileId?: number } = {}) => {
    const gen = ++generation.current;
    setLoading(true);
    setFailed('');
    const old = planRef.current;
    player.current?.destroy();
    player.current = null;
    stopSession(old);
    try {
      caps.current ??= await platform.caps();
      const p = await api<Playback>(`/items/${enc(itemId)}/playback`, {
        method: 'POST',
        body: {
          caps: capsFor(caps.current, attempt.current),
          start_ms: Math.round(fromMs),
          file_id: opts.fileId ?? old?.file_id,
          // A new version starts with its own default audio.
          audio_stream: opts.audio ?? (opts.fileId === undefined && old && old.audio_stream >= 0 ? old.audio_stream : undefined),
          max_kbps: maxKbps.current,
          burn_subtitle: burn.current,
        },
      });
      if (gen !== generation.current) return;
      planRef.current = p;
      setPlan(p);
      if (!old) {
        const pr = prefsRef.current;
        const audioLang = p.audio_tracks?.find((a) => a.index === p.audio_stream)?.language;
        const first = pickSubtitle(p.subtitle_tracks ?? [], pr.subtitle_language, audioLang, pr.subtitle_mode);
        setSubtitle(first);
        // A picture track can only be shown burned in: ask again for a stream with it.
        if (first?.image) {
          burn.current = first.id;
          void load(fromMs, opts);
          return;
        }
      } else {
        setSubtitle((s) => (s && (p.subtitle_tracks ?? []).some((x) => x.id === s.id) ? s : null));
      }
      const { url } = await api<{ url: string }>('/cast', { method: 'POST', body: { url: p.url } });
      if (gen !== generation.current) return;
      const native = platform.createPlayer(host.current!);
      player.current = native;
      native.on((ev, detail) => {
        if (player.current !== native) return;
        // The room hears at once when this player starts or stops buffering. Player events never
        // become room commands (only the viewer's keys do), so applying the room can't echo back.
        if (ev === 'playing' || ev === 'waiting') window.setTimeout(() => sessionRef.current?.reportNow(), 0);
        if (ev === 'playing') { setPlaying(true); setLoading(false); }
        if (ev === 'paused') { setPlaying(false); report('paused'); }
        if (ev === 'waiting') setLoading(true);
        if (ev === 'ended') {
          ended.current = true;
          report('stopped', planRef.current?.duration_ms);
          setPlaying(false);
          setAtEnd(true);
        }
        if (ev === 'error') onStreamError(detail ?? 'error');
      });
      await native.load(url, p.hls ? Math.max(0, fromMs - p.offset_ms) : fromMs);
      if (gen !== generation.current) return;
      native.setSpeed?.(speedRef.current);
      // In a room the room says when to play (the follow loop): a loaded, paused player is ready.
      if (sessionRef.current) {
        setLoading(false);
        sessionRef.current.reportNow();
      } else native.play();
    } catch (e) {
      if (gen !== generation.current) return;
      if (e instanceof ApiError && e.status === 403) {
        setStopped(e.message);
        setLoading(false);
        return;
      }
      // Arc couldn't burn the picture subtitles in (e.g. no converter here): play without them.
      if (e instanceof ApiError && burn.current) {
        console.warn(`Arc: burning in subtitle track ${burn.current} was refused (${e.status}); playing without it`);
        burn.current = undefined;
        setSubtitle(null);
        toast(t('player.burnFailed'));
        void load(fromMs, opts);
        return;
      }
      onStreamError((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, report]);

  const speedRef = useRef(1);
  speedRef.current = speed;

  /** The file (or its repackaging) didn't play here: ask Arc to do more, as the web player does. */
  const onStreamError = (why: string) => {
    // Once, as the Android app does: a file played as it is gets repackaged, a repackaged one
    // converted. A conversion that fails is shown (asking again with no video formats is refused).
    const p = planRef.current;
    if (p && !retried.current && p.method !== 'transcode') {
      retried.current = true;
      attempt.current = p.method === 'direct' ? 'remux' : 'convert';
      console.info(`Arc: ${p.method} playback failed here (${why}); asking Arc to convert more`);
      void load(position());
      return;
    }
    console.warn(`Arc: playback failed: ${why}`);
    setLoading(false);
    setFailed(why);
  };

  // Start: preferences, the queue and what comes next, then the stream.
  useEffect(() => {
    clearChange(itemId);
    Spotlight.pause();
    let live = true;
    const ready = loadPrefs().then((p) => {
      prefsRef.current = p;
      setStyle(p.subtitle_style ?? {});
      return p;
    });
    void ready.then(() => { if (live) void load(startMs, { fileId }); });
    void (async () => {
      const full = await api<Item>(`/items/${enc(itemId)}`).catch(() => null);
      if (!live) return;
      // GET /items/{id} leaves out an episode's place in its show and the show's name; keep the
      // ones the card or episode list already gave.
      if (full) setItem((was) => ({ ...full, series_title: full.series_title ?? was.series_title, season_number: full.season_number ?? was.season_number, episode_number: full.episode_number ?? was.episode_number, images: { ...was.images, ...full.images } }));
      const p = await ready;
      const autoPlay = p.auto_play !== false;
      // In a room the room is the queue: only the host's Up Next (the next episode) moves it on.
      if (forRoom) {
        if ((full ?? start).kind === 'episode' && autoPlay) {
          const n = await apiOrNull<Item>(`/items/${enc(itemId)}/next`).catch(() => null);
          if (live && n && n.id) setNext({ item: n });
        }
        return;
      }
      // The play queue follows what's playing: this title's entry, or a new queue of it.
      let entry: string | null | undefined = entryId;
      if (entryId) await queues.moveTo(entryId);
      else if (carryOn) {
        const q = await queues.add([itemId], false);
        const e = q?.entries.slice().reverse().find((x) => x.item_id === itemId);
        if (e) { await queues.moveTo(e.id); entry = e.id; }
      } else {
        entry = (await queues.start([itemId]))?.current_entry_id;
      }
      if (!live) return;
      const q = queue.get();
      const queued = entry && q?.current_entry_id === entry ? nextInQueue(q) : null;
      if (queued?.item) {
        setNext({ item: queued.item, entryId: queued.id });
        return;
      }
      if ((full ?? start).kind === 'episode' && autoPlay) {
        const n = await apiOrNull<Item>(`/items/${enc(itemId)}/next`).catch(() => null);
        if (live && n && n.id) setNext({ item: n });
      }
    })();
    const progress = window.setInterval(() => {
      if (player.current && !player.current.paused()) report('playing');
    }, 10000);
    const ping = window.setInterval(() => {
      const sid = planRef.current?.session_id;
      if (sid) void api(`/transcode/${sid}/ping`, { method: 'POST' }).catch(() => {});
    }, 30000);
    const tick = window.setInterval(() => {
      const p = planRef.current;
      if (!p || !player.current) return;
      setPos(position());
      const b = player.current.buffered?.() ?? 0;
      setBuffered(p.hls ? p.offset_ms + b : b);
    }, 500);
    return () => {
      live = false;
      window.clearInterval(progress);
      window.clearInterval(ping);
      window.clearInterval(tick);
      if (planRef.current && !ended.current) report('stopped');
      player.current?.destroy();
      player.current = null;
      stopSession(planRef.current);
      Spotlight.resume();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // A new title starts with no subtitle timing.
  useEffect(() => { setSubtitleOffsets({}); }, [itemId]);

  // The chosen subtitle's cues, in file time.
  useEffect(() => {
    setCues([]);
    if (!subtitle || subtitle.image || !plan) return;
    let live = true;
    apiText(`/items/${enc(itemId)}/subtitles/${enc(subtitle.id)}/vtt?file=${plan.file_id}`).then((v) => { if (live) setCues(parseVTT(v)); }, () => {});
    return () => { live = false; };
  }, [subtitle, plan?.file_id, itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The file's timeline thumbnails; none (yet) is normal.
  useEffect(() => {
    setTrick(null);
    if (!plan) return;
    let live = true;
    apiOrNull<Trickplay>(`/items/${enc(itemId)}/trickplay?file=${plan.file_id}`).then((tp) => { if (live && tp?.info?.count) setTrick(tp); }, () => {});
    return () => { live = false; };
  }, [plan?.file_id, itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekTo = (ms: number) => {
    const p = planRef.current;
    if (!p) return;
    const target = Math.max(0, Math.min(ms, (p.duration_ms || ms + 1000) - 1000));
    setPos(target);
    if (!p.hls) {
      player.current?.seek(target);
      return;
    }
    // A converted stream only has what's been made so far: anything else starts a new one there.
    const rel = target - p.offset_ms;
    const available = player.current?.duration() ?? 0;
    if (rel >= 0 && available > 0 && rel <= available - 2000) player.current?.seek(rel);
    else void load(target);
  };
  /** A room command from the viewer's keys; a refusal that isn't the room ending says so. */
  const roomCommand = (fn: (room: NonNullable<typeof s>) => Promise<unknown>) => {
    const cur = sessionRef.current;
    if (!cur) return;
    fn(cur).catch(() => { if (cur.active) toast(t('together.commandFailed')); });
  };
  /** A seek the viewer chose: in a room, here at once and the room (and so everyone) there. */
  const commitSeek = (ms: number) => {
    const cur = sessionRef.current;
    if (!cur) { seekTo(ms); return; }
    const target = Math.max(0, Math.min(ms, (planRef.current?.duration_ms || ms + 1000) - 1000));
    seekGuard.current = { gen: cur.room.generation, until: Date.now() + 3000 };
    seekTo(target);
    roomCommand((x) => x.seek(target));
  };
  // In a room, Back and Forward move the timeline's marker; one seek goes to the room once it
  // rests (so a held Forward sends one command), as scrubbing does.
  const seekBy = (d: number) => {
    if (!sessionRef.current) { seekTo(position() + d); return; }
    const dur = planRef.current?.duration_ms ?? 0;
    setScrub((was) => Math.max(0, Math.min(dur || Infinity, (was ?? position()) + d)));
    setControls(true);
  };
  const togglePlay = () => {
    if (sessionRef.current) {
      roomCommand((x) => (x.room.state === 'paused' ? x.play() : x.pause()));
      return;
    }
    const p = player.current;
    if (!p) return;
    if (p.paused()) p.play();
    else p.pause();
  };

  // In a room, Up Next is the host's, and moves everyone on (App opens the new title's player);
  // the others never move on by themselves.
  const shownNext = s ? (hostingRoom ? next : null) : next;
  const playNext = () => {
    if (!next) return;
    if (sessionRef.current) {
      setUpNextIn(null);
      const n = next.item;
      roomCommand((x) => x.changeItem(n.id, n.user_data?.played ? 0 : n.user_data?.position_ms ?? 0));
      return;
    }
    nav.play(next.item, next.item.user_data?.played ? 0 : next.item.user_data?.position_ms ?? 0, { replace: true, entryId: next.entryId, carryOn: !next.entryId });
  };

  // Up Next: a countdown when the credits start (once) and again at the end; at the end with
  // nothing next the queue is done and the player closes.
  const marker = skippable(plan, pos);
  const inCredits = marker?.kind === 'credits';
  // Skip Intros Automatically (the profile's auto_skip): each intro or recap is skipped once, so
  // seeking back into one plays it.
  const autoSkipped = useRef<string>('');
  useEffect(() => {
    if (!marker || marker.kind === 'credits' || !prefsRef.current.auto_skip) return;
    const key = `${marker.kind}:${marker.start_ms}`;
    // In a room each TV would skip on its own; the viewer skips with the button instead.
    if (autoSkipped.current.indexOf(key) >= 0 || sessionRef.current) return;
    autoSkipped.current += `|${key}`;
    seekTo(marker.end_ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marker && marker.start_ms]);
  useEffect(() => {
    if (inCredits && shownNext && !creditsOffered) {
      setCreditsOffered(true);
      setUpNextIn(COUNTDOWN);
    }
  }, [inCredits, shownNext, creditsOffered]);
  useEffect(() => {
    if (!atEnd) return;
    if (shownNext) setUpNextIn((n) => n ?? COUNTDOWN);
    else if (sessionRef.current) return; // the room decides what's next
    else {
      void queues.end();
      nav.back();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atEnd]);
  useEffect(() => {
    if (upNextIn === null) return;
    if (upNextIn <= 0) { playNext(); return; }
    const timer = window.setTimeout(() => setUpNextIn((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upNextIn]);
  const cancelUpNext = () => {
    setUpNextIn(null);
    if (atEnd) nav.back();
  };

  // The controls hide 5 seconds after the last key while playing with no menu open.
  useEffect(() => {
    if (!playing || menu || !controls || scrub !== null) return;
    const timer = window.setTimeout(() => setControls(false), 5000);
    return () => window.clearTimeout(timer);
  }, [playing, menu, controls, inputTick, scrub]);

  // Scrubbing on the timeline moves a marker; the seek happens when it rests.
  useEffect(() => {
    if (scrub === null) return;
    const timer = window.setTimeout(() => { commitSeek(scrub); setScrub(null); }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrub]);

  // Back: Up Next, then a menu, then the controls, then the player itself (App pops it). In a
  // room, Back opens the room's panel instead: the player (and the room) stay until Leave.
  useBack(() => {
    // The lobby and the room's panes take Back themselves (the lobby can mount with the player,
    // so its handler may be older than this one).
    if (inLobby || roomPanel !== null || endedPane) return false;
    if (upNextIn !== null) cancelUpNext();
    else if (menu) setMenu(null);
    else if (controls && !stopped && !failed) setControls(false);
    else if (sessionRef.current) setRoomPanel('panel');
    else return false;
  });

  // --- Watch Together ---

  /** Leaves the room and closes the player (the lobby's Leave), or plays on alone. */
  const leave = (close: boolean) => {
    setRoomPanel(null);
    void leaveRoom();
    if (close) nav.back();
    else toast(t('together.youLeft'));
  };
  const askLeave = () => {
    if (hostingRoom) setRoomPanel('confirm');
    else leave(inLobby);
  };
  const endForEveryone = () => {
    setRoomPanel(null);
    iEnded.current = true;
    void endRoom().then((ok) => {
      if (ok) toast(t('together.youEnded'));
      else { iEnded.current = false; toast(t('together.endFailed')); }
    });
  };
  // The room ended or this TV is out of it: play on alone (at the viewer's own speed again).
  useEffect(() => {
    if (!forRoom || !wasInRoom.current || !endedHow) return;
    nudging.current = false;
    player.current?.setSpeed?.(speedRef.current);
    setRoomPanel(null);
    if (endedHow === 'ended' && !iEnded.current) setEndedPane(true);
    if (endedHow === 'gone') {
      setLostNote(t('together.lost'));
      const timer = window.setTimeout(() => setLostNote(''), 6000);
      return () => window.clearTimeout(timer);
    }
  }, [endedHow, forRoom]);

  // Follow the room (docs/WATCH-TOGETHER-API.md, "Client sync algorithm"): play and pause with
  // it, and stay within half a second of where it should be: a slightly slower or faster speed for
  // small drift where the TV's player has one (webOS), a jump beyond three seconds (and on Tizen,
  // whose AVPlay has no smooth speed change). Heartbeats report where this player really is.
  const seekLocal = useRef(seekTo);
  seekLocal.current = seekTo;
  useEffect(() => {
    if (!s) return;
    s.setReporter(() => {
      const native = player.current;
      if (failedRef.current) return { positionMS: position(), state: 'paused', ready: false };
      const busy = loadingRef.current || !native || !planRef.current;
      return { positionMS: position(), state: busy ? 'waiting' : native!.paused() ? 'paused' : 'playing', ready: !busy };
    });
    const follow = () => {
      const native = player.current;
      const p = planRef.current;
      if (!native || !p || loadingRef.current || failedRef.current || scrubRef.current !== null) return;
      const r = s.room;
      if (following(r, itemId) !== 'follow') {
        if (!native.paused()) native.pause();
        return;
      }
      const g = seekGuard.current;
      if (g && (r.generation !== g.gen || Date.now() > g.until)) seekGuard.current = null;
      const expected = s.expected();
      const local = position();
      if (r.state === 'playing') {
        // Finished here and the room's at the end too: don't start the file again.
        if (ended.current && expected >= (p.duration_ms || 0) - 2000) return;
        if (native.paused()) native.play();
        if (seekGuard.current) return;
        const c = correction(local, expected, !!native.setSpeed);
        if (c.kind === 'seek') {
          if (nudging.current) { native.setSpeed?.(1); nudging.current = false; }
          seekLocal.current(c.to);
        } else if (c.kind === 'rate') {
          native.setSpeed?.(c.rate);
          nudging.current = true;
        } else if (nudging.current && !keepNudging(local, expected, true)) {
          native.setSpeed?.(1);
          nudging.current = false;
        }
      } else {
        if (nudging.current) { native.setSpeed?.(1); nudging.current = false; }
        if (!native.paused()) native.pause();
        if (!seekGuard.current && Math.abs(local - expected) > 1000) seekLocal.current(expected);
      }
    };
    const timer = window.setInterval(follow, 500);
    return () => {
      window.clearInterval(timer);
      s.setReporter(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  const overlayOpen = inLobby || roomPanel !== null || endedPane;

  // Showing the controls puts the focus on Play. Watch Together's panels take the focus themselves.
  useEffect(() => {
    if (!controls && !overlayOpen) {
      Spotlight.pause();
      return;
    }
    Spotlight.resume();
    if (overlayOpen) return;
    const timer = window.setTimeout(() => {
      const cur = Spotlight.getCurrent() as HTMLElement | null;
      if (!cur || !cur.closest('.player')) Spotlight.focus('player-play');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [controls, overlayOpen]);

  // Keys the controls don't take: media keys always; with the controls hidden, OK pauses (or
  // skips), Left and Right go back and forward 10 seconds, Up and Down show the controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      lastInput.current = Date.now();
      setInputTick((n) => n + 1);
      const key = platform.remoteKey(e.keyCode);
      const take = () => { e.preventDefault(); e.stopPropagation(); };
      if (overlayOpen) return; // the lobby or a room panel has the keys
      const roomState = sessionRef.current?.room.state;
      if (key === 'playPause') { take(); togglePlay(); setControls(true); return; }
      if (key === 'play') { take(); if (!roomState) player.current?.play(); else if (roomState === 'paused') togglePlay(); return; }
      if (key === 'pause') { take(); if (!roomState) player.current?.pause(); else if (roomState !== 'paused') togglePlay(); setControls(true); return; }
      if (key === 'forward') { take(); seekBy(10000); setControls(true); return; }
      if (key === 'rewind') { take(); seekBy(-10000); setControls(true); return; }
      if (key === 'stop') { take(); if (sessionRef.current) setRoomPanel('panel'); else nav.back(); return; }
      // In a room, a seek waits a moment for more presses (one command for a held Right): while
      // it waits, Left and Right add to it even though the controls are showing its position.
      if (scrub !== null && sessionRef.current && (e.keyCode === 37 || e.keyCode === 39)) { take(); seekBy(e.keyCode === 37 ? -10000 : 10000); return; }
      if (controls || upNextIn !== null || stopped || failed || key === 'back') return;
      if (e.keyCode === 13) {
        take();
        if (marker) commitSeek(marker.end_ms);
        else { togglePlay(); setControls(true); }
      } else if (e.keyCode === 37) { take(); seekBy(-10000); }
      else if (e.keyCode === 39) { take(); seekBy(10000); }
      else if (e.keyCode === 38 || e.keyCode === 40) { take(); setControls(true); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const duration = plan?.duration_ms ?? 0;
  const shown = scrub ?? pos;
  const title = item.title;
  const subtitleLine = item.kind === 'episode' ? [item.series_title, episodeCode(item)].filter(Boolean).join(' · ') : item.year ? String(item.year) : '';
  const look = subtitleLook(style);
  const subtitleOffset = offsetFor(subtitleOffsets, plan?.file_id, subtitle);
  // A later timing shows each line at its time in the file plus the offset.
  const showing = subtitle ? activeCues(cues, cueTime(pos, subtitleOffset)) : [];
  const chapters = plan?.chapters ?? [];
  const chapterAt = chapters.reduce((at, c, i) => (c.start_ms <= pos ? i : at), -1);
  const subtitleTracks = playableSubtitles(plan?.subtitle_tracks);

  const chooseAudio = (index: number) => {
    setMenu(null);
    const p = planRef.current;
    if (!p || index === p.audio_stream) return;
    const lang = p.audio_tracks?.find((a) => a.index === index)?.language;
    if (lang && lang !== prefsRef.current.audio_language) {
      prefsRef.current = { ...prefsRef.current, audio_language: lang };
      savePrefs({ audio_language: lang });
    }
    void load(position(), { audio: index });
  };
  const chooseSubtitle = (s: SubtitleTrack | null) => {
    setMenu(null);
    const lang = rememberedSubtitleLanguage(s, prefsRef.current.subtitle_mode ?? '');
    if (lang !== null && lang !== (prefsRef.current.subtitle_language ?? '')) {
      prefsRef.current = { ...prefsRef.current, subtitle_language: lang };
      savePrefs({ subtitle_language: lang });
    }
    setSubtitle(s);
    // A picture track is burned into the video by Arc, so turning one on, off or for another
    // restarts the stream where it is.
    const wantBurn = s?.image ? s.id : undefined;
    if (wantBurn !== burn.current) {
      burn.current = wantBurn;
      void load(position());
    }
  };
  /** Show 0.5s Earlier (-STEP_MS), Later (STEP_MS) or Reset (null): at once, with no reload. */
  const shiftSubtitles = (delta: number | null) => {
    const p = planRef.current;
    if (!p || !subtitle || !adjustable(subtitle)) return;
    const next = shifted(subtitleOffset, delta);
    if (next === subtitleOffset) return;
    setSubtitleOffsets((o) => ({ ...o, [timingKey(p.file_id, subtitle.id)]: next }));
    console.debug(`Arc: subtitle timing now ${next} ms`);
  };
  const chooseQuality = (q: number) => {
    setMenu(null);
    if (q === quality) return;
    setQuality(q);
    const limit = q > 0 ? q : undefined;
    if (limit === maxKbps.current) return;
    maxKbps.current = limit;
    void load(position());
  };
  const chooseVersion = (fileId: number) => {
    setMenu(null);
    if (fileId === planRef.current?.file_id) return;
    // Another file has its own tracks: a burned-in one doesn't carry over.
    if (burn.current) {
      burn.current = undefined;
      setSubtitle(null);
    }
    void load(position(), { fileId });
  };
  const chooseSpeed = (s: number) => {
    setMenu(null);
    setSpeed(s);
    player.current?.setSpeed?.(s);
  };

  const control = (icon: string, text: string, onClick: () => void, id?: string) => (
    <Focusable key={id ?? text} className="ctl" spotlightId={id} onClick={onClick} onFocus={() => setLabel(id === 'player-play' ? PLAY_LABEL : text)} onBlur={() => setLabel(null)}>
      <Icon name={icon} size={40} />
    </Focusable>
  );

  const pct = (ms: number) => (duration ? `${Math.max(0, Math.min(100, (ms / duration) * 100))}%` : '0%');

  return (
    <div className="screen player" onMouseMove={() => setControls(true)}>
      <div ref={host} className="player-host" />
      {showing.length > 0 && (
        <div className="subtitles" style={controls && look.box.bottom !== undefined ? { bottom: 300 } : look.box}>
          {showing.map((c, i) => (
            <div key={i}><span className="cue" style={look.text} dangerouslySetInnerHTML={{ __html: c.text.replace(/</g, '&lt;').replace(/&lt;(\/?i)>/g, '<$1>').replace(/\n/g, '<br>') }} /></div>
          ))}
        </div>
      )}
      {loading && !failed && !stopped && <div className="player-spinner"><div className="spinner" /></div>}
      {stopped !== null && (
        <Trap className="player-pane" spotlightId="player-stopped">
          <h2>{t('player.stoppedTitle')}</h2>
          <p className="muted">{stopped}</p>
          <Button data-default onClick={() => nav.back()}>{t('common.close')}</Button>
        </Trap>
      )}
      {failed && stopped === null && (
        <Trap className="player-pane">
          <h2>{t('player.failed')}</h2>
          <p className="muted">{t('player.failedDetail', { detail: failed })}</p>
          <Container className="inline">
            <Button data-default onClick={() => { attempt.current = 'direct'; retried.current = false; void load(position()); }}>{t('common.retry')}</Button>
            {/* In a room a failure here (e.g. Arc's converter is busy) is this TV's alone: the room carries on. */}
            {s ? <Button onClick={() => leave(true)}>{t('together.leaveRoom')}</Button> : <Button onClick={() => nav.back()}>{t('common.close')}</Button>}
          </Container>
        </Trap>
      )}
      {!controls && marker && !stopped && !failed && upNextIn === null && !overlayOpen && (
        <div className="skip-button">{t(marker.kind === 'recap' ? 'player.skipRecap' : marker.kind === 'credits' ? 'player.skipCredits' : 'player.skipIntro')}</div>
      )}
      {room && !inLobby && !endedPane && (
        // Watch Together's notes near the top: this title isn't available here, who the room is
        // waiting for, a lost connection, or what someone else just did.
        relation === 'unavailable' ? <RoomPill text={t('together.unavailable')} />
          : room.state === 'waiting' ? <WaitingPill room={room} serverNow={() => s!.serverNow()} />
            : !connected ? <RoomPill text={t('together.reconnecting')} />
              : notice ? <RoomPill text={notice} /> : null
      )}
      {!room && lostNote && <RoomPill text={lostNote} />}
      {controls && !stopped && !failed && !inLobby && (
        // As the Apple TV app's player: everything along the bottom over a shadow; the title on
        // the left, the buttons (in the web player's order) on the right, then a thin timeline
        // with the time played and the time left under it.
        <Container className="controls">
          <div className="controls-bottom">
            {marker && upNextIn === null && (
              <Button className="skip-inline" onClick={() => (marker.kind === 'credits' && shownNext ? playNext() : commitSeek(marker.end_ms))}>
                {t(marker.kind === 'recap' ? 'player.skipRecap' : marker.kind === 'credits' ? (shownNext ? 'player.playNext' : 'player.skipCredits') : 'player.skipIntro')}
              </Button>
            )}
            <div className="ctl-head">
              <div className="ctl-heading">
                {subtitleLine && <div className="ctl-sub">{subtitleLine}</div>}
                <div className="ctl-title">{title}</div>
              </div>
              <div className="ctl-side">
                <div className="ctl-label">{label === PLAY_LABEL ? t(playing ? 'player.pause' : 'player.play') : label}</div>
                <Container className="ctl-row">
                  {control(playing ? 'pause' : 'play', t(playing ? 'player.pause' : 'player.play'), togglePlay, 'player-play')}
                  {shownNext && control('next', t('player.next', { title: shownNext.item.title }), playNext)}
                  {control('back10', t('player.back10'), () => seekBy(-10000))}
                  {control('fwd10', t('player.forward10'), () => seekBy(10000))}
                  <span className="ctl-gap" />
                  {s && control('users', t('together.title'), () => setRoomPanel('panel'))}
                  {plan && (plan.audio_tracks ?? []).length > 1 && control('audio', t('player.audio'), () => setMenu('audio'))}
                  {plan && subtitleTracks.length > 0 && control('captions', t('player.subtitles'), () => setMenu('subtitles'), 'player-subtitles')}
                  {plan && (plan.versions ?? []).length > 1 && control('film', t('player.version'), () => setMenu('version'))}
                  {plan && control('sliders', t('player.quality'), () => setMenu('quality'))}
                  {plan && chapters.length > 1 && control('list', t('player.chapters'), () => setMenu('chapters'))}
                  {/* In a room everyone plays at the room's speed. */}
                  {!s && player.current?.setSpeed && control('gauge', t('player.speed'), () => setMenu('speed'))}
                  {plan && control('info', t('player.info'), () => setMenu('info'))}
                </Container>
              </div>
            </div>
            <Focusable
              className="timeline"
              onFocus={() => setLabel(null)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.keyCode !== 37 && e.keyCode !== 39) return;
                e.preventDefault();
                e.stopPropagation();
                const base = scrub ?? pos;
                setScrub(Math.max(0, Math.min(duration, base + (e.keyCode === 39 ? 10000 : -10000))));
              }}
            >
              <div className="tl-track" />
              <div className="tl-buffered" style={{ width: pct(buffered) }} />
              <div className="tl-played" style={{ width: pct(shown) }} />
              {chapters.slice(1).map((c) => <div key={c.start_ms} className="tl-chapter" style={{ left: pct(c.start_ms) }} />)}
              <div className="tl-knob" style={{ left: pct(shown) }} />
              {scrub !== null && trick && <Thumb tp={trick} ms={scrub} left={duration ? (scrub / duration) * 1728 : 0} />}
              {scrub !== null && <div className="tl-time" style={{ left: pct(scrub) }}>{formatTime(scrub)}</div>}
            </Focusable>
            <div className="ctl-times">
              <span>{formatTime(shown)}</span>
              <span>-{formatTime(Math.max(0, duration - shown))}</span>
            </div>
          </div>
        </Container>
      )}
      {menu && plan && (
        <PlayerMenu
          menu={menu}
          plan={plan}
          subtitle={subtitle}
          subtitleOffset={subtitleOffset}
          quality={quality}
          speed={speed}
          chapterAt={chapterAt}
          caps={caps.current}
          onClose={() => setMenu(null)}
          onTiming={() => setMenu('timing')}
          onShiftSubtitles={shiftSubtitles}
          onAudio={chooseAudio}
          onSubtitle={chooseSubtitle}
          onVersion={chooseVersion}
          onQuality={chooseQuality}
          onChapter={(ms) => { setMenu(null); commitSeek(ms); }}
          onSpeed={chooseSpeed}
        />
      )}
      {shownNext && upNextIn !== null && <UpNext next={shownNext.item} seconds={upNextIn} onPlay={playNext} onCancel={cancelUpNext} />}
      {room && (inLobby || roomPanel === 'panel') && (
        <RoomCard
          room={room}
          lobby={inLobby}
          onStart={() => roomCommand((x) => x.play())}
          onLeave={askLeave}
          onEnd={endForEveryone}
          onClose={() => setRoomPanel(null)}
          extra={hostingRoom && <Button className="room-invite" onClick={() => setRoomPanel('invite')}>{t('together.invitePeople')}</Button>}
        />
      )}
      {room && roomPanel === 'invite' && <InvitePicker onClose={() => { setRoomPanel(inLobby ? null : 'panel'); if (inLobby) refocusLobby('.room-invite'); }} />}
      {room && roomPanel === 'confirm' && <LeaveConfirm onLeave={() => leave(inLobby)} onStay={() => { setRoomPanel(inLobby ? null : 'panel'); if (inLobby) refocusLobby('.room-leave'); }} />}
      {endedPane && <EndedPane onContinue={() => setEndedPane(false)} onClose={() => { setEndedPane(false); nav.back(); }} />}
    </div>
  );
}

/** The play/pause button's label follows the state while it has the focus. */
const PLAY_LABEL = '\u0000play';

function PlayerMenu({ menu, plan, subtitle, subtitleOffset, quality, speed, chapterAt, caps, onClose, onTiming, onShiftSubtitles, onAudio, onSubtitle, onVersion, onQuality, onChapter, onSpeed }: {
  menu: Exclude<Menu, null>;
  plan: Playback;
  subtitle: SubtitleTrack | null;
  subtitleOffset: number;
  quality: number;
  speed: number;
  chapterAt: number;
  caps: PlayerCaps | null;
  onClose: () => void;
  onTiming: () => void;
  onShiftSubtitles: (delta: number | null) => void;
  onAudio: (i: number) => void;
  onSubtitle: (s: SubtitleTrack | null) => void;
  onVersion: (id: number) => void;
  onQuality: (q: number) => void;
  onChapter: (ms: number) => void;
  onSpeed: (s: number) => void;
}) {
  if (menu === 'info') {
    const [title, body] = methodLabel(plan);
    const out = plan.audio_output;
    const v = (plan.versions ?? []).find((x) => x.file_id === plan.file_id);
    const audio = (plan.audio_tracks ?? []).find((a) => a.index === plan.audio_stream);
    const rows: [string, string][] = [
      [t('player.stats.source'), [v?.height ? `${v.height}p` : '', videoCodecName(v?.video_codec), v?.hdr ?? '', plan.source_kbps ? kbpsName(plan.source_kbps) : ''].filter(Boolean).join(' · ')],
      [t('player.stats.audio'), [audio ? audioTrackName(audio) : '', out?.codec ? `→ ${audioCodecName(out.codec)} ${channelsName(out.channels)}` : ''].filter(Boolean).join(' ')],
      [t('player.stats.container'), [plan.hls ? 'HLS' : 'File', plan.encoder ?? ''].filter(Boolean).join(' · ')],
      [t('player.stats.tv'), caps ? [caps.max_height ? `${caps.max_height}p` : '', (caps.hdr_formats ?? []).join(', ') || 'SDR', caps.video.join(', ')].filter(Boolean).join(' · ') : ''],
    ];
    return (
      <Popover place="above" shade={false} title={title} body={body} onClose={onClose}>
        {rows.filter(([, v2]) => v2).map(([k, v2]) => (
          <div key={k} className="popover-stat"><div className="info-label">{k}</div><div>{v2}</div></div>
        ))}
        <PopoverItem first icon="close" label={t('common.close')} onClick={onClose} />
      </Popover>
    );
  }
  if (menu === 'timing') return <TimingMenu offset={subtitleOffset} onShift={onShiftSubtitles} onClose={onClose} />;
  let title = '';
  let body: string | undefined;
  let options: { key: string; name: string; detail?: string; selected: boolean; pick: () => void }[] = [];
  switch (menu) {
    case 'audio':
      title = t('player.audio');
      options = (plan.audio_tracks ?? []).map((a, i) => ({
        key: String(a.index), name: languageName(a.language) || t('player.track', { n: i + 1 }),
        detail: [audioCodecName(a.codec), channelsName(a.channels), a.title ?? ''].filter(Boolean).join(' · '),
        selected: a.index === plan.audio_stream, pick: () => onAudio(a.index),
      }));
      break;
    case 'subtitles':
      title = t('player.subtitles');
      options = [{ key: 'off', name: t('player.subtitlesOff'), selected: !subtitle, pick: () => onSubtitle(null) }].concat(
        playableSubtitles(plan.subtitle_tracks).map((s, i) => ({ key: s.id, name: subtitleName(s, i), detail: subtitleDetail(s), selected: subtitle?.id === s.id, pick: () => onSubtitle(s) })),
      );
      // Timing, as the web's and Android's, for the text subtitles shown now; a picture track is
      // part of the converted video, and the menu says so.
      if (adjustable(subtitle)) options.push({ key: 'timing', name: t('player.timing'), detail: t('player.timingSeconds', { seconds: timingSeconds(subtitleOffset) }), selected: false, pick: onTiming });
      else if (subtitle) body = t('player.timingPicture');
      break;
    case 'version':
      title = t('player.version');
      options = (plan.versions ?? []).map((v) => {
        const res = v.height ? (v.height >= 2000 ? '4K' : `${v.height}p`) : '';
        const rest = [v.hdr ?? '', videoCodecName(v.video_codec), v.size ? `${(v.size / 1e9).toFixed(1)} GB` : ''].filter(Boolean);
        return v.edition
          ? { key: String(v.file_id), name: v.edition, detail: [res, ...rest].filter(Boolean).join(' · '), selected: v.file_id === plan.file_id, pick: () => onVersion(v.file_id) }
          : { key: String(v.file_id), name: res || t('player.version'), detail: rest.join(' · '), selected: v.file_id === plan.file_id, pick: () => onVersion(v.file_id) };
      });
      break;
    case 'quality': {
      title = t('player.quality');
      const cap = plan.server_limit_kbps ?? 0;
      const src = plan.source_kbps ?? 0;
      const choices = [-1, 0].concat(qualities.filter((q) => (!src || q < src) && (!cap || q < cap)));
      options = choices.map((q) => ({
        key: String(q),
        name: q === -1 ? t('player.automatic') : q > 0 ? qualityName(q) : cap > 0 ? t('player.maximumCapped', { limit: qualityName(cap) }) : t('player.original'),
        selected: q === quality,
        pick: () => onQuality(q),
      }));
      if (cap > 0) body = t('player.awayLimit', { limit: qualityName(cap) });
      break;
    }
    case 'chapters':
      title = t('player.chapters');
      options = (plan.chapters ?? []).map((c, i) => ({ key: String(c.start_ms), name: c.title || t('player.chapterNumber', { n: i + 1 }), detail: formatTime(c.start_ms), selected: i === chapterAt, pick: () => onChapter(c.start_ms) }));
      break;
    case 'speed':
      title = t('player.speed');
      options = speeds.map((s) => ({ key: String(s), name: s === 1 ? t('player.normal') : `${s}×`, selected: s === speed, pick: () => onSpeed(s) }));
      break;
  }
  const firstKey = (options.find((o) => o.selected) ?? options[0])?.key;
  return (
    <Popover place="above" shade={false} title={title} body={body} onClose={onClose}>
      <Scroller className="popover-list" pad={24}>
        {options.map((o) => <PopoverItem key={o.key} icon={o.selected ? 'check' : ''} label={o.name} detail={o.detail} first={o.key === firstKey} onClick={o.pick} />)}
      </Scroller>
    </Popover>
  );
}

/**
 * Subtitle Timing: where the lines are now, then Show 0.5s Earlier, Show 0.5s Later and Reset. Each
 * press shows at once and the menu stays open, so a line can be matched by eye. The choices stay
 * put (the focus mustn't lose its row): at ±10s, or at 0.0s for Reset, they're dimmed and do
 * nothing. Back returns the focus to the Subtitles button.
 */
function TimingMenu({ offset, onShift, onClose }: { offset: number; onShift: (delta: number | null) => void; onClose: () => void }) {
  // At the top of the screen, right edge level with the Subtitles button: over the button it would
  // cover the very lines being matched (they sit just above the controls).
  const [from] = useState(() => {
    const r = document.querySelector('[data-spotlight-id="player-subtitles"]')?.getBoundingClientRect();
    return r ? ({ left: r.left, right: r.right, width: r.width, top: 0, bottom: 20, height: 20 } as ClientRect) : undefined;
  });
  const way = timingWay(offset);
  const seconds = timingSeconds(offset);
  const body = way === 'later' ? t('player.timingLater', { seconds }) : way === 'earlier' ? t('player.timingEarlier', { seconds }) : t('player.timingZero');
  return (
    <Popover place="below" shade={false} from={from} title={t('player.timingTitle')} body={body} onClose={onClose}>
      <PopoverItem first icon="" label={t('player.timingShowEarlier')} dim={offset <= -MAX_MS} onClick={() => onShift(-STEP_MS)} />
      <PopoverItem icon="" label={t('player.timingShowLater')} dim={offset >= MAX_MS} onClick={() => onShift(STEP_MS)} />
      <PopoverItem icon="" label={t('player.timingReset')} dim={offset === 0} onClick={() => onShift(null)} />
    </Popover>
  );
}

/** The web's Up Next card, at the bottom right: the countdown, the next episode, Play Now (focused) and Cancel. */
function UpNext({ next: original, seconds, onPlay, onCancel }: { next: Item; seconds: number; onPlay: () => void; onCancel: () => void }) {
  useEffect(() => {
    Spotlight.resume();
    const timer = window.setTimeout(() => Spotlight.focus('up-next'), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const next = useSpoilerItem(original);
  const card = cardFor(next);
  return (
    <Trap spotlightId="up-next" className="up-next">
      <Artwork path={card.thumb} label={next.title} className="ratio-16x9 up-next-art" />
      <div className="up-next-text">
        <div className="muted small-caps">{seconds === 1 ? t('player.upNextInOne') : t('player.upNextIn', { n: seconds })}</div>
        <div className="up-next-title">{next.title}</div>
        <div className="muted">{[next.series_title, next.kind === 'episode' ? episodeCode(next) : ''].filter(Boolean).join(' · ')}</div>
        <Container className="inline">
          <Button className="primary" data-default onClick={onPlay}><Icon name="play" size={22} /> {t('player.playNow')}</Button>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
        </Container>
      </div>
    </Trap>
  );
}

/** An extra (a trailer, a featurette): its stream through /cast, with play/pause and seeking; Back closes it. */
export function ExtraPlayer({ extra }: { extra: Extra }) {
  const nav = useNav();
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState('');
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(extra.duration_ms ?? 0);
  const p = useRef<NativePlayer | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { url } = await api<{ url: string }>('/cast', { method: 'POST', body: { url: extra.stream_url } });
        if (!live) return;
        const native = platform.createPlayer(host.current!);
        p.current = native;
        native.on((ev, d) => {
          if (ev === 'ended') nav.back();
          if (ev === 'error') setFailed(d ?? 'error');
        });
        await native.load(url, 0);
        setDur((x) => native.duration() || x);
        native.play();
      } catch (e) {
        if (live) setFailed((e as Error).message);
      }
    })();
    const tick = window.setInterval(() => setPos(p.current?.position() ?? 0), 500);
    const onKey = (e: KeyboardEvent) => {
      const key = platform.remoteKey(e.keyCode);
      const pl = p.current;
      if (!pl) return;
      if (key === 'playPause' || e.keyCode === 13) pl.paused() ? pl.play() : pl.pause();
      else if (key === 'forward' || e.keyCode === 39) pl.seek(pl.position() + 10000);
      else if (key === 'rewind' || e.keyCode === 37) pl.seek(Math.max(0, pl.position() - 10000));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      live = false;
      window.clearInterval(tick);
      window.removeEventListener('keydown', onKey, true);
      p.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extra.id]);
  return (
    <div className="screen player">
      <div ref={host} className="player-host" />
      {failed && <div className="player-pane"><h2>{t('player.failed')}</h2><p className="muted">{failed}</p></div>}
      <div className="extra-bar">
        <div className="ctl-title">{extra.title}</div>
        <div className="tl-static"><div style={{ width: dur ? `${(pos / dur) * 100}%` : 0 }} /></div>
        <div className="muted">{formatTime(pos)} / {formatTime(dur)}</div>
      </div>
    </div>
  );
}

/**
 * A popover over the lobby (Invite People…, the host's Leave question) closed: the lobby stayed
 * open under it, so the focus goes back to the button that opened it. The popover's own return
 * skips past the lobby (it's a panel too), to whatever opened the player.
 */
function refocusLobby(selector: string) {
  window.setTimeout(() => {
    const el = document.querySelector(`.room-card ${selector}`) ?? document.querySelector('.room-card .spottable');
    if (el) focusElement(el);
  }, 50);
}
