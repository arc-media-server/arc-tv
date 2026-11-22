import type { AuthStatus, Profile } from '../api';

/** Null means the household picker. A resumed document keeps the current profile. */
export function launchProfile(status: AuthStatus, automaticId: string | null, fresh: boolean): Profile | null {
  if (!fresh || status.friend) return status.profile;
  if (automaticId) return status.profiles.find((p) => p.id === automaticId && !p.has_pin) ?? null;
  const only = status.profiles.length === 1 ? status.profiles[0] : null;
  return only && !only.has_pin && only.id === status.profile?.id ? only : null;
}
