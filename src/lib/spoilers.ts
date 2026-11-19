import type { Item } from '../api';

/** Same profile rule as Arc web/Kodi: unstarted, unwatched episodes only. Never mutate API data. */
export function spoilerHidden(item: Item, hide: boolean): boolean {
  return hide && item.kind === 'episode' && !item.user_data?.played && !item.user_data?.position_ms;
}

export function spoilerSafeItem(item: Item, hide: boolean, series?: Item | null): Item {
  if (!spoilerHidden(item, hide)) return item;
  const images = item.images ?? {};
  const backdrop = images.series_backdrop || series?.images?.backdrop;
  const poster = images.series_primary || series?.images?.primary;
  return { ...item, overview: '', images: { ...images, primary: backdrop || poster,
    backdrop, series_backdrop: backdrop, series_primary: poster } };
}
