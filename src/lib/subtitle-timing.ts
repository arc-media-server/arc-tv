// Subtitle timing, as the web player's and Android's (playback/SubtitleTiming.kt): half a second
// at a time, up to ten seconds either way, kept per file and track for this playback only (never
// saved). Positive shows the subtitles later. The app draws every text subtitle itself, ASS/SSA
// included (Arc converts them to WebVTT for it), so a change only moves which cues show: the video
// never reloads. Picture subtitles (PGS, VobSub) are burned into the video by Arc and can't move.

export const STEP_MS = 500;
export const MAX_MS = 10_000;

/** The offsets so far are kept by file and track. */
export function timingKey(fileId: number, trackId: string): string {
  return `${fileId}:${trackId}`;
}

/** The offset after a nudge of `deltaMs`, or 0 for Reset (`deltaMs` null). */
export function shifted(currentMs: number, deltaMs: number | null): number {
  if (deltaMs === null) return 0;
  return Math.max(-MAX_MS, Math.min(MAX_MS, currentMs + deltaMs));
}

/** Only text subtitles, which the app draws itself, can be moved. */
export function adjustable(track: { image?: boolean } | null | undefined): boolean {
  return !!track && !track.image;
}

/** The offset for `track` of `fileId`: none when no text subtitles are shown. */
export function offsetFor(offsets: Record<string, number>, fileId: number | undefined, track: { id: string; image?: boolean } | null | undefined): number {
  if (fileId === undefined || !track || !adjustable(track)) return 0;
  return offsets[timingKey(fileId, track.id)] ?? 0;
}

/** The point in the subtitles to show at `positionMs`: a later offset shows earlier cues. */
export function cueTime(positionMs: number, offsetMs: number): number {
  return positionMs - offsetMs;
}

/**
 * The offset in seconds, signed as every Arc app writes it (arc-media-server#479): "+1.5",
 * "−0.5" (a true minus sign, U+2212) and "0.0". The strings add the "s" with no space.
 */
export function timingSeconds(offsetMs: number): string {
  const sign = offsetMs > 0 ? '+' : offsetMs < 0 ? '−' : '';
  return sign + (Math.abs(offsetMs) / 1000).toFixed(1);
}

/** Which line heads the Timing menu: later, earlier or none. */
export function timingWay(offsetMs: number): 'later' | 'earlier' | 'zero' {
  return offsetMs > 0 ? 'later' : offsetMs < 0 ? 'earlier' : 'zero';
}
