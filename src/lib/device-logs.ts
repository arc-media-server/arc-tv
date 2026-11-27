const STORAGE = 'arc.deviceLogs';
const LIMIT = 3000;
const DETAIL_MS = 2 * 60 * 60 * 1000;
const events = [
  'app_started', 'profile_picker', 'automatic_sign_in', 'request_failed', 'request_timeout',
  'session_expired', 'playback_requested', 'playback_failed', 'crash_detected',
  'detailed_logging_enabled', 'detailed_logging_expired',
] as const;

type Event = typeof events[number];
type Level = 'debug' | 'info' | 'warn' | 'error';
type Entry = { time_ms: number; level: Level; event: Event };
type Saved = { entries: Entry[]; detailUntil: number; crash: boolean };

function entry(value: unknown): value is Entry {
  const v = value as Partial<Entry> | null;
  return !!v && typeof v.time_ms === 'number' && Number.isSafeInteger(v.time_ms) && v.time_ms > 0 &&
    !!v.level && ['debug', 'info', 'warn', 'error'].includes(v.level) &&
    !!v.event && events.includes(v.event);
}

function load(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
    return {
      entries: Array.isArray(value.entries) ? value.entries.filter(entry).slice(-LIMIT)
        .map(({ time_ms, level, event }: Entry) => ({ time_ms, level, event })) : [],
      detailUntil: typeof value.detailUntil === 'number' ? value.detailUntil : 0,
      crash: value.crash === true,
    };
  } catch {
    return { entries: [], detailUntil: 0, crash: false };
  }
}

let state = load();
let previousCrash = state.crash;
let pending: ReturnType<typeof setTimeout> | undefined;
let detailTimer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  clearTimeout(pending);
  pending = undefined;
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

export function detailedLogging() {
  return state.detailUntil > Date.now();
}

function scheduleExpiry() {
  clearTimeout(detailTimer);
  if (state.detailUntil) {
    detailTimer = setTimeout(() => {
      state.detailUntil = 0;
      recordDeviceEvent('info', 'detailed_logging_expired');
    }, Math.max(0, state.detailUntil - Date.now()));
  }
}

export function setDetailedLogging(enabled: boolean) {
  state.detailUntil = enabled ? Date.now() + DETAIL_MS : 0;
  if (enabled) recordDeviceEvent('info', 'detailed_logging_enabled');
  scheduleExpiry();
  flush();
}

export function recordDeviceEvent(level: Level, event: Event) {
  const value = { time_ms: Date.now(), level, event };
  if (!entry(value) || (level === 'debug' && !detailedLogging())) return;
  if (state.entries.length >= LIMIT) state.entries.shift();
  state.entries.push(value);
  if (pending === undefined) pending = setTimeout(flush, 1000);
}

export function deviceLogPayload() {
  return { platform: 'tv', entries: state.entries.slice() };
}

export function hasPreviousCrash() { return previousCrash; }

export function acknowledgeCrash() {
  if (!previousCrash) return;
  previousCrash = false;
  state.crash = false;
  flush();
}

export function clearDeviceLogs() {
  state = { entries: [], detailUntil: 0, crash: false };
  previousCrash = false;
  scheduleExpiry();
  flush();
}

export function installDeviceLogs() {
  recordDeviceEvent('info', 'app_started');
  scheduleExpiry();
  window.addEventListener('pagehide', flush);
  window.addEventListener('error', event => {
    if (!(event instanceof ErrorEvent)) return;
    state.crash = true;
    recordDeviceEvent('error', 'crash_detected');
    flush();
  });
}
