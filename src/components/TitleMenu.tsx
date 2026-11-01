import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Item, type MediaFile } from '../api';
import { t } from '../i18n';
import {
  audioCodecName, bitrate, bytes, channelsName, hdrName, languageName, resolutionName, sameLanguage, videoCodecName, watched,
} from '../lib/format';
import { canUse, queues, setPlayed, setWatchlist, useChanges, withChanges } from '../lib/store';
import { toast } from '../lib/toast';
import { CardMenuContext } from './Cards';
import { Overlay, Popover, PopoverItem } from './Menu';
import { Scroller, type ScrollerHandle } from './Scroller';
import { Button } from './spot';

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

/** Whether this server keeps play queues for this profile (Play Next, Add to Queue, Shuffle). */
export function useCanQueue(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => { void canUse('play_queues').then(setOk); }, []);
  return ok;
}

export function MoreMenu({ item, onMediaInfo, onPlayVersion, onClose }: { item: Item; onMediaInfo?: () => void; onPlayVersion?: () => void; onClose: () => void }) {
  const canQueue = useCanQueue();
  const done = (fn: () => void) => () => { fn(); onClose(); };
  const on = !!item.user_data?.watchlisted;
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
      {onPlayVersion && <PopoverItem icon="film" label={t('details.playVersion')} onClick={onPlayVersion} />}
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
  const [open, setOpen] = useState<{ item: Item; info: boolean } | null>(null);
  const changes = useChanges();
  const item = open ? withChanges(open.item, changes) : null;
  return (
    <CardMenuContext.Provider value={(it) => setOpen({ item: it, info: false })}>
      {children}
      {item && open && (open.info
        ? <MediaInfo item={item} onClose={() => setOpen(null)} />
        : <MoreMenu item={item} onMediaInfo={item.kind !== 'series' ? () => setOpen({ item: open.item, info: true }) : undefined} onClose={() => setOpen(null)} />)}
    </CardMenuContext.Provider>
  );
}
