// WebVTT cues and which show at a point in the file: plain code with no imports, so the subtitle
// timing tests can load it without the app (scripts/test-subtitle-timing.mjs).

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
