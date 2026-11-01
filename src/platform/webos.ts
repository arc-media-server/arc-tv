import type { Platform, PlayerCaps } from './types';
import { videoPlayer } from './html5';

// LG webOS. Apps are web apps; system services ("Luna") are called through PalmServiceBridge,
// which is what LG's webOSTV.js wraps. The <video> element uses LG's native media pipeline.

declare global {
  interface Window {
    PalmServiceBridge?: new () => { onservicecallback: (msg: string) => void; call(uri: string, params: string): void; cancel(): void };
  }
}

function luna<T>(uri: string, params: object = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const Bridge = window.PalmServiceBridge;
    if (!Bridge) return reject(new Error('not on webOS'));
    const bridge = new Bridge();
    const timer = window.setTimeout(() => reject(new Error(`${uri} timed out`)), 5000);
    bridge.onservicecallback = (msg) => {
      window.clearTimeout(timer);
      try {
        const out = JSON.parse(msg);
        if (out.returnValue === false) reject(new Error(out.errorText || uri));
        else resolve(out as T);
      } catch (e) {
        reject(e as Error);
      }
    };
    bridge.call(uri, JSON.stringify(params));
  });
}

interface SystemInfo { modelName?: string; sdkVersion?: string; UHD?: string | boolean }
let info: SystemInfo | null = null;

async function systemInfo(): Promise<SystemInfo> {
  if (!info) {
    info = await luna<SystemInfo>('luna://com.webos.service.tv.systemproperty/getSystemInfo', { keys: ['modelName', 'sdkVersion', 'UHD'] })
      .catch(() => ({}));
  }
  return info;
}

// LG remote key codes.
const keys: Record<number, ReturnType<Platform['remoteKey']>> = {
  461: 'back', 415: 'play', 19: 'pause', 413: 'stop', 417: 'forward', 412: 'rewind',
};

const webos: Platform = {
  id: 'webos',
  async init() {
    await systemInfo();
  },
  async deviceName() {
    const { modelName } = await systemInfo();
    return modelName ? `LG ${modelName}` : 'LG TV';
  },
  async localAddress() {
    type Iface = { state?: string; ipAddress?: string };
    const status = await luna<{ wired?: Iface; wifi?: Iface }>('luna://com.webos.service.connectionmanager/getStatus').catch(() => null);
    for (const iface of [status?.wired, status?.wifi]) {
      if (iface?.state === 'connected' && iface.ipAddress) return iface.ipAddress;
    }
    return null;
  },
  remoteKey: (code) => keys[code] ?? null,
  async caps() {
    // webOS major version from the SDK: 4 = 2018–2019 (4.5 on the C9/B9), 5 = 2020, 6 = 2021, 7 = webOS 22, 8 = webOS 23, 9 = webOS 24.
    // A starting table from LG's published specs; to be checked on real TVs (#135).
    const { sdkVersion, UHD } = await systemInfo();
    const major = parseInt(sdkVersion ?? '0', 10) || 0;
    const uhd = UHD === true || UHD === 'true';
    const caps: PlayerCaps = {
      containers: ['mp4', 'mkv', 'webm'],
      video: ['h264', 'hevc', 'vp9'],
      audio: ['aac', 'mp3', 'ac3', 'eac3', 'flac', 'opus', 'vorbis'],
      audio_passthrough: ['ac3', 'eac3'],
      max_height: uhd ? 2160 : 1080,
      max_bit_depth: uhd ? 10 : 8,
      // Dolby Vision stays off until a real LG TV shows it plays Arc's files properly.
      hdr_formats: uhd ? ['hdr10', 'hlg'] : [],
    };
    if (major >= 6) caps.video.push('av1');
    // LG dropped DTS from 2020 to 2022 models and brought it back in 2023.
    if (major >= 8 || (major > 0 && major <= 4)) caps.audio.push('dts');
    return caps;
  },
  createPlayer: (host) => videoPlayer(host),
  exit() {
    window.close();
  },
};

export default webos;
