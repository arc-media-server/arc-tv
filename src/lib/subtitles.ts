import type { Prefs, SubtitleTrack } from '../api';
import { sameLanguage } from './format';

// Text subtitles, drawn by the app over the TV's player (its own subtitle support differs between
// LG and Samsung, and can't load a track with the sign-in token). Arc converts any text track to
// WebVTT (GET /items/{id}/subtitles/{track}/vtt); the cues are matched to the time in the file.
// Picture tracks (PGS, VobSub) can't be drawn this way: Arc burns them into a converted stream.

export interface Cue { start: number; end: number; text: string }

function time(s: string): number {
  const parts = s.trim().split(':');
  let ms = 0;
  for (const p of parts) ms = ms * 60 + parseFloat(p.replace(',', '.'));
  return Math.round(ms * 1000);
}

export function parseVTT(vtt: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = vtt.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.indexOf('-->') >= 0);
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const text = lines.slice(at + 1).join('\n')
      // Keep line breaks and italics; drop other tags (voice, class, timestamps).
      .replace(/<(?!\/?i>)[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
    if (!text.trim()) continue;
    cues.push({ start: time(a), end: time(b.trim().split(/\s+/)[0]), text });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** The cues showing at `ms` (found by binary search on start, then looking back for overlaps). */
export function activeCues(cues: Cue[], ms: number): Cue[] {
  let lo = 0, hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= ms) lo = mid + 1;
    else hi = mid;
  }
  const out: Cue[] = [];
  for (let i = lo - 1; i >= 0 && i >= lo - 20; i--) if (cues[i].end > ms) out.unshift(cues[i]);
  return out;
}

/** The tracks the player offers: text ones, and picture ones inside the file (Arc only burns those in). */
export function playableSubtitles(tracks: SubtitleTrack[] = []): SubtitleTrack[] {
  return tracks.filter((s) => !s.image || !s.external);
}

/**
 * The track to start with (the web player's chooseSubtitle): the profile's language when its
 * subtitle mode wants it, else a forced track in the audio's language. A text track is preferred;
 * a picture one (PGS, VobSub) is chosen when it's all there is, and Arc burns it into the video.
 */
export function chooseSubtitle(tracks: SubtitleTrack[], preferred = '', audioLanguage = '', mode = ''): SubtitleTrack | null {
  tracks = playableSubtitles(tracks);
  const wanted = mode === 'manual' ? false : mode === 'foreign' ? !!preferred && !!audioLanguage && !sameLanguage(audioLanguage, preferred) : true;
  if (preferred && wanted) {
    const matching = tracks.filter((s) => sameLanguage(s.language, preferred));
    const pick = matching.find((s) => !s.forced && !s.hearing_impaired && !s.image) ?? matching.find((s) => !s.forced) ?? matching[0];
    if (pick) return pick;
  }
  return tracks.find((s) => s.forced && (!s.language || !audioLanguage || sameLanguage(s.language, audioLanguage))) ?? null;
}

/** The subtitle language to remember when the viewer picks a track (null: nothing changes). */
export function rememberedSubtitleLanguage(track: SubtitleTrack | null, mode = ''): string | null {
  if (track && !track.forced) return track.language ?? '';
  if (!track && mode === '') return '';
  return null;
}

/** The profile's subtitle look as CSS (size, colour, background, position). */
export function subtitleLook(style: Prefs['subtitle_style'] = {}): { box: React.CSSProperties; text: React.CSSProperties } {
  const size = ({ small: 0.045, large: 0.065, huge: 0.08 } as Record<string, number>)[style.size ?? ''] ?? 0.0533;
  const text: React.CSSProperties = { fontSize: Math.round(1080 * size), color: style.color === 'yellow' ? '#ffe14d' : '#fff' };
  if (style.background === 'solid') text.background = '#000';
  else if (style.background === 'none') text.textShadow = '0 0 4px #000, 0 0 4px #000, 2px 2px 2px #000';
  else { text.background = 'rgba(0,0,0,0.65)'; text.textShadow = '2px 2px 3px rgba(0,0,0,0.8)'; }
  const box: React.CSSProperties = style.position === 'top' ? { top: 80 } : { bottom: 90 };
  return { box, text };
}
