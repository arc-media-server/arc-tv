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

/** The picture's object URL once loaded; null while loading, and false when it couldn't load. */
export function useArtwork(path: string | undefined | null): string | null | false {
  const [url, setUrl] = useState<string | null | false>(null);
  useEffect(() => {
    setUrl(null);
    if (!path) { setUrl(false); return; }
    let live = true;
    load(path).then((u) => { if (live) setUrl(u); }, () => { if (live) setUrl(false); });
    return () => { live = false; };
  }, [path]);
  return url;
}

/**
 * Artwork over a quiet placeholder: the label (a title, initials) on a dark gradient, which is
 * what shows for titles Arc couldn't identify and while the picture loads.
 */
export function Artwork({ path, className = '', label, fit = 'cover' }: { path?: string | null; className?: string; label?: string; fit?: 'cover' | 'contain' }) {
  const url = useArtwork(path);
  return (
    <div className={`artwork ${className}`}>
      {label && !url && <div className="artwork-label">{label}</div>}
      {url && <img src={url} alt="" style={fit === 'contain' ? { objectFit: 'contain' } : undefined} />}
    </div>
  );
}
