import { useEffect, useState } from 'react';
import { apiBlob } from '../api';

// Arc's artwork needs the sign-in token, which an <img> can't send, so pictures are fetched with
// the token and shown from object URLs. Kept in a small cache; the oldest are released.

const cache = new Map<string, Promise<string>>();
const LIMIT = 300;

function load(path: string): Promise<string> {
  let hit = cache.get(path);
  if (hit) {
    cache.delete(path);
    cache.set(path, hit);
    return hit;
  }
  hit = apiBlob(path).then((b) => URL.createObjectURL(b));
  hit.catch(() => cache.delete(path));
  cache.set(path, hit);
  while (cache.size > LIMIT) {
    const [oldest, url] = cache.entries().next().value as [string, Promise<string>];
    cache.delete(oldest);
    void url.then((u) => URL.revokeObjectURL(u), () => {});
  }
  return hit;
}

export function useArtwork(path: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!path) return;
    let live = true;
    load(path).then((u) => { if (live) setUrl(u); }, () => {});
    return () => { live = false; };
  }, [path]);
  return url;
}

export function Artwork({ path, className, alt = '' }: { path?: string; className?: string; alt?: string }) {
  const url = useArtwork(path);
  return url ? <img className={className} src={url} alt={alt} /> : <div className={`${className ?? ''} artwork-empty`} />;
}
