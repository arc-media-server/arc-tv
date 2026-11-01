import { useState } from 'react';
import type { PlayQueue } from '../api';
import { useNav } from './nav';
import { queues } from './store';
import { toast } from './toast';

// Play and Shuffle for a list of titles (a collection, a playlist): a new play queue, playing
// from its first entry. Shared so each page doesn't carry its own copy.

/** A copy of a list in a random order. */
export function shuffled<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const x = out[i]; out[i] = out[j]; out[j] = x;
  }
  return out;
}

/**
 * Starts a queue and plays its current entry; a shuffled start also mixes up what's after the
 * first (Arc adds a show's episodes in its place, in order, so they need mixing too).
 */
export function usePlayAll(failed: string) {
  const nav = useNav();
  const [starting, setStarting] = useState(false);
  const play = async (start: () => Promise<PlayQueue | null>, shuffle: boolean) => {
    if (starting) return;
    setStarting(true);
    try {
      let q = await start();
      if (q && shuffle) q = (await queues.shuffle()) ?? q;
      const first = q?.entries.find((e) => e.id === q!.current_entry_id && e.available && e.item);
      if (first?.item) nav.play(first.item, 0, { entryId: first.id });
      else toast(failed);
    } finally {
      setStarting(false);
    }
  };
  return play;
}
