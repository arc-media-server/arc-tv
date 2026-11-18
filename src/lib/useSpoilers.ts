import { useEffect, useMemo, useState } from 'react';
import type { Item } from '../api';
import { prefs } from './store';
import { spoilerSafeItem } from './spoilers';

/** Conceal while loading so a slow preference request cannot flash a spoiler. */
export function useHideSpoilers(): boolean {
  const [hide, setHide] = useState(true);
  useEffect(() => {
    let live = true;
    let generation = 0;
    const read = () => {
      const current = ++generation;
      void prefs().then((p) => { if (live && current === generation) setHide(!!p.hide_spoilers); });
    };
    const invalidated = () => { setHide(true); read(); };
    read();
    window.addEventListener('arc-prefs-invalidated', invalidated);
    window.addEventListener('arc-prefs-changed', read);
    return () => { live = false; window.removeEventListener('arc-prefs-invalidated', invalidated); window.removeEventListener('arc-prefs-changed', read); };
  }, []);
  return hide;
}

export function useSpoilerItem<T extends Item | null | undefined>(item: T, series?: Item | null): T {
  const hide = useHideSpoilers();
  return useMemo(() => (item ? spoilerSafeItem(item, hide, series) : item) as T, [item, hide, series]);
}
