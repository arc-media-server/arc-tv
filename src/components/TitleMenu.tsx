import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Item, type MediaFile, type PlaylistRef } from '../api';
import { t } from '../i18n';
import {
  audioCodecName, bitrate, bytes, channelsName, countLabel, hdrName, languageName, resolutionName, sameLanguage, videoCodecName, watched,
} from '../lib/format';
import { canUse, queue, queues, removeFromContinue, setPlayed, setWatchlist, useChanges, withChanges } from '../lib/store';
import { toast } from '../lib/toast';
import { roomTitle, startRoom, useCanTogether } from '../lib/together';
import { CardMenuContext, type CardPlace } from './Cards';
import { Overlay, Popover, PopoverItem } from './Menu';
import { Scroller, type ScrollerHandle } from './Scroller';
import { Button, focusElement } from './spot';
import { Spotlight } from '@enact/spotlight';
// Star rating
import { StarRating } from './StarRating';
import { stars } from '../lib/ratings';

// A title's ⋯ menu (the web's ItemActions MoreMenu, for what a TV viewer can do) and Media Info.
// The same menu opens from any card by holding OK (CardMenuHost).

const canWatchlist = (it: Item) => it.kind === 'movie' || it.kind === 'series';
const queueable = (it: Item) => it.kind === 'movie' || it.kind === 'episode' || it.kind === 'series';

export async function toggleWatched(it: Item) {
  try {
    await setPlayed(it, !watched(it));
  } catch {
    toast(t('action.watchedFailed'));
  }
}

export async function toggleWatchlist(it: Item) {
  try {
    await setWatchlist(it, !it.user_data?.watchlisted);
  } catch {
    toast(t('action.watchlistFailed'));
  }
}

/** Play Next or Add to Queue, with a note of what happened. */
export async function addToQueue(it: Item, next: boolean) {
  const done = await queues.add([it.id], next);
  toast(t(!done ? 'queue.failed' : next ? 'queue.addedNext' : 'queue.added', { title: it.title }));
}

/**
 * Watch Together from a title's menu: a room with a code, from the profile's resume point; a show
 * starts on the episode its Play would (Android's ⋯ → Watch Together). App opens the lobby.
 */
async function watchTogether(it: Item) {
  try {
    const target = await roomTitle(it);
    if (!target) { toast(t('together.noEpisode')); return; }
    if (!(await startRoom(target.item, target.startMs))) toast(t('together.startFailed'));
  } catch {
    toast(t('together.startFailed'));
  }
}

/** Whether this server keeps play queues for this profile (Play Next, Add to Queue, Shuffle). */
export function useCanQueue(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => { void canUse('play_queues').then(setOk); }, []);
  return ok;
}

async function takeOffContinue(it: Item) {
  try {
    await removeFromContinue(it);
  } catch {
    toast(t('action.removeContinueFailed'));
  }
}

/** What can be done to a queue entry: move it earlier or later (staying after what's playing), or take it out. */
function useQueueMoves(entryId?: string) {
  const q = queue.use();
  if (!entryId || !q) return { earlier: false, later: false, remove: false };
  const at = q.entries.findIndex((e) => e.id === entryId);
  const current = q.entries.findIndex((e) => e.id === q.current_entry_id);
  return { earlier: at > current + 1, later: at > current && at < q.entries.length - 1, remove: at > current };
}

async function queueEdit(run: () => Promise<unknown>) {
  if (!(await run())) toast(t('queue.editFailed'));
}

/** Takes an entry off the queue; its card leaves Home's Queue row, so the focus stays on that row. */
async function removeFromQueue(entryId: string) {
  await queueEdit(() => queues.remove(entryId));
  window.setTimeout(() => {
    const cur = Spotlight.getCurrent() as HTMLElement | null;
    if (cur && document.body.contains(cur)) return;
    const next = document.querySelector('[data-row="queue"] .spottable') as HTMLElement | null;
    if (next) focusElement(next);
    else Spotlight.focus();
  }, 0);
}

/** Adds a title to one of the profile's playlists, with a note of what happened (the web's picker). */
async function addToPlaylist(it: Item, list: PlaylistRef) {
  try {
    await api(`/playlists/${encodeURIComponent(list.id)}/items`, { method: 'POST', body: { item_ids: [it.id] } });
    toast(t('playlist.added', { title: it.title, playlist: list.title }));
  } catch {
    toast(t('playlist.addFailed', { title: it.title, playlist: list.title }));
  }
}

/**
 * Add to Playlist: the profile's playlists, each with how many titles it holds. Smart playlists
 * fill themselves, so they aren't listed (as on the web). New playlists are made on the web.
 */
function PlaylistPicker({ item, from, onClose }: { item: Item; from?: ClientRect; onClose: () => void }) {
  const [lists, setLists] = useState<PlaylistRef[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => {
    setFailed(false);
    setLists(null);
    api<PlaylistRef[]>('/playlists').then((all) => setLists((all ?? []).filter((p) => !p.smart_filter)), () => setFailed(true));
  };
  useEffect(load, []);
  // The list arrives after the panel opens, so the focus moves onto it then.
  useEffect(() => {
    if (!lists && !failed) return;
    const timer = window.setTimeout(() => {
      const el = document.querySelector('.popover .popover-item');
      if (el) focusElement(el);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [lists, failed]);
  const what = t(item.kind === 'series' ? 'playlist.addShowTo' : 'playlist.addTo', { title: item.title });
  const body = failed ? t('playlist.loadFailed') : !lists ? t('playlist.loading') : lists.length ? what : t('playlist.noneEditable');
  return (
    <Popover title={t('playlist.addTitle')} body={body} from={from} onClose={onClose}>
      {failed && <PopoverItem first icon="" label={t('common.retry')} onClick={load} />}
      {lists && !lists.length && <PopoverItem first icon="" label={t('common.close')} onClick={onClose} />}
      {lists && lists.length > 0 && (
        <Scroller className="popover-list" pad={24}>
          {lists.map((p, i) => (
            <PopoverItem key={p.id} first={i === 0} icon="" label={p.title} detail={countLabel(p.count ?? 0)} onClick={() => { onClose(); void addToPlaylist(item, p); }} />
          ))}
        </Scroller>
      )}
    </Popover>
  );
}

export function MoreMenu({ item, onMediaInfo, onPlayVersion, onClose, inContinue, queueEntry, rating = false }: { item: Item; rating?: boolean; onMediaInfo?: () => void; onPlayVersion?: () => void; onClose: () => void; inContinue?: boolean; queueEntry?: string }) {
  // Star rating
  const [ratingOpen, setRatingOpen] = useState(false);
  const moves = useQueueMoves(queueEntry);
  const canQueue = useCanQueue();
  const canTogether = useCanTogether();
  const done = (fn: () => void) => () => { fn(); onClose(); };
  const on = !!item.user_data?.watchlisted;
  // Where the ⋯ or card is, so Add to Playlist's list opens where this menu did.
  const [opener] = useState(() => (Spotlight.getCurrent() as HTMLElement | null)?.getBoundingClientRect());
  const [picking, setPicking] = useState(false);
  if (picking) return <PlaylistPicker item={item} from={opener} onClose={onClose} />;
  if (ratingOpen) return <StarRating item={item} onClose={onClose} />;
  return (
    <Popover title={item.title} onClose={onClose}>
      <PopoverItem first icon={watched(item) ? 'circleCheck' : 'check'} label={t(watched(item) ? 'action.markUnwatched' : 'action.markWatched')} onClick={done(() => void toggleWatched(item))} />
      {canWatchlist(item) && <PopoverItem icon={on ? 'bookmarkOn' : 'bookmark'} label={t(on ? 'action.removeWatchlist' : 'action.addWatchlist')} onClick={done(() => void toggleWatchlist(item))} />}
      {canQueue && queueable(item) && (
        <>
          <PopoverItem icon="next" label={t('queue.playNext')} onClick={done(() => void addToQueue(item, true))} />
          <PopoverItem icon="list" label={t('queue.add')} onClick={done(() => void addToQueue(item, false))} />
        </>
      )}
      {queueable(item) && <PopoverItem icon="list" label={t('playlist.add')} onClick={() => setPicking(true)} />}
      {canTogether && queueable(item) && <PopoverItem icon="users" label={t('together.menu')} onClick={done(() => void watchTogether(item))} />}
      {onPlayVersion && <PopoverItem icon="film" label={t('details.playVersion')} onClick={onPlayVersion} />}
      {inContinue && <PopoverItem icon="close" label={t('action.removeContinue')} onClick={done(() => void takeOffContinue(item))} />}
      {/* A card on the queue's row: arrange the queue, as the web player's queue list. */}
      {queueEntry && moves.earlier && <PopoverItem icon="arrowLeft" label={t('queue.moveEarlier')} onClick={done(() => void queueEdit(() => queues.move(queueEntry, -1)))} />}
      {queueEntry && moves.later && <PopoverItem icon="arrowRight" label={t('queue.moveLater')} onClick={done(() => void queueEdit(() => queues.move(queueEntry, 1)))} />}
      {queueEntry && moves.remove && <PopoverItem icon="close" label={t('queue.remove')} onClick={done(() => void removeFromQueue(queueEntry))} />}
      {/* Star rating, after Play Version and before Media Info, as Android. */}
      {rating && queueable(item) && <PopoverItem icon="star" label={t('rating.rate')} detail={stars(item.user_data?.rating ?? 0)} onClick={() => setRatingOpen(true)} />}
      {onMediaInfo && <PopoverItem icon="info" label={t('action.mediaInfo')} onClick={onMediaInfo} />}
    </Popover>
  );
}

function aspect(r?: number): string {
  if (!r || r <= 0) return '';
  if (Math.abs(r - 4 / 3) < 0.02) return '4:3';
  if (Math.abs(r - 16 / 9) < 0.02) return '16:9';
  return `${r.toFixed(2)}:1`;
}

function InfoRow({ label, lines, allBright }: { label: string; lines: string[]; allBright?: boolean }) {
  const shown = lines.filter(Boolean);
  if (!shown.length) return null;
  return (
    <div className="info-row">
      <div className="info-label">{label}</div>
      <div className="info-lines">
        {shown.map((l, i) => <div key={i} className={i === 0 || allBright ? '' : 'muted'}>{l}</div>)}
      </div>
    </div>
  );
}

function FileInfo({ file, several }: { file: MediaFile; several: boolean }) {
  const streams = file.streams ?? [];
  const video = streams.find((s) => s.kind === 'video');
  const audio = streams.filter((s) => s.kind === 'audio');
  const subs = streams.filter((s) => s.kind === 'subtitle');
  const join = (parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ');
  return (
    <div className="file-info">
      {several && (
        <h3>{t('media.version', { name: join([file.edition, resolutionName(video?.width, video?.height), (file.part ?? 0) > 0 && t('media.part', { n: file.part ?? 0 })]) })}</h3>
      )}
      {video && (
        <InfoRow
          label={t('media.video')}
          lines={[
            join([resolutionName(video.width, video.height), videoCodecName(video.codec), hdrName(video)]),
            join([video.width && video.height ? `${video.width}×${video.height}` : '', aspect(video.aspect_ratio)]),
            join([video.frame_rate ? `${+video.frame_rate.toFixed(3)} fps` : '', video.bitrate ? bitrate(video.bitrate) : '', video.bit_depth ? `${video.bit_depth}-bit` : '', video.dolby_vision_profile ? `DV profile ${video.dolby_vision_profile}` : '']),
            join([video.color_primaries, video.color_transfer]),
          ]}
        />
      )}
      <InfoRow
        label={t('media.audio')}
        allBright
        lines={audio.map((a) => join([languageName(a.language), audioCodecName(a.codec, a.profile), channelsName(a.channels), a.bitrate ? bitrate(a.bitrate) : '', a.title && !sameLanguage(a.title, a.language) ? a.title : '']))}
      />
      <InfoRow
        label={t('media.subtitles')}
        allBright
        lines={subs.map((s) => join([languageName(s.language) || s.language || '?', s.codec?.toUpperCase(), s.is_forced && t('player.forced')]))}
      />
      <InfoRow label={t('media.file')} lines={[join([file.container?.toUpperCase(), file.size ? bytes(file.size) : '', file.bitrate ? bitrate(file.bitrate) : ''])]} />
      {file.path && <div className="file-path">{file.path}</div>}
      {file.probe_error && <div className="warning">{t('media.probeError', { error: file.probe_error })}</div>}
    </div>
  );
}

/**
 * Media Info, laid out as the web's SourceFormats: for each file, its video, audio, subtitles
 * and the file itself. Up and Down scroll it; Close (focused) or Back closes it.
 */
export function MediaInfo({ item, onClose }: { item: Item; onClose: () => void }) {
  const [full, setFull] = useState<Item | null>(item.files ? item : null);
  const scroll = useRef<ScrollerHandle>(null);
  useEffect(() => {
    if (item.files) return;
    api<Item>(`/items/${encodeURIComponent(item.id)}`).then(setFull, () => setFull({ ...item, files: [] }));
  }, [item]);
  const files = full?.files ?? [];
  return (
    <Overlay width={1440} onClose={onClose} className="media-info">
      <div className="media-info-head">
        <div>
          <h2 className="overlay-title">{t('action.mediaInfo')}</h2>
          <div className="muted">{item.title}</div>
        </div>
        <Button
          data-default
          onClick={onClose}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.keyCode === 40) { scroll.current?.by(240); e.preventDefault(); e.stopPropagation(); }
            if (e.keyCode === 38) { scroll.current?.by(-240); e.preventDefault(); e.stopPropagation(); }
          }}
        >
          {t('common.close')}
        </Button>
      </div>
      <Scroller ref={scroll} className="media-info-body">
        {!full && <p className="muted">{t('common.loading')}</p>}
        {files.map((f) => <FileInfo key={f.id} file={f} several={files.length > 1} />)}
      </Scroller>
    </Overlay>
  );
}

/** Gives every card its hold-OK menu; Media Info opens from it for something playable. */
export function CardMenuHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ item: Item; info: boolean; place?: CardPlace } | null>(null);
  const changes = useChanges();
  const item = open ? withChanges(open.item, changes) : null;
  return (
    <CardMenuContext.Provider value={(it, _from, place) => setOpen({ item: it, info: false, place })}>
      {children}
      {item && open && (open.info
        ? <MediaInfo item={item} onClose={() => setOpen(null)} />
        : <MoreMenu item={item} inContinue={open.place?.inContinue} queueEntry={open.place?.queueEntry} onMediaInfo={item.kind !== 'series' ? () => setOpen({ item: open.item, info: true }) : undefined} onClose={() => setOpen(null)} />)}
    </CardMenuContext.Provider>
  );
}
