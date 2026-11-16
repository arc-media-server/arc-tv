import { useEffect, useState } from 'react';
import { api, apiOrNull, type Capabilities, type Item, type PlayQueue, type Prefs } from '../api';

// Small shared stores, each a value plus listeners, so screens stay in step without a library.

function store<T>(initial: T) {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(v: T) { value = v; subs.forEach((s) => s(v)); },
    use(): T {
      const [v, setV] = useState(value);
      useEffect(() => { subs.add(setV); setV(value); return () => { subs.delete(setV); }; }, []);
      return v;
    },
  };
}

// --- Watched and Watchlist changes made in the app, shown at once on every card of that title ---

type Change = { played?: boolean; watchlisted?: boolean };
const changes = store<Record<string, Change>>({});

export function useChanges() { return changes.use(); }

/** An item as the profile's changes in this session have left it. */
export function withChanges(it: Item, all: Record<string, Change>): Item {
  const c = all[it.id];
  if (!c) return it;
  const ud = { played: false, ...it.user_data };
  if (c.played !== undefined) {
    ud.played = c.played;
    ud.position_ms = 0;
  }
  if (c.watchlisted !== undefined) ud.watchlisted = c.watchlisted;
  const unwatched = it.kind === 'series' && c.played !== undefined ? (c.played ? 0 : it.unwatched_count || undefined) : it.unwatched_count;
  return { ...it, user_data: ud, unwatched_count: unwatched };
}

function change(id: string, c: Change) { changes.set({ ...changes.get(), [id]: { ...changes.get()[id], ...c } }); }
function undo(id: string, prev: Change | undefined) {
  const next = { ...changes.get() };
  if (prev) next[id] = prev; else delete next[id];
  changes.set(next);
}

// --- Titles taken out of Continue Watching in this session, left off the row at once ---

const offContinue = store<Record<string, true>>({});
export function useOffContinue() { return offContinue.use(); }

/** Takes a title out of Continue Watching (and Up Next) without marking it watched, as the web's card menu. */
export async function removeFromContinue(it: Item) {
  offContinue.set({ ...offContinue.get(), [it.id]: true });
  try {
    await api(`/home/continue/${encodeURIComponent(it.id)}`, { method: 'DELETE' });
  } catch (e) {
    const next = { ...offContinue.get() };
    delete next[it.id];
    offContinue.set(next);
    throw e;
  }
}

/** Marks watched or not; shows at once, put back if Arc refuses. Throws so the caller can say so. */
export async function setPlayed(it: Item, played: boolean) {
  const prev = changes.get()[it.id];
  change(it.id, { played });
  try {
    await api(`/items/${encodeURIComponent(it.id)}/played`, { method: 'PUT', body: { played } });
  } catch (e) {
    undo(it.id, prev);
    throw e;
  }
}

/**
 * Marks one season of a show watched or not (Arc's played with season_number, in the profile's
 * episode order): its episodes show it at once and are put back if Arc refuses.
 */
export async function setSeasonPlayed(seriesId: string, seasonNumber: number, episodes: Item[], played: boolean) {
  const before = changes.get();
  const next = { ...before };
  for (const ep of episodes) next[ep.id] = { ...next[ep.id], played };
  changes.set(next);
  try {
    await api(`/items/${encodeURIComponent(seriesId)}/played`, { method: 'PUT', body: { played, season_number: seasonNumber } });
  } catch (e) {
    const back = { ...changes.get() };
    for (const ep of episodes) {
      if (before[ep.id]) back[ep.id] = before[ep.id]; else delete back[ep.id];
    }
    changes.set(back);
    throw e;
  }
}

export async function setWatchlist(it: Item, on: boolean) {
  const prev = changes.get()[it.id];
  change(it.id, { watchlisted: on });
  try {
    await api(`/items/${encodeURIComponent(it.id)}/watchlist`, { method: 'PUT', body: { on } });
  } catch (e) {
    undo(it.id, prev);
    throw e;
  }
}

/** Playing a title changes it on the server, so the app's own change no longer applies. */
export function clearChange(id: string) {
  if (changes.get()[id]) undo(id, undefined);
}

// --- The profile's preferences and the server's capabilities, read once per profile ---

let prefsP: Promise<Prefs> | null = null;
let capsP: Promise<Capabilities> | null = null;

export function prefs(): Promise<Prefs> {
  prefsP ??= api<Prefs>('/me/prefs').catch(() => { prefsP = null; return {} as Prefs; });
  return prefsP;
}

/** Saves only these preferences (e.g. audio_language). Failures are left quiet: the choice still applies now. */
export function savePrefs(p: Partial<Prefs>) {
  void api<Prefs>('/me/prefs', { method: 'PATCH', body: p }).then((all) => { prefsP = Promise.resolve(all); }, () => {});
}

export async function canUse(feature: string): Promise<boolean> {
  capsP ??= api<Capabilities>('/capabilities').catch(() => { capsP = null; return {}; });
  const f = (await capsP).features?.[feature];
  return !!f && f.supported && f.available && f.allowed;
}

/** Forgets everything kept for the profile (switching profile or signing out). */
export function resetProfile() {
  prefsP = null;
  capsP = null;
  changes.set({});
  queue.set(null);
  serverName.set('');
}

export const serverName = store('');

// --- Play queues: this TV and profile's queue on Arc (data/PlayQueues.kt in the Android app) ---

export const queue = store<PlayQueue | null>(null);
let chain: Promise<unknown> = Promise.resolve();

/** Calls run one at a time on the latest revision; a 409 reloads the queue and tries once more. */
function locked<T>(fn: () => Promise<T>): Promise<T | null> {
  const run = chain.then(async () => {
    if (!(await canUse('play_queues'))) return null;
    try {
      return await fn();
    } catch {
      return null;
    }
  });
  chain = run;
  return run;
}

async function edit(op: string, fields: Record<string, unknown> = {}): Promise<PlayQueue | null> {
  const q = queue.get();
  if (!q) return null;
  const send = (cur: PlayQueue) => api<PlayQueue>(`/play-queues/${encodeURIComponent(cur.id)}`, { method: 'PATCH', body: { revision: cur.revision, operation: op, ...fields } });
  let next: PlayQueue;
  try {
    next = await send(q);
  } catch (e) {
    if ((e as { status?: number }).status !== 409) throw e;
    const fresh = await apiOrNull<PlayQueue>('/play-queues/current');
    if (!fresh) return null;
    next = await send(fresh);
  }
  queue.set(next);
  return next;
}

export const queues = {
  refresh: () => locked(async () => { const q = await apiOrNull<PlayQueue>('/play-queues/current'); queue.set(q); return q; }),
  /** Starts a new queue of these titles (a show adds its episodes) or a playlist's, replacing the last one. */
  start: (from: string[] | { playlistId: string }) => locked(async () => {
    const q = queue.get();
    const what = Array.isArray(from) ? { item_ids: from } : { playlist_id: from.playlistId };
    const next = await api<PlayQueue>('/play-queues', { method: 'POST', body: { ...what, ...(q ? { replace_id: q.id, revision: q.revision } : {}) } });
    queue.set(next);
    return next;
  }),
  /** Play Next or Add to Queue; with no queue yet, starts one without playing. */
  add: (ids: string[], next: boolean) => locked(async () => {
    if (!queue.get()) {
      const q = await api<PlayQueue>('/play-queues', { method: 'POST', body: { item_ids: ids } });
      queue.set(q);
      return q;
    }
    return edit(next ? 'next' : 'append', { item_ids: ids });
  }),
  /** Moves on to an entry: advance when it's the next one, else select it. */
  moveTo: (entryId: string) => locked(async () => {
    const q = queue.get();
    if (!q) return null;
    const at = q.entries.findIndex((e) => e.id === q.current_entry_id);
    return edit(at >= 0 && q.entries[at + 1]?.id === entryId ? 'advance' : 'select', { entry_id: entryId });
  }),
  /** Mixes up what's still to come (the current entry stays where it is). */
  shuffle: () => locked(() => edit('shuffle')),
  /** Takes an entry out of the queue (not the one playing). */
  remove: (entryId: string) => locked(() => edit('remove', { entry_ids: [entryId] })),
  /** Moves an entry one place earlier (-1) or later (+1), staying after the one playing. */
  move: (entryId: string, by: -1 | 1) => locked(async () => {
    const q = queue.get();
    if (!q) return null;
    const ids = q.entries.map((e) => e.id);
    const at = ids.indexOf(entryId);
    const to = at + by;
    if (at < 0 || to <= ids.indexOf(q.current_entry_id) || to >= ids.length) return q;
    ids[at] = ids[to];
    ids[to] = entryId;
    return edit('reorder', { entry_ids: ids });
  }),
  /** A queue played to its end is deleted. */
  end: () => locked(async () => {
    const q = queue.get();
    if (q) await api(`/play-queues/${encodeURIComponent(q.id)}?revision=${q.revision}`, { method: 'DELETE' }).catch(() => {});
    queue.set(null);
    return null;
  }),
};

/** The first entry after the current one that can be played. */
export function nextInQueue(q: PlayQueue | null) {
  if (!q) return null;
  const at = q.entries.findIndex((e) => e.id === q.current_entry_id);
  return at < 0 ? null : q.entries.slice(at + 1).find((e) => e.available && e.item) ?? null;
}

/** The current entry and those after it that can be played (Home's Queue row). */
export function upcoming(q: PlayQueue | null) {
  if (!q) return [];
  const at = q.entries.findIndex((e) => e.id === q.current_entry_id);
  return at < 0 ? [] : q.entries.slice(at).filter((e) => e.available && e.item);
}
