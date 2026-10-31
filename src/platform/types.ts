// What the shared app needs from the TV it runs on. Each platform file (webos.ts, tizen.ts,
// browser.ts) exports one of these as default; the build picks the file (see vite.config.ts).

/** What the player can play, in the shape Arc's POST /api/v1/items/{id}/playback takes as `caps`. */
export interface PlayerCaps {
  containers: string[];
  video: string[];
  audio: string[];
  max_height?: number;
  max_bit_depth?: number;
  max_audio_channels?: number;
  /** null/absent: unspecified; [] means SDR only. Values: hdr10, hlg, hdr10_plus, dolby_vision. */
  hdr_formats?: string[];
  dolby_vision_profiles?: number[];
  video_profiles?: Record<string, string[]>;
  audio_passthrough?: string[];
}

export type PlayerEvent = 'playing' | 'paused' | 'waiting' | 'time' | 'ended' | 'error';

/** The TV's own video player: a <video> element on webOS, AVPlay on Tizen. Times are in ms. */
export interface NativePlayer {
  load(url: string, startMs: number): Promise<void>;
  play(): void;
  pause(): void;
  seek(ms: number): void;
  position(): number;
  duration(): number;
  paused(): boolean;
  on(listener: (event: PlayerEvent, detail?: string) => void): void;
  destroy(): void;
}

export type RemoteKey = 'back' | 'play' | 'pause' | 'playPause' | 'stop' | 'forward' | 'rewind';

export interface Platform {
  id: 'webos' | 'tizen' | 'browser';
  /** Sets up the platform: registers media keys, loads system libraries. */
  init(): Promise<void>;
  /** A name for this TV, shown in Arc's Settings > Devices (e.g. "LG OLED65C1"). */
  deviceName(): Promise<string>;
  /** The TV's IPv4 address on the home network, to look for Arc nearby; null when unknown. */
  localAddress(): Promise<string | null>;
  /** Maps a keydown's keyCode to a remote key the app handles itself (arrows/OK are Spotlight's). */
  remoteKey(keyCode: number): RemoteKey | null;
  /** What the TV's player can play. */
  caps(): Promise<PlayerCaps>;
  createPlayer(host: HTMLElement): NativePlayer;
  /** Leaves the app (Back on the first screen). */
  exit(): void;
}
