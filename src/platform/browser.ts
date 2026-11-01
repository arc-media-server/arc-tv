import Hls from 'hls.js';
import type { Platform, PlayerCaps } from './types';
import { videoPlayer } from './html5';

// Desktop Chrome, for building the UI quickly: arrow keys and Enter move focus like a remote,
// Escape or Backspace is Back, Space is play/pause. Converted streams play through hls.js.

const keys: Record<number, ReturnType<Platform['remoteKey']>> = { 27: 'back', 8: 'back', 32: 'playPause' };

function supported(type: string): boolean {
  return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
}

const browser: Platform = {
  id: 'browser',
  async init() {},
  async deviceName() {
    return 'Arc TV (browser)';
  },
  async localAddress() {
    return null;
  },
  remoteKey: (code) => keys[code] ?? null,
  async caps() {
    const caps: PlayerCaps = { containers: ['mp4', 'webm'], video: ['h264'], audio: ['aac', 'mp3'], max_height: 1080, hdr_formats: [] };
    if (supported('video/mp4; codecs="hvc1.1.6.L120.90"')) caps.video.push('hevc');
    if (supported('video/webm; codecs="vp9"')) caps.video.push('vp9');
    if (supported('video/mp4; codecs="av01.0.08M.08"')) caps.video.push('av1');
    if (supported('audio/webm; codecs="opus"')) caps.audio.push('opus');
    if (supported('audio/mp4; codecs="flac"')) caps.audio.push('flac');
    return caps;
  },
  createPlayer: (host) =>
    videoPlayer(host, (video, url) => {
      if (!/\.m3u8/.test(url) || !Hls.isSupported()) return null;
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      return () => hls.destroy();
    }),
  exit() {},
};

export default browser;
