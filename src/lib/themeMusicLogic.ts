// Theme music: pure decisions shared by the player and its tests.
import type { Item } from '../api';

/** Only Arc's theme route may receive the signed-in binary request. */
export function themePath(item: Item | null, enabled: boolean): string | null {
  if (!enabled || !item || (item.kind !== 'movie' && item.kind !== 'series')) return null;
  const path = item.theme_url ?? '';
  return /^\/api\/(?:v1\/)?items\/[a-f0-9]+\/theme(?:\?v=[A-Za-z0-9._-]+)?$/.test(path) ? path : null;
}

export function fadeStep(now: number, target: number): number {
  return Math.abs(target - now) <= 0.02 ? target : now + (target > now ? 0.02 : -0.02);
}
