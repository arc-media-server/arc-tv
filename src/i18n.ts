import en from './locales/en.json';

// All UI text goes through t(), with English as the bundled catalog (same rule as Arc's web app).
// Other languages can be added as more catalogs once the TV app has a language picker.
export type Key = keyof typeof en;

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return (en[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));
}

/** A key that's chosen at runtime (e.g. "rec." + a row type), or null when the catalog lacks it. */
export function tMaybe(key: string, vars: Record<string, string | number> = {}): string | null {
  return key in en ? t(key as Key, vars) : null;
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? `${h}:` : '') + `${mm}:${String(sec).padStart(2, '0')}`;
}

export function formatRuntime(min: number): string {
  if (min < 60) return t('details.minutes', { n: min });
  return t('details.hoursMinutes', { h: Math.floor(min / 60), m: min % 60 });
}
