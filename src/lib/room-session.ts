// One membership of a Watch Together room (Android's data/RoomSession.kt, the web's RoomSession):
// the room's own live stream (the full room on every change), clock sync, heartbeats and
// commands. It takes its network and clock from outside (`RoomDeps`) so the unit tests can drive
// it without a TV or a server.
//
// The stream is an authenticated XHR read progressively, as live-hints.ts does: Chrome 53 (LG
// webOS 4.5) has no fetch streaming, and the sign-in token never goes in a URL, so EventSource
// can't be used. There is one stream at a time; when it ends it reconnects with bounded backoff
// after asking Arc (GET /current) whether this TV is still in the room.

import { SseParser } from './live-hints';
import {
  clockOffset, expectedPosition, heartbeatBody, newer, nextBackoff, retryAfterConflict, retryDelay, startedOnce,
  type Action, type ClockSample, type PlayerReport, type WatchInvite, type WatchRoom,
} from './watch-together';

/** A refusal from Arc: its status, and the body (a 409's newer room). */
export interface RoomRefusal { status: number; body?: unknown }

export interface RoomDeps {
  /** Calls /api/v1/watch-together{path}; resolves the JSON body (undefined for 204), rejects with a RoomRefusal-like error. */
  call<T>(method: string, path: string, body?: unknown): Promise<T>;
  /** Opens the room's stream: a GET with the sign-in header already set, not yet sent. */
  openStream(roomId: string): XMLHttpRequest;
  now?(): number;
  log?(level: 'info' | 'warn', message: string): void;
}

/** Why a membership ended: the host ended the room; it's gone (404: dropped, expired, Arc restarted); signed out (401). */
export type RoomEnd = 'ended' | 'gone' | 'signedOut';

const STREAM_IDLE_MS = 15000; // Arc sends a full room at least every 2 s; 15 s of silence is a dead line.
const STREAM_ROTATE = 262144;

function statusOf(e: unknown): number {
  const s = (e as { status?: unknown })?.status;
  return typeof s === 'number' ? s : 0;
}
function conflictRoom(e: unknown): WatchRoom | null {
  if (statusOf(e) !== 409) return null;
  const body = (e as { body?: { room?: WatchRoom } }).body;
  return body && body.room && typeof body.room.id === 'string' ? body.room : null;
}

export class RoomSession {
  room: WatchRoom;
  /** Whether the room's stream is open now (false while reconnecting). */
  connected = false;
  /**
   * Whether the room has played (the lobby is over): Arc's `started` where it sends it. Older
   * servers: a room this TV just made is fresh until it first plays, even when it starts part-way
   * through; one joined part-way is judged by startedOnce (paused at a later position: played).
   */
  started: boolean;
  private offset = 0;
  private stopped = false;
  private reporter: (() => PlayerReport | null) | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private retry: ReturnType<typeof setTimeout> | undefined;
  private backoff = 2000;
  private request: XMLHttpRequest | undefined;
  private lastBeat = 0;
  private dropped = false;
  private readonly now: () => number;
  private readonly log: (level: 'info' | 'warn', message: string) => void;

  constructor(
    room: WatchRoom,
    private readonly deps: RoomDeps,
    private readonly onRoom: (room: WatchRoom) => void,
    private readonly onEnd: (why: RoomEnd) => void,
    private readonly onConnection: (connected: boolean) => void = () => {},
    fresh = false,
  ) {
    this.room = room;
    this.started = typeof room.started === 'boolean' || !fresh ? startedOnce(room) : room.state !== 'paused';
    this.now = deps.now ?? (() => Date.now());
    this.log = deps.log ?? ((level, message) => (level === 'warn' ? console.warn(message) : console.info(message)));
  }

  start() {
    this.open();
    void this.syncClock();
    this.lastBeat = this.now();
    this.timers.push(setInterval(() => void this.syncClock(), 60000));
    this.timers.push(setInterval(() => {
      // A long gap between beats means the TV slept: measure the clock again and reconnect now.
      const gap = this.now() - this.lastBeat;
      this.lastBeat = this.now();
      if (gap > 10000) this.wake();
      void this.heartbeat();
    }, 2000));
  }

  /** Stops following the room (it carries on without this TV; Arc drops it after 30 s). */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.retry);
    this.retry = undefined;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    const req = this.request;
    this.request = undefined;
    req?.abort();
    this.setConnected(false);
  }

  get active() { return !this.stopped; }

  /** Leaves the room, then stops. */
  async leave() {
    this.stop();
    await this.deps.call('POST', `/${encodeURIComponent(this.room.id)}/leave`).catch(() => undefined);
  }

  /** The TV woke (or came back to the foreground): measure the clock again, and reopen the stream at once if it's down. */
  wake() {
    if (this.stopped) return;
    void this.syncClock();
    if (!this.request) {
      clearTimeout(this.retry);
      this.retry = undefined;
      this.open();
    }
  }

  /** Arc's clock now, as well as this TV can tell. */
  serverNow() { return this.now() + this.offset; }
  expected() { return expectedPosition(this.room, this.serverNow()); }

  setReporter(reporter: (() => PlayerReport | null) | null) { this.reporter = reporter; }
  /** Reports at once (starting or finishing buffering) rather than on the next beat. */
  reportNow() { void this.heartbeat(); }

  play() { return this.command('play'); }
  pause() { return this.command('pause'); }
  seek(positionMS: number) { return this.command('seek', { position_ms: Math.max(0, Math.round(positionMS)) }); }
  changeItem(itemId: string, positionMS = 0) { return this.command('change_item', { item_id: itemId, position_ms: Math.max(0, Math.round(positionMS)) }); }
  end() { return this.command('end'); }

  /** A new code (host only); the old one stops working. */
  async renew(): Promise<WatchInvite> {
    const path = `/${encodeURIComponent(this.room.id)}/invite`;
    let invite: WatchInvite;
    try {
      invite = await this.deps.call<WatchInvite>('POST', path, { revision: this.room.revision });
    } catch (e) {
      const room = conflictRoom(e);
      if (!room) throw e;
      this.adopt(room);
      invite = await this.deps.call<WatchInvite>('POST', path, { revision: this.room.revision });
    }
    this.adopt(invite.room);
    return invite;
  }

  /** Invites more people by profile (host only). */
  async inviteMore(profileIds: string[]) {
    this.adopt(await this.deps.call<WatchRoom>('POST', `/${encodeURIComponent(this.room.id)}/people`, { profile_ids: profileIds }));
  }

  /**
   * Sends a command with the last revision seen. If the room changed meanwhile (409), takes the
   * newer room and sends it once more only if it still does what was asked (retryAfterConflict).
   */
  private async command(action: Action, extra: { position_ms?: number; item_id?: string } = {}) {
    const path = `/${encodeURIComponent(this.room.id)}/commands`;
    const generation = this.room.generation;
    try {
      this.adopt(await this.deps.call<WatchRoom>('POST', path, { revision: this.room.revision, action, ...extra }));
    } catch (e) {
      const room = conflictRoom(e);
      if (room) {
        this.adopt(room);
        const again = retryAfterConflict(action, generation, this.room);
        this.log('info', `Arc: watch together: ${action} met a newer room (409); ${again ? 'sending it again' : 'dropped as stale'}`);
        if (again) this.adopt(await this.deps.call<WatchRoom>('POST', path, { revision: this.room.revision, action, ...extra }));
        return;
      }
      if (statusOf(e) === 404) this.gone();
      throw e;
    }
  }

  private async heartbeat() {
    if (this.stopped) return;
    const r = this.reporter?.();
    if (!r) return;
    try {
      this.adopt(await this.deps.call<WatchRoom>('POST', `/${encodeURIComponent(this.room.id)}/heartbeat`, heartbeatBody(this.room.generation, r)));
    } catch (e) {
      // A seek or a new title meanwhile: report against it next time.
      const room = conflictRoom(e);
      if (room) this.adopt(room);
      else if (statusOf(e) === 404) this.gone();
      else if (statusOf(e) === 401) this.finish('signedOut');
      // Otherwise offline for a moment: the next beat tries again.
    }
  }

  private async syncClock() {
    const samples: ClockSample[] = [];
    for (let i = 0; i < 3 && !this.stopped; i++) {
      const c0 = this.now();
      try {
        const t = await this.deps.call<{ server_received_ms: number; server_sent_ms: number }>('GET', `/time?client_sent_ms=${Math.round(c0)}`);
        samples.push({ c0, c3: this.now(), s1: t.server_received_ms, s2: t.server_sent_ms });
      } catch {
        break;
      }
    }
    const offset = clockOffset(samples);
    if (offset !== null) this.offset = offset;
  }

  /** Takes a room from Arc if it's at least as new as the one held. */
  adopt(room: WatchRoom) {
    if (this.stopped || !newer(this.room, room)) return;
    this.room = room;
    if (room.state !== 'paused' || room.started) this.started = true;
    this.onRoom(room);
    if (room.state === 'ended') this.finish('ended');
  }

  private gone() { this.finish('gone'); }

  private finish(why: RoomEnd) {
    if (this.stopped) return;
    this.stop();
    this.log('info', `Arc: watch together: ${why === 'ended' ? 'the room ended' : why === 'signedOut' ? 'signed out; left the room' : 'no longer in the room'}`);
    this.onEnd(why);
  }

  private setConnected(on: boolean) {
    if (this.connected === on) return;
    this.connected = on;
    this.onConnection(on);
  }

  private open() {
    if (this.stopped || this.request) return;
    const req = this.deps.openStream(this.room.id);
    this.request = req;
    let offset = 0;
    let accepted = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const watch = () => { clearTimeout(idle); idle = setTimeout(ended, STREAM_IDLE_MS); };
    const parser = new SseParser((event) => {
      if (event.event !== 'room') return;
      try {
        this.adopt(JSON.parse(event.data) as WatchRoom);
      } catch {
        // A malformed frame: the next carries the full room again.
      }
    });
    const read = () => {
      if (this.request !== req || !accepted) return;
      watch();
      try {
        const text = req.responseText;
        parser.feed(text.slice(offset));
        offset = text.length;
        if (offset >= STREAM_ROTATE) ended();
      } catch {
        ended();
      }
    };
    const ended = () => {
      clearTimeout(idle);
      if (this.request !== req) return;
      this.request = undefined;
      const status = req.status;
      const retryAfter = status === 429 ? req.getResponseHeader('Retry-After') : null;
      req.onreadystatechange = null;
      req.abort();
      this.setConnected(false);
      if (this.stopped) return;
      if (status === 404) { this.gone(); return; }
      if (status === 401) { this.finish('signedOut'); return; }
      if (!this.dropped) {
        this.dropped = true;
        this.log('info', 'Arc: watch together: the room stream dropped; reconnecting');
      }
      const delay = retryDelay(this.backoff, status, retryAfter);
      this.backoff = nextBackoff(this.backoff);
      void this.recheck().then(() => {
        if (this.stopped || this.request) return;
        clearTimeout(this.retry);
        this.retry = setTimeout(() => { this.retry = undefined; this.open(); }, delay);
      });
    };
    req.onreadystatechange = () => {
      if (this.request !== req || req.readyState < 2) return;
      if (req.status === 200 && !accepted) {
        accepted = true;
        this.backoff = 2000;
        if (this.dropped) {
          this.dropped = false;
          this.log('info', 'Arc: watch together: the room stream reconnected');
        }
        this.setConnected(true);
        watch();
      }
      if (req.readyState === 4) { read(); ended(); }
    };
    req.onprogress = read;
    req.onerror = ended;
    req.ontimeout = ended;
    req.send();
  }

  /** After a drop: is this TV still in the room? (404, or a different room: no.) */
  private async recheck() {
    try {
      const room = await this.deps.call<WatchRoom>('GET', '/current');
      if (this.stopped) return;
      if (!room || room.id !== this.room.id) this.gone();
      else this.adopt(room);
    } catch (e) {
      if (statusOf(e) === 404) this.gone();
      else if (statusOf(e) === 401) this.finish('signedOut');
      // Offline: try the stream again after the backoff.
    }
  }
}
