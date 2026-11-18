// Theme music: one quiet tune per page visit, matching Android's ThemeTune.
import { useEffect, useRef, useState } from 'react';
import { apiBlob, type Item } from '../api';
import { prefs } from './store';
import { fadeStep, themePath } from './themeMusicLogic';

export function useThemeMusic(id: string, item: Item | null, active: boolean) {
  const [themeOn, setThemeOn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const changed = () => { void prefs().then((p) => { if (live) setThemeOn(p.theme_music !== false); }); };
    changed();
    window.addEventListener('arc-prefs-invalidated', changed);
    return () => { live = false; window.removeEventListener('arc-prefs-invalidated', changed); };
  }, [active]);
  const visit = useRef({ id, played: false });
  if (visit.current.id !== id) visit.current = { id, played: false };
  useEffect(() => {
    if (!active || !item || themeOn !== true) return;
    const current = visit.current;
    let cancelled = false;
    let audio: HTMLAudioElement | null = null;
    let objectURL = '';
    let fade = 0;
    const release = () => {
      if (fade) window.clearInterval(fade);
      if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
      if (objectURL) URL.revokeObjectURL(objectURL);
      audio = null;
    };
    const fadeTo = (target: number) => {
      if (fade) window.clearInterval(fade);
      fade = window.setInterval(() => {
        if (!audio) return;
        audio.volume = fadeStep(audio.volume, target);
        if (audio.volume === target) {
          window.clearInterval(fade);
          if (!target) release();
        }
      }, 60);
    };
    const stop = () => { cancelled = true; if (audio) fadeTo(0); };
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    void prefs().then(async (p) => {
      const path = themePath(item, p.theme_music !== false);
      if (!path || cancelled || document.hidden || current.played) return;
      current.played = true;
      // Fetch with Bearer headers; the media element sees only a local blob URL.
      try {
        const blob = await apiBlob(path);
        if (cancelled) return;
        objectURL = URL.createObjectURL(blob);
        audio = new Audio(objectURL);
        audio.volume = 0;
        audio.loop = false;
        audio.onended = release;
        audio.onerror = release;
        await audio.play();
        if (!cancelled) fadeTo(0.25);
      } catch { release(); } // An unavailable tune leaves the page in silence.
    });
    return () => { document.removeEventListener('visibilitychange', hidden); stop(); };
  }, [id, item?.id, item?.theme_url, active, themeOn]);
}
