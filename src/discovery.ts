import type { Discovered } from './api';

// Finds Arc servers on the TV's network. TV web apps can't send UDP broadcasts, so this asks
// every address in the TV's /24 for GET /api/v1/discover on Arc's default port, a few dozen at a
// time with short timeouts. Arc only answers that from the home network.

export const DEFAULT_PORT = 8099;

export interface FoundServer extends Discovered { url: string }

async function probe(url: string, timeoutMs: number): Promise<FoundServer | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/v1/discover`, { signal: ctrl.signal, credentials: 'omit' });
    if (!res.ok) return null;
    const body = (await res.json()) as Discovered;
    return body.product === 'arc' ? { ...body, url } : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Checks one address the person typed ("192.168.1.10", "arc.home:8099", "https://arc.example"). */
export function checkAddress(input: string): Promise<FoundServer | null> {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) url = 'http://' + url;
  if (!/:\d+$/.test(url.replace(/^https?:\/\//, '')) && url.startsWith('http://')) url += `:${DEFAULT_PORT}`;
  return probe(url, 5000);
}

/** Looks through the TV's subnet; calls onFound as servers answer. */
export async function scan(localIP: string, onFound: (s: FoundServer) => void, signal: AbortSignal): Promise<void> {
  const m = /^(\d+\.\d+\.\d+)\.(\d+)$/.exec(localIP);
  if (!m) return;
  const seen = new Set<string>();
  const hosts: string[] = [];
  for (let i = 1; i < 255; i++) if (String(i) !== m[2]) hosts.push(`${m[1]}.${i}`);
  const batch = 32;
  for (let i = 0; i < hosts.length && !signal.aborted; i += batch) {
    const found = await Promise.all(hosts.slice(i, i + batch).map((h) => probe(`http://${h}:${DEFAULT_PORT}`, 1200)));
    for (const s of found) {
      if (s && !seen.has(s.id)) {
        seen.add(s.id);
        onFound(s);
      }
    }
  }
}
