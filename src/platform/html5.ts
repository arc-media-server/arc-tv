import type { NativePlayer, PlayerEvent } from './types';

// A player on a <video> element. On webOS this element is backed by LG's native media pipeline,
// which opens MKV, MP4 and HLS itself. The browser build passes `attach` to add hls.js.
export function videoPlayer(host: HTMLElement, attach?: (video: HTMLVideoElement, url: string) => (() => void) | null): NativePlayer {
  let detach: (() => void) | null = null;
  const video = document.createElement('video');
  video.className = 'native-video';
  video.autoplay = false;
  host.appendChild(video);
  let listener: (event: PlayerEvent, detail?: string) => void = () => {};
  const forward: [string, PlayerEvent][] = [
    ['playing', 'playing'], ['pause', 'paused'], ['waiting', 'waiting'], ['timeupdate', 'time'], ['ended', 'ended'],
  ];
  for (const [dom, ev] of forward) video.addEventListener(dom, () => listener(ev));
  video.addEventListener('error', () => listener('error', video.error ? `media error ${video.error.code}` : 'media error'));
  return {
    load(url, startMs) {
      return new Promise((resolve, reject) => {
        const ready = () => {
          video.removeEventListener('loadedmetadata', ready);
          video.removeEventListener('error', failed);
          if (startMs > 0) video.currentTime = startMs / 1000;
          resolve();
        };
        const failed = () => {
          video.removeEventListener('loadedmetadata', ready);
          video.removeEventListener('error', failed);
          reject(new Error(video.error ? `media error ${video.error.code}` : 'media error'));
        };
        video.addEventListener('loadedmetadata', ready);
        video.addEventListener('error', failed);
        detach?.();
        detach = attach ? attach(video, url) : null;
        if (!detach) video.src = url;
      });
    },
    play: () => void video.play().catch(() => listener('error', 'play was refused')),
    pause: () => video.pause(),
    seek: (ms) => { video.currentTime = Math.max(0, ms / 1000); },
    position: () => Math.round(video.currentTime * 1000),
    duration: () => (Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0),
    paused: () => video.paused,
    buffered: () => (video.buffered.length ? Math.round(video.buffered.end(video.buffered.length - 1) * 1000) : 0),
    setSpeed: (rate) => { video.playbackRate = rate; },
    on: (l) => { listener = l; },
    destroy() {
      detach?.();
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    },
  };
}
