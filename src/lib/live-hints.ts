// Live updates: bounded SSE parsing and scan-safe hint batching (Android LiveHints.kt).
export const liveTopics = {
  home: ['catalog', 'library', 'profile', 'playback', 'artwork'],
  title: ['catalog', 'profile', 'playback', 'artwork', 'optimized', 'previews'],
  prefs: ['profile'],
  /** Watch Together's rooms list (Home's row): a room made, invited to, joined, left, declined or ended. */
  together: ['watch_together'],
};
export function touches(topics: Set<string>, wanted: readonly string[]) {
  return topics.has('resync') || wanted.some((topic) => topics.has(topic));
}
export interface LiveEvent { event: string; data: string; id?: string }
export class SseParser {
  private text = '';
  private kind = '';
  private data: string[] = [];
  private id: string | undefined;
  constructor(private readonly emit: (event: LiveEvent) => void) {}
  feed(chunk: string) {
    this.text += chunk;
    // Frames and lines are bounded even if a proxy returns an unrelated body.
    if (this.text.length > 65536) throw new Error('oversize live event');
    let end: number;
    while ((end = this.text.indexOf('\n')) >= 0) {
      const line = this.text.slice(0, end).replace(/\r$/, '');
      this.text = this.text.slice(end + 1);
      if (!line) {
        if (this.kind || this.data.length) this.emit({ event: this.kind || 'message', data: this.data.join('\n'), id: this.id });
        this.kind = ''; this.data = [];
      } else if (line[0] !== ':') {
        const at = line.indexOf(':');
        const field = at < 0 ? line : line.slice(0, at);
        const value = at < 0 ? '' : line.slice(at + 1).replace(/^ /, '');
        if (field === 'event') this.kind = value;
        if (field === 'data' && this.data.length < 128) this.data.push(value);
        if (field === 'id' && value.length <= 80 && value.indexOf('\0') < 0) this.id = value;
      }
    }
  }
}
export class HintBatcher {
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private last = -Infinity;
  constructor(private readonly flush: (topics: Set<string>) => void, private readonly first = 1500, private readonly spacing = 5000) {}
  add(topic: string) {
    // Ignore unrecognized topics so the pending set cannot grow without bound.
    if (topic !== 'resync' && !Object.values(liveTopics).some((list) => list.includes(topic))) return;
    this.pending.add(topic);
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => this.run(), Math.max(this.first, this.last + this.spacing - Date.now()));
  }
  run() {
    clearTimeout(this.timer); this.timer = undefined;
    if (!this.pending.size) return;
    const topics = this.pending; this.pending = new Set(); this.last = Date.now();
    this.flush(topics);
  }
  stop() { clearTimeout(this.timer); this.timer = undefined; this.pending.clear(); }
}

// XHR's progressive responseText works on Chrome 53, where fetch has no streaming reader.
// Rotate the response buffer at 256 KiB; replay resumes by header, never by a URL token.
export class LiveUpdates {
  private request?: XMLHttpRequest;
  private retry?: ReturnType<typeof setTimeout>;
  private cursor = '';
  private wanted = false;
  private missed = false;
  private connected = false;
  private backoff = 5000;
  private failed = false;
  readonly batcher: HintBatcher;
  constructor(private readonly url: string, private readonly token: string, flush: (topics: Set<string>) => void,
    private readonly xhr: () => XMLHttpRequest = () => new XMLHttpRequest()) { this.batcher = new HintBatcher(flush); }
  start() { this.wanted = true; if (!this.request && this.retry === undefined) this.open(); }
  stop() {
    this.wanted = false; this.missed = this.connected;
    clearTimeout(this.retry); this.retry = undefined;
    const req = this.request; this.request = undefined; req?.abort(); this.batcher.stop();
  }
  private open() {
    if (!this.wanted) return;
    const req = this.xhr(); this.request = req;
    let offset = 0, accepted = false, fresh = !this.cursor;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const watch = () => { clearTimeout(idle); idle = setTimeout(ended, 45000); };
    const stopIdle = () => { clearTimeout(idle); };
    const originalAbort = req.abort.bind(req);
    req.abort = () => { stopIdle(); originalAbort(); };
    const parser = new SseParser((event) => {
      if (event.id !== undefined) this.cursor = event.id;
      if (event.event === 'resync') { if (fresh) fresh = false; else this.batcher.add('resync'); }
      if (event.event === 'invalidate') {
        fresh = false;
        try { const topic = JSON.parse(event.data).topic; if (typeof topic === 'string') this.batcher.add(topic); } catch { /* malformed hint */ }
      }
    });
    const ended = () => {
      if (this.request !== req) return;
      this.request = undefined; this.missed = true;
      let delay = this.backoff;
      if (req.status === 429) {
        const seconds = Number(req.getResponseHeader('Retry-After'));
        if (seconds >= 1 && seconds <= 600) delay = seconds * 1000;
      }
      req.abort();
      if (!accepted) {
        if (!this.failed) console.warn('Arc: live updates unavailable; retrying');
        this.failed = true; this.backoff = Math.min(this.backoff * 2, 60000);
      }
      if (this.wanted) this.retry = setTimeout(() => { this.retry = undefined; this.open(); }, delay);
    };
    req.open('GET', this.url, true);
    req.setRequestHeader('Accept', 'text/event-stream');
    if (this.token) req.setRequestHeader('Authorization', `Bearer ${this.token}`);
    if (this.cursor) req.setRequestHeader('Last-Event-ID', this.cursor);
    req.onreadystatechange = () => {
      if (this.request !== req || req.readyState < 2) return;
      if (req.status === 200 && !accepted) {
        watch();
        accepted = true; this.connected = true; this.failed = false; this.backoff = 5000;
        if (this.missed) { this.missed = false; this.batcher.add('resync'); this.batcher.run(); }
      }
      if (req.readyState === 4) { if (accepted) read(); ended(); }
    };
    const read = () => {
      if (this.request !== req || !accepted) return;
      watch();
      try { const text = req.responseText; parser.feed(text.slice(offset)); offset = text.length; if (offset >= 262144) ended(); }
      catch { ended(); }
    };
    req.onprogress = read; req.onerror = ended; req.ontimeout = ended;
    req.send();
  }
}
