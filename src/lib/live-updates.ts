// Live updates: one stream per foreground profile, independent of screen/player lifetimes.
import { useEffect, useRef } from 'react';
import { serverURL } from '../api';
import { LiveUpdates, touches } from './live-hints';
import { invalidatePrefs } from './store';
const listeners = new Set<(topics: Set<string>) => void>();
export function useLiveUpdates(profile: string | undefined, enabled: boolean) {
  useEffect(() => {
    if (!profile || !enabled) return;
    const stream = new LiveUpdates(serverURL('/events'), localStorage.getItem('arc.token') ?? '', (topics) => {
      if (touches(topics, ['profile'])) invalidatePrefs();
      listeners.forEach((fn) => fn(topics));
    });
    const visibility = () => { if (document.visibilityState === 'hidden') stream.stop(); else stream.start(); };
    visibility(); document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); stream.stop(); };
  }, [profile, enabled]);
}
/** Inactive screens retain one dirty bit; safe screens refresh quietly when shown again. */
export function useLiveRefresh(wanted: readonly string[], active: boolean, refresh: () => void) {
  const state = useRef({ active, refresh, dirty: false });
  state.current.active = active; state.current.refresh = refresh;
  useEffect(() => {
    const fn = (topics: Set<string>) => {
      if (!touches(topics, wanted)) return;
      if (state.current.active) state.current.refresh(); else state.current.dirty = true;
    };
    listeners.add(fn); return () => { listeners.delete(fn); };
  }, [wanted]);
  useEffect(() => { if (active && state.current.dirty) { state.current.dirty = false; state.current.refresh(); } }, [active]);
}
