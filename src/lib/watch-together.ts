// Watch Together (arc-media-server docs/WATCH-TOGETHER-API.md; Android's data/WatchTogether.kt,
// the web's lib/watch-together.ts): a room shares one timeline (title, position, playing or
// paused); every TV streams its own copy with its own audio, subtitles and quality. This file is
// the plain part, with no React, network or timers of its own: the room's shape, codes, the clock
// and drift maths, the notes the player shows, and what to do after a refusal. Unit-tested by
// scripts/test-watch-together.mjs.

export interface WatchParticipant {
  id: string;
  name: string;
  available: boolean;
  ready: boolean;
  /** playing, paused or waiting (buffering). */
  state: string;
}

export interface RoomItem { id: string; title: string; kind: string }

export interface WatchRoom {
  id: string;
  revision: number;
  /** Bumps on every seek or title change: heartbeats name the one they've loaded. */
  generation: number;
  /** paused, playing, waiting (for someone loading) or ended. */
  state: string;
  /** In the file, at server time `at_ms`. */
  position_ms: number;
  at_ms: number;
  rate: number;
  server_time_ms: number;
  wait_until_ms?: number;
  /** Someone has pressed Play since the room was made (newer servers): the lobby is over. */
  started?: boolean;
  host_id: string;
  host_name?: string;
  self_id: string;
  changed_by?: string;
  /** False when this profile may not play the room's current title (then no item is sent). */
  available: boolean;
  item_id?: string;
  item?: RoomItem;
  participants: WatchParticipant[];
  /** People invited by name who aren't in the room now. */
  invited?: { name: string }[];
}

export interface WatchInvite { room: WatchRoom; invite_code: string; invite_expires_at_ms: number }

/** Someone this profile may invite (GET /watch-together/people). */
export interface WatchPerson {
  id: string;
  name: string;
  color?: string;
  /** A friend's profile, rather than one on this server. */
  friend: boolean;
  /** May play the title asked about; everyone invited must be able to. */
  can_watch: boolean;
}

/** A room in this profile's list (Home's Watch Together row). */
export interface ListedRoom {
  id: string;
  state: string;
  position_ms: number;
  created_at_ms: number;
  host_name: string;
  /** This profile made it. */
  hosting: boolean;
  /** This TV and profile are in it. */
  joined: boolean;
  item: RoomItem;
  participants: string[];
  invited: string[];
}

// --- Codes ---

/** The letters and digits Arc's codes use (no 0/O or 1/I to mix up). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/** "abcd 1234" or "ABCD-1234" as Arc's code. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** An eight-character code as it's read aloud: XXXX-XXXX. */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** One key typed into the code entry: a letter or digit adds to it (up to eight), Backspace takes one off. */
export function typeCode(code: string, key: string): string {
  if (key === 'backspace') return code.slice(0, -1);
  const c = normalizeCode(key);
  // Only characters codes use: Arc never issues 0, 1, I or O (too easy to misread).
  if (c.length !== 1 || CODE_ALPHABET.indexOf(c) < 0 || code.length >= CODE_LENGTH) return code;
  return code + c;
}

/** The character a remote key types, if any: the number keys (and the number pad), or a keyboard's letters. */
export function keyToCodeChar(keyCode: number): string | null {
  if (keyCode >= 48 && keyCode <= 57) return String(keyCode - 48);
  if (keyCode >= 96 && keyCode <= 105) return String(keyCode - 96);
  if (keyCode >= 65 && keyCode <= 90) return String.fromCharCode(keyCode);
  return null;
}

/** Whole minutes until a code runs out (at least 1 while it still works, 0 once it has). */
export function minutesLeft(expiresAtMs: number, nowMs: number): number {
  const left = expiresAtMs - nowMs;
  return left <= 0 ? 0 : Math.max(1, Math.ceil(left / 60000));
}

// --- Clock and drift ---

export interface ClockSample {
  /** This TV's send and receive times, and the server's receive and send times (epoch ms). */
  c0: number;
  c3: number;
  s1: number;
  s2: number;
}

/**
 * How far the server's clock is ahead of this one, from the sample with the shortest round trip
 * (NTP's midpoint estimate); null with no samples.
 */
export function clockOffset(samples: ClockSample[]): number | null {
  let best: { rtt: number; offset: number } | null = null;
  for (const s of samples) {
    const rtt = s.c3 - s.c0 - (s.s2 - s.s1);
    const offset = (s.s1 - s.c0 + (s.s2 - s.c3)) / 2;
    if (!best || rtt < best.rtt) best = { rtt, offset };
  }
  return best ? Math.round(best.offset) : null;
}

/** Where the room should be in the file at server time `serverNow`. */
export function expectedPosition(room: Pick<WatchRoom, 'state' | 'position_ms' | 'at_ms' | 'rate'>, serverNow: number): number {
  if (room.state !== 'playing') return room.position_ms;
  return Math.round(room.position_ms + Math.max(0, serverNow - room.at_ms) * (room.rate > 0 ? room.rate : 1));
}

export type Correction = { kind: 'none' } | { kind: 'rate'; rate: number } | { kind: 'seek'; to: number };

/**
 * How to bring this player back in step (the handoff's thresholds): under half a second, leave it;
 * up to three seconds, play slightly slower or faster until caught up, but only where the TV's
 * player can change speed smoothly (webOS's <video>; Tizen's AVPlay can't, so it waits until the
 * drift is worth a jump); beyond three seconds, jump.
 */
export function correction(localMs: number, expectedMs: number, canRate: boolean): Correction {
  const drift = localMs - expectedMs;
  const size = Math.abs(drift);
  if (size < 500) return { kind: 'none' };
  if (size <= 3000) return canRate ? { kind: 'rate', rate: drift > 0 ? 0.97 : 1.03 } : { kind: 'none' };
  return { kind: 'seek', to: expectedMs };
}

/**
 * While nudging the speed, carry on until properly caught up (within 100 ms) rather than
 * stopping at the 500 ms edge, so the speed doesn't flick between 1× and 1.03×.
 */
export function keepNudging(localMs: number, expectedMs: number, nudging: boolean): boolean {
  return nudging && Math.abs(localMs - expectedMs) > 100 && Math.abs(localMs - expectedMs) <= 3000;
}

/** What the player tells the room every couple of seconds. */
export interface PlayerReport {
  /** Where it is in the file (never a converted stream's own clock). */
  positionMS: number;
  state: 'playing' | 'paused' | 'waiting';
  ready: boolean;
}

/** The heartbeat's body: buffering is always unready (the handoff's rule). */
export function heartbeatBody(generation: number, r: PlayerReport) {
  return { generation, position_ms: Math.max(0, Math.round(r.positionMS)), state: r.state, ready: r.ready && r.state !== 'waiting' };
}

// --- Taking rooms from Arc ---

/** Whether a room from Arc replaces the one held: newer or the same revision (periodic snapshots refresh presence). */
export function newer(held: WatchRoom | null, room: WatchRoom): boolean {
  return !held || held.id !== room.id || room.revision >= held.revision;
}

export type Action = 'play' | 'pause' | 'seek' | 'change_item' | 'end';

/**
 * After a command was refused because the room changed (409), whether sending it again (once, with
 * the new revision) still does what the viewer asked. Play and Pause: only if the room isn't
 * already doing it. A seek or a new title: not if someone else moved the room meanwhile (a new
 * generation), so stale moves never replay. End: yes, unless it already ended.
 */
export function retryAfterConflict(action: Action, sentGeneration: number, room: WatchRoom): boolean {
  if (room.state === 'ended') return false;
  switch (action) {
    case 'play': return room.state === 'paused';
    case 'pause': return room.state !== 'paused';
    case 'seek':
    case 'change_item': return room.generation === sentGeneration;
    case 'end': return true;
  }
  return false;
}

/** Reconnecting the room's stream: 2 s, doubling to at most 30 s; a 429's Retry-After (1–600 s) wins. */
export function nextBackoff(current: number): number {
  return Math.min(Math.max(current * 2, 2000), 30000);
}
export function retryDelay(backoff: number, status: number, retryAfter: string | null): number {
  if (status === 429 && retryAfter) {
    const s = Number(retryAfter);
    if (s >= 1 && s <= 600) return s * 1000;
  }
  return backoff;
}

// --- What the player shows ---

/** The people still loading (not this TV, and not those who can't watch the title). */
export function waitingFor(room: WatchRoom): string[] {
  return room.participants.filter((p) => p.available && !p.ready && p.id !== room.self_id).map((p) => p.name);
}

/** Seconds left of the room's wait for slow viewers (at most ten), by this TV's estimate of Arc's clock. */
export function waitSeconds(room: WatchRoom, serverNow: number): number {
  if (room.state !== 'waiting' || !room.wait_until_ms) return 0;
  return Math.max(0, Math.ceil((room.wait_until_ms - serverNow) / 1000));
}

export function nameOf(room: WatchRoom, id?: string): string | undefined {
  return room.participants.find((p) => p.id === id)?.name;
}

export function hosting(room: WatchRoom): boolean {
  return !!room.host_id && room.host_id === room.self_id;
}

export function hostName(room: WatchRoom): string {
  return nameOf(room, room.host_id) ?? room.host_name ?? '';
}

export type Notice =
  | { kind: 'paused' | 'played' | 'moved'; name: string }
  | { kind: 'host'; name: string; you: boolean };

/**
 * A short note for a change someone else made: they paused, played or moved the room (a seek or
 * new title), or hosting passed to someone (the host left). Null for this TV's own changes,
 * heartbeats and nothing new.
 */
export function noticeFor(before: WatchRoom | null, after: WatchRoom): Notice | null {
  if (!before || before.id !== after.id || after.revision <= before.revision) return null;
  if (before.host_id && after.host_id && before.host_id !== after.host_id) {
    const you = after.host_id === after.self_id;
    return { kind: 'host', you, name: nameOf(after, after.host_id) ?? '' };
  }
  const by = after.changed_by;
  if (!by || by === after.self_id) return null;
  const name = nameOf(after, by);
  if (!name) return null;
  if (after.generation !== before.generation) return { kind: 'moved', name };
  if (after.state === 'paused' && before.state !== 'paused') return { kind: 'paused', name };
  if (after.state === 'playing' && before.state === 'paused') return { kind: 'played', name };
  return null;
}

/** The lobby shows until the room first plays, or not at all when it was already under way on joining. */
export function startedOnce(room: WatchRoom): boolean {
  if (typeof room.started === 'boolean') return room.started;
  return room.state !== 'paused' || room.position_ms > 0;
}

export type Status = 'unavailable' | 'watching' | 'ready' | 'loading';
export function statusOf(p: WatchParticipant): Status {
  if (!p.available) return 'unavailable';
  if (p.state === 'playing') return 'watching';
  if (p.ready) return 'ready';
  return 'loading';
}

/**
 * Where the player stands with the room: following it, the title isn't available to this
 * profile, or it's a different title (the room moved on and the next player is on its way).
 */
export function following(room: WatchRoom, itemId: string): 'follow' | 'unavailable' | 'elsewhere' {
  if (!room.available) return 'unavailable';
  return room.item_id === itemId ? 'follow' : 'elsewhere';
}
