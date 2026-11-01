import { createContext, useContext } from 'react';
import type { Extra, Item } from '../api';

// Moving between screens from anywhere (cards, menus, the player), without passing callbacks down.

export interface PlayOptions {
  /** This title's entry in the play queue, playing on through it. */
  entryId?: string;
  /** Auto-Play's next episode: it joins the end of the queue rather than starting a new one. */
  carryOn?: boolean;
  /** Replace the current screen (the player moving on to the next title). */
  replace?: boolean;
}

export interface Nav {
  /** A title's page; an episode opens its show on that episode's season, as Plex does. */
  open(item: Item): void;
  play(item: Item, startMs: number, opts?: PlayOptions): void;
  playExtra(extra: Extra): void;
  person(id: number): void;
  collection(id: string): void;
  back(): void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('no navigation');
  return nav;
}

/** Whether the screen is the one showing (screens under it stay mounted, hidden). */
export const ActiveContext = createContext(true);
export const useActive = () => useContext(ActiveContext);
