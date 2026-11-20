// Watch Together for the whole app (Android's ui/together/Together.kt, the web's
// WatchTogetherProvider): whether this server and profile may use it, and this TV's one room
// membership. Starting or joining a room sets the session; App then opens the player on the
// room's title (and moves it on when the room changes title). The player follows the room.

import { useEffect, useState } from 'react';
import { api, ApiError, enc, serverURL, type Item, type SeasonsResponse } from '../api';
import { nextEpisode, resumeMs } from './format';
import { RoomSession, type RoomEnd } from './room-session';
import { canUse } from './store';
import { normalizeCode, type ListedRoom, type WatchInvite, type WatchPerson, type WatchRoom } from './watch-together';

function store<T>(initial: T) {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(v: T) { value = v; subs.forEach((s) => s(v)); },
    subscribe(fn: (v: T) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
    use(): T {
      const [v, setV] = useState(value);
      useEffect(() => { subs.add(setV); setV(value); return () => { subs.delete(setV); }; }, []);
      return v;
    },
  };
}

/** The code to share for the room this TV made, and when it runs out (epoch ms). */
export interface RoomCode { roomId: string; code: string; expiresAtMs: number }

/** A room on Home's Watch Together row, with its title in full for the card's artwork (null until fetched, or if it can't be). */
export interface RoomEntry { room: ListedRoom; item: Item | null }

export const together = {
  /** This TV's membership, while it's in a room. */
  session: store<RoomSession | null>(null),
  /** The newest room seen (a copy for the screens; the session holds the same). */
  room: store<WatchRoom | null>(null),
  code: store<RoomCode | null>(null),
  /** How the last room ended for this TV (for the player's note), until the next one starts. */
  ended: store<RoomEnd | null>(null),
  /** Whether the room's stream is open (false while reconnecting). */
  connected: store(true),
  /** Rooms this profile made, was invited to or is in (GET /rooms): Home's Watch Together row. */
  rooms: store<RoomEntry[]>([]),
};

/** Whether this server has Watch Together and this profile may use it. */
export function canTogether(): Promise<boolean> {
  return canUse('watch_together');
}

export function useCanTogether(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => { void canTogether().then(setOk); }, []);
  return ok;
}

const log = (level: 'info' | 'warn', message: string) => (level === 'warn' ? console.warn(message) : console.info(message));
const statusOf = (e: unknown) => (e instanceof ApiError ? String(e.status) : (e as Error)?.name || 'error');

function deps() {
  return {
    call: <T,>(method: string, path: string, body?: unknown) => api<T>(`/watch-together${path}`, { method, body }),
    openStream(roomId: string) {
      const x = new XMLHttpRequest();
      x.open('GET', serverURL(`/watch-together/${enc(roomId)}/events`), true);
      x.setRequestHeader('Accept', 'text/event-stream');
      const token = localStorage.getItem('arc.token') ?? '';
      if (token) x.setRequestHeader('Authorization', `Bearer ${token}`);
      return x;
    },
    log,
  };
}

function begin(room: WatchRoom, fresh = false) {
  together.session.get()?.stop();
  together.ended.set(null);
  together.connected.set(true);
  let s: RoomSession;
  s = new RoomSession(room, deps(),
    (r) => { if (together.session.get() === s) together.room.set(r); },
    (why) => {
      if (together.session.get() !== s) return;
      together.session.set(null);
      together.code.set(null);
      together.ended.set(why);
      together.connected.set(true);
    },
    (on) => { if (together.session.get() === s) together.connected.set(on); },
    fresh);
  together.session.set(s);
  together.room.set(room); // App follows this to open the player
  s.start();
}

// A TV that slept or went to the background: the clock is measured again and the stream reopened.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') together.session.get()?.wake();
  });
}

/** A room with a code for a film or episode, from `startMs`; this TV joins it as host. */
export async function startRoom(item: Item, startMs: number): Promise<boolean> {
  await leaveRoom(); // one room at a time
  try {
    const invite = await api<WatchInvite>('/watch-together', { method: 'POST', body: { item_id: item.id, start_ms: Math.max(0, Math.round(startMs)) } });
    together.code.set({ roomId: invite.room.id, code: invite.invite_code, expiresAtMs: invite.invite_expires_at_ms });
    log('info', 'Arc: watch together: started a room');
    begin(invite.room, true);
    void refreshRooms();
    return true;
  } catch (e) {
    log('warn', `Arc: watch together: starting a room failed (${statusOf(e)})`);
    return false;
  }
}

/**
 * What a title's Watch Together starts on: a film or episode from its resume point; a show's
 * episode that Play would start (part-way through, else the next unwatched), as the handoff
 * says (a show can't be a room's title). Null: the show has nothing to watch.
 */
export async function roomTitle(item: Item): Promise<{ item: Item; startMs: number } | null> {
  if (item.kind !== 'series') return { item, startMs: resumeMs(item) };
  const s = await api<SeasonsResponse>(`/series/${enc(item.id)}/seasons`);
  const ep = nextEpisode((s.seasons ?? []).filter((x) => x.episodes && x.episodes.length));
  return ep ? { item: ep, startMs: resumeMs(ep) } : null;
}

export type JoinProblem = 'notFound' | 'tooMany' | 'failed';

/** Joins with a code the host shared; null when it worked. */
export async function joinRoom(code: string): Promise<JoinProblem | null> {
  await leaveRoom(); // one room at a time
  try {
    const room = await api<WatchRoom>('/watch-together/join', { method: 'POST', body: { code: normalizeCode(code) } });
    together.code.set(null);
    log('info', 'Arc: watch together: joined with a code');
    begin(room);
    void refreshRooms();
    return null;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    log('info', `Arc: watch together: joining with a code refused (${statusOf(e)})`);
    return status === 404 ? 'notFound' : status === 429 ? 'tooMany' : 'failed';
  }
}

/** On launch or a profile switch: this TV and profile's own room, if it's still in one (GET /current). */
export async function recoverRoom(): Promise<boolean> {
  if (together.session.get() || !(await canTogether())) return false;
  try {
    const room = await api<WatchRoom>('/watch-together/current');
    if (!room || !room.id || room.state === 'ended' || together.session.get()) return false;
    log('info', 'Arc: watch together: back in this profile\'s room');
    begin(room);
    return true;
  } catch {
    return false; // 404: not in a room (the usual case)
  }
}

/** Leaves the room (the others carry on). */
export async function leaveRoom() {
  const s = together.session.get();
  if (!s) return;
  together.session.set(null);
  together.code.set(null);
  together.room.set(null);
  together.ended.set(null);
  await s.leave();
  log('info', 'Arc: watch together: left the room');
  void refreshRooms();
}

/** Ends the room for everyone (host only). */
export async function endRoom(): Promise<boolean> {
  const s = together.session.get();
  if (!s) return false;
  try {
    await s.end();
    return true;
  } catch (e) {
    log('warn', `Arc: watch together: ending the room failed (${statusOf(e)})`);
    return false;
  }
}

/** A new code for the room this TV hosts. */
export async function renewCode(): Promise<boolean> {
  const s = together.session.get();
  if (!s) return false;
  try {
    const invite = await s.renew();
    together.code.set({ roomId: invite.room.id, code: invite.invite_code, expiresAtMs: invite.invite_expires_at_ms });
    return true;
  } catch (e) {
    log('warn', `Arc: watch together: a new code failed (${statusOf(e)})`);
    return false;
  }
}

/** A different profile (or signing out): this TV's membership doesn't carry over (Arc drops it after 30 s). */
export function resetTogether() {
  together.session.get()?.stop();
  together.session.set(null);
  together.room.set(null);
  together.code.set(null);
  together.ended.set(null);
  together.connected.set(true);
  together.rooms.set([]);
  items.clear();
}

// --- Invitations (Android's Together.invite/accept/dismiss, the web's invite picker and Home row) ---

/** Each listed room's title, fetched once for the card's artwork. */
const items = new Map<string, Item>();
let listing: Promise<void> | null = null;
let again = false;

/**
 * Reads the rooms list again: on Home, the Watch Together page, after this TV starts, joins or
 * leaves a room, and when Arc's `watch_together` hint says the list changed. A failure keeps
 * what's shown (the row is a convenience, not a page of its own).
 */
export function refreshRooms(): Promise<void> {
  if (listing) { again = true; return listing; }
  listing = (async () => {
    if (!(await canTogether())) { together.rooms.set([]); return; }
    try {
      const list = await api<{ rooms?: ListedRoom[] }>('/watch-together/rooms');
      const rooms = (list?.rooms ?? []).filter((r) => r && r.id && r.item && r.state !== 'ended');
      const entries = await Promise.all(rooms.map(async (room): Promise<RoomEntry> => {
        let item = items.get(room.item.id) ?? null;
        if (!item) {
          item = await api<Item>(`/items/${enc(room.item.id)}`).catch(() => null);
          if (item) items.set(room.item.id, item);
        }
        return { room, item };
      }));
      together.rooms.set(entries);
    } catch (e) {
      log('info', `Arc: watch together: the rooms list didn't load (${statusOf(e)})`);
    }
  })().finally(() => {
    listing = null;
    if (again) { again = false; void refreshRooms(); }
  });
  return listing;
}

/** Who this profile may invite to watch `itemId` (with whether each may play it); null when the list didn't load. */
export async function invitePeople(itemId?: string): Promise<WatchPerson[] | null> {
  try {
    const res = await api<{ people?: WatchPerson[] }>(`/watch-together/people${itemId ? `?item_id=${enc(itemId)}` : ''}`);
    return res?.people ?? [];
  } catch (e) {
    log('warn', `Arc: watch together: who to invite didn't load (${statusOf(e)})`);
    return null;
  }
}

export type InviteResult = 'done' | 'tooMany' | 'failed';

/**
 * A room for `item` made for the people chosen, as the web's and Android's Done: nobody's in it
 * yet, this profile included, and it waits on everyone's Home under Watch Together. The code that
 * comes with it is kept, so the lobby shows it if this TV joins as host.
 */
export async function inviteRoom(item: Item, startMs: number, profileIds: string[]): Promise<{ result: InviteResult; room?: ListedRoom }> {
  try {
    const made = await api<{ room: ListedRoom; invite_code?: string; invite_expires_at_ms?: number }>('/watch-together/rooms', {
      method: 'POST',
      body: { item_id: item.id, start_ms: Math.max(0, Math.round(startMs)), profile_ids: profileIds },
    });
    if (made.invite_code && !together.session.get()) together.code.set({ roomId: made.room.id, code: made.invite_code, expiresAtMs: made.invite_expires_at_ms ?? 0 });
    items.set(item.id, item);
    log('info', `Arc: watch together: made a room for ${profileIds.length} invited`);
    void refreshRooms();
    return { result: 'done', room: made.room };
  } catch (e) {
    log('warn', `Arc: watch together: inviting failed (${statusOf(e)})`);
    return { result: e instanceof ApiError && e.status === 429 ? 'tooMany' : 'failed' };
  }
}

/** Invites more people to the room this TV hosts (the lobby's and the panel's Invite People…). */
export async function inviteMore(profileIds: string[]): Promise<InviteResult> {
  const s = together.session.get();
  if (!s) return 'failed';
  try {
    await s.inviteMore(profileIds);
    log('info', `Arc: watch together: invited ${profileIds.length} more`);
    return 'done';
  } catch (e) {
    log('warn', `Arc: watch together: inviting more failed (${statusOf(e)})`);
    return 'failed';
  }
}

/** Join (or Return to) a room from the list, without a code; false if Arc refused. */
export async function acceptRoom(roomId: string): Promise<boolean> {
  const current = together.session.get();
  if (current && current.room.id === roomId) {
    together.room.set(current.room); // Return: App reopens the player on it
    return true;
  }
  await leaveRoom(); // one room at a time
  try {
    const room = await api<WatchRoom>(`/watch-together/rooms/${enc(roomId)}/join`, { method: 'POST' });
    const code = together.code.get();
    if (code && code.roomId !== roomId) together.code.set(null);
    log('info', 'Arc: watch together: joined a room from the list');
    // A room this profile made and nobody has started yet keeps its lobby, as one started here.
    begin(room, room.host_id === room.self_id);
    void refreshRooms();
    return true;
  } catch (e) {
    log('warn', `Arc: watch together: joining a room failed (${statusOf(e)})`);
    void refreshRooms();
    return false;
  }
}

/** Declines an invitation, or (its maker) cancels the room for everyone. */
export async function dismissRoom(roomId: string): Promise<boolean> {
  let ok = true;
  try {
    await api(`/watch-together/rooms/${enc(roomId)}/dismiss`, { method: 'POST' });
    log('info', 'Arc: watch together: declined or cancelled a room');
  } catch (e) {
    ok = false;
    log('warn', `Arc: watch together: declining failed (${statusOf(e)})`);
  }
  if (ok) together.rooms.set(together.rooms.get().filter((r) => r.room.id !== roomId));
  void refreshRooms();
  return ok;
}
