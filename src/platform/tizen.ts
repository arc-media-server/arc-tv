import type { NativePlayer, Platform, PlayerCaps, PlayerEvent } from './types';

// Samsung Tizen. Video plays through AVPlay (webapis.avplay), Samsung's native player, which
// opens MKV and HLS and handles HDR and multi-channel audio; <video> loses those. The TV provides
// webapis.js (added to index.html by the tizen build) and the tizen global.

interface AVPlay {
  open(url: string): void;
  close(): void;
  prepareAsync(ok: () => void, fail: (e: unknown) => void): void;
  play(): void;
  pause(): void;
  stop(): void;
  seekTo(ms: number, ok?: () => void, fail?: (e: unknown) => void): void;
  getCurrentTime(): number;
  getDuration(): number;
  getState(): 'NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED';
  setDisplayRect(x: number, y: number, w: number, h: number): void;
  setDisplayMethod(method: string): void;
  setListener(l: Record<string, (...args: unknown[]) => void>): void;
}

declare global {
  interface Window {
    webapis?: {
      avplay: AVPlay;
      network?: { getIp(): string };
      productinfo?: { getRealModel?(): string; getModel?(): string; isUdPanelSupported?(): boolean; getFirmware?(): string };
    };
    tizen?: {
      tvinputdevice: { registerKey(name: string): void; getKey(name: string): { code: number } | null };
      application: { getCurrentApplication(): { exit(): void } };
      systeminfo?: { getCapability(key: string): string };
    };
  }
}

const mediaKeys: [string, ReturnType<Platform['remoteKey']>][] = [
  ['MediaPlayPause', 'playPause'], ['MediaPlay', 'play'], ['MediaPause', 'pause'], ['MediaStop', 'stop'],
  ['MediaFastForward', 'forward'], ['MediaRewind', 'rewind'],
];
const keys: Record<number, ReturnType<Platform['remoteKey']>> = { 10009: 'back' };

function platformVersion(): number {
  try {
    return parseFloat(window.tizen?.systeminfo?.getCapability('http://tizen.org/feature/platform.version') ?? '0') || 0;
  } catch {
    return 0;
  }
}

function avPlayer(host: HTMLElement): NativePlayer {
  const av = window.webapis!.avplay;
  const surface = document.createElement('object');
  surface.type = 'application/avplayer';
  surface.className = 'native-video';
  host.appendChild(surface);
  let listener: (event: PlayerEvent, detail?: string) => void = () => {};
  let duration = 0;
  av.setListener({
    onbufferingstart: () => listener('waiting'),
    onbufferingcomplete: () => listener(av.getState() === 'PAUSED' ? 'paused' : 'playing'),
    oncurrentplaytime: () => listener('time'),
    onstreamcompleted: () => listener('ended'),
    onerror: (e) => listener('error', String(e)),
  });
  return {
    load(url, startMs) {
      return new Promise((resolve, reject) => {
        try {
          av.open(url);
          // The app is laid out at 1920x1080, which is the coordinate space AVPlay uses too.
          av.setDisplayRect(0, 0, 1920, 1080);
          av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
          return;
        }
        av.prepareAsync(() => {
          duration = av.getDuration();
          if (startMs > 0) av.seekTo(startMs, resolve, () => resolve());
          else resolve();
        }, (e) => reject(new Error(String(e))));
      });
    },
    play() {
      av.play();
      listener('playing');
    },
    pause() {
      av.pause();
      listener('paused');
    },
    seek: (ms) => av.seekTo(Math.max(0, Math.round(ms))),
    position: () => av.getCurrentTime(),
    duration: () => duration || av.getDuration(),
    paused: () => av.getState() !== 'PLAYING',
    on: (l) => { listener = l; },
    destroy() {
      try {
        av.stop();
        av.close();
      } catch { /* already closed */ }
      surface.remove();
    },
  };
}

const tizen: Platform = {
  id: 'tizen',
  async init() {
    const input = window.tizen?.tvinputdevice;
    if (!input) return;
    for (const [name, key] of mediaKeys) {
      try {
        input.registerKey(name);
        const code = input.getKey(name)?.code;
        if (code) keys[code] = key;
      } catch { /* this remote has no such key */ }
    }
  },
  async deviceName() {
    const p = window.webapis?.productinfo;
    const model = p?.getRealModel?.() || p?.getModel?.();
    return model ? `Samsung ${model}` : 'Samsung TV';
  },
  async localAddress() {
    try {
      return window.webapis?.network?.getIp() || null;
    } catch {
      return null;
    }
  },
  remoteKey: (code) => keys[code] ?? null,
  async caps() {
    // Tizen 5.5 = 2020, 6.0 = 2021, 6.5 = 2022, 7.0 = 2023, 8.0 = 2024. A starting table from
    // Samsung's published specs; to be checked on real TVs (#135). Samsung has no Dolby Vision.
    const version = platformVersion();
    let uhd = true;
    try {
      uhd = window.webapis?.productinfo?.isUdPanelSupported?.() ?? true;
    } catch { /* assume UHD */ }
    const caps: PlayerCaps = {
      containers: ['mp4', 'mkv', 'webm'],
      video: ['h264', 'hevc', 'vp9'],
      audio: ['aac', 'mp3', 'ac3', 'eac3', 'flac', 'opus', 'vorbis'],
      audio_passthrough: ['ac3', 'eac3'],
      max_height: uhd ? 2160 : 1080,
      max_bit_depth: uhd ? 10 : 8,
      hdr_formats: uhd ? ['hdr10', 'hlg', 'hdr10_plus'] : [],
    };
    if (version >= 6) caps.video.push('av1');
    return caps;
  },
  createPlayer: (host) => avPlayer(host),
  exit() {
    window.tizen?.application.getCurrentApplication().exit();
  },
};

export default tizen;
