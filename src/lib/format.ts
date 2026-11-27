import type { AudioTrack, Item, MediaFile, MediaStream, Season } from '../api';
import { formatRuntime, t } from '../i18n';

// Names for codecs, picture and sound, as Arc's web app and the Android app write them.

const videoCodecs: Record<string, string> = { h264: 'H.264', hevc: 'HEVC', av1: 'AV1', vp9: 'VP9', mpeg2video: 'MPEG-2', mpeg4: 'MPEG-4', vc1: 'VC-1' };
const audioCodecs: Record<string, string> = {
  aac: 'AAC', ac3: 'Dolby Digital', eac3: 'Dolby Digital Plus', truehd: 'TrueHD', dts: 'DTS', mp3: 'MP3', flac: 'FLAC',
  opus: 'Opus', vorbis: 'Vorbis', pcm_s16le: 'PCM', pcm_s24le: 'PCM', alac: 'ALAC',
};

export const videoCodecName = (c?: string) => (c ? videoCodecs[c] ?? c.toUpperCase() : '');

export function audioCodecName(codec?: string, profile?: string): string {
  if (!codec) return '';
  const p = (profile ?? '').toLowerCase();
  if (codec === 'dts' && p.includes('ma')) return 'DTS-HD MA';
  if (codec === 'dts' && p.includes('x')) return 'DTS:X';
  if ((codec === 'truehd' || codec === 'eac3') && p.includes('atmos')) return `${audioCodecs[codec]} Atmos`;
  return audioCodecs[codec] ?? codec.toUpperCase();
}

/** "1 title", "4 titles". */
export const countLabel = (n: number) => (n === 1 ? t('library.countOne') : t('library.count', { n }));

export function channelsName(n?: number): string {
  if (!n) return '';
  if (n === 1) return t('player.mono');
  if (n === 2) return t('player.stereo');
  if (n === 6) return '5.1';
  if (n === 8) return '7.1';
  return t('player.channels', { n });
}

export function resolutionName(width = 0, height = 0): string {
  const h = Math.max(height, Math.round((width * 9) / 16));
  if (h >= 2000) return '4K';
  if (h >= 1000) return '1080p';
  if (h >= 700) return '720p';
  if (h >= 560) return '576p';
  if (h > 0) return '480p';
  return '';
}

export function hdrName(s?: MediaStream): string {
  if (!s) return '';
  if (s.dolby_vision) return 'Dolby Vision';
  if (s.hdr10_plus) return 'HDR10+';
  if (s.color_transfer === 'smpte2084') return 'HDR10';
  if (s.color_transfer === 'arib-std-b67') return 'HLG';
  return '';
}

export function bytes(n = 0): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} TB`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  return `${Math.round(n / 1e6)} MB`;
}

export function bitrate(bps = 0): string {
  return bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mb/s` : `${Math.round(bps / 1e3)} kb/s`;
}

export function kbpsName(kbps: number): string {
  return kbps >= 1000 ? `${kbps / 1000} Mbps` : `${kbps} kbps`;
}

// Language codes in any form ("fr", "fra", "fre", "fr-CA") as English names. TVs this old have no
// Intl.DisplayNames, so the common ones are listed.
const languages: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', sv: 'Swedish',
  no: 'Norwegian', nb: 'Norwegian', da: 'Danish', fi: 'Finnish', pl: 'Polish', cs: 'Czech', sk: 'Slovak', hu: 'Hungarian',
  ro: 'Romanian', el: 'Greek', tr: 'Turkish', ru: 'Russian', uk: 'Ukrainian', ar: 'Arabic', he: 'Hebrew', hi: 'Hindi',
  ja: 'Japanese', ko: 'Korean', zh: 'Chinese', th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', fa: 'Persian',
  bg: 'Bulgarian', hr: 'Croatian', sr: 'Serbian', sl: 'Slovenian', et: 'Estonian', lv: 'Latvian', lt: 'Lithuanian',
  is: 'Icelandic', ga: 'Irish', cy: 'Welsh', ca: 'Catalan', eu: 'Basque', gl: 'Galician', ta: 'Tamil', te: 'Telugu',
};
const threeToTwo: Record<string, string> = {
  eng: 'en', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de', spa: 'es', ita: 'it', por: 'pt', nld: 'nl', dut: 'nl', swe: 'sv',
  nor: 'no', nob: 'nb', dan: 'da', fin: 'fi', pol: 'pl', ces: 'cs', cze: 'cs', slk: 'sk', slo: 'sk', hun: 'hu', ron: 'ro',
  rum: 'ro', ell: 'el', gre: 'el', tur: 'tr', rus: 'ru', ukr: 'uk', ara: 'ar', heb: 'he', hin: 'hi', jpn: 'ja', kor: 'ko',
  zho: 'zh', chi: 'zh', tha: 'th', vie: 'vi', ind: 'id', msa: 'ms', may: 'ms', fas: 'fa', per: 'fa', bul: 'bg', hrv: 'hr',
  srp: 'sr', slv: 'sl', est: 'et', lav: 'lv', lit: 'lt', isl: 'is', ice: 'is', gle: 'ga', cym: 'cy', wel: 'cy', cat: 'ca',
  eus: 'eu', baq: 'eu', glg: 'gl', tam: 'ta', tel: 'te',
};

function langKey(code?: string): string {
  const base = (code ?? '').split(/[-_]/)[0].toLowerCase();
  return threeToTwo[base] ?? base;
}

export function sameLanguage(a?: string, b?: string): boolean {
  return !!a && !!b && langKey(a) === langKey(b);
}

export function languageName(code?: string): string {
  if (!code || code === 'und') return '';
  return languages[langKey(code)] ?? code;
}

export function audioTrackName(a: AudioTrack): string {
  return [languageName(a.language) || t('player.track', { n: a.index }), audioCodecName(a.codec), channelsName(a.channels)].filter(Boolean).join(' · ');
}

export function yearAndEdition(item: Item): string {
  return [item.year, item.kind === 'movie' ? item.edition : undefined].filter(Boolean).join(' · ');
}

/** The year, age rating, length and genres line under a title. */
export function detailsLine(it: Item, genres = 3): string {
  const parts: string[] = [];
  if (it.kind === 'episode') parts.push(episodeCode(it));
  parts.push(yearAndEdition(it));
  if (it.content_rating) parts.push(it.content_rating);
  if (it.runtime_min) parts.push(formatRuntime(it.runtime_min));
  parts.push(...(it.genres ?? []).slice(0, genres));
  return parts.filter(Boolean).join(' · ');
}

/** The web's labels for a title page: picture and main sound for one version, or how many versions. */
export function formatLabels(files: MediaFile[] = []): string[] {
  const present = files.filter((f) => !f.missing && (f.part ?? 0) <= 1);
  if (present.length > 1) return [t('details.versions', { n: present.length })];
  const f = present[0];
  if (!f?.streams) return [];
  const v = f.streams.find((s) => s.kind === 'video');
  const a = f.streams.find((s) => s.kind === 'audio');
  const out: string[] = [];
  const res = resolutionName(v?.width, v?.height);
  if (res === '4K') out.push('4K');
  const hdr = hdrName(v);
  if (hdr) out.push(hdr);
  if (a) out.push([audioCodecName(a.codec, a.profile), channelsName(a.channels)].filter(Boolean).join(' '));
  return out;
}

/** A quality capsule: the resolution filled white, the rest outlined, its parts split by a line ("AAC | 2.0"). */
export interface Capsule { parts: string[]; filled?: boolean }

const capsuleAudio: Record<string, string> = { eac3: 'DD+', ac3: 'DD', truehd: 'TrueHD', aac: 'AAC', flac: 'FLAC', opus: 'Opus', mp3: 'MP3' };

/**
 * A title's quality as Android's (and the Apple TV app's) capsules: "1080p", then "SDR" or its HDR
 * ("DV | HDR10"), then the audio ("AAC | 2.0", "DD+ | 5.1") and "Atmos". Several versions say how many.
 */
export function formatCapsules(files: MediaFile[] = []): Capsule[] {
  const present = files.filter((f) => !f.missing && (f.part ?? 0) <= 1);
  if (present.length > 1) return [{ parts: [t('details.versions', { n: present.length })] }];
  const f = present[0];
  if (!f?.streams) return [];
  const v = f.streams.find((x) => x.kind === 'video');
  const a = f.streams.find((x) => x.kind === 'audio');
  const out: Capsule[] = [];
  if (v) {
    const res = resolutionName(v.width, v.height);
    if (res) out.push({ parts: [res === '576p' || res === '480p' ? 'SD' : res], filled: true });
    const hdr: string[] = [];
    if (v.dolby_vision) hdr.push('DV');
    if (v.hdr10_plus) hdr.push('HDR10+');
    else if (v.color_transfer === 'smpte2084') hdr.push('HDR10');
    else if (v.color_transfer === 'arib-std-b67') hdr.push('HLG');
    out.push({ parts: hdr.length ? hdr : ['SDR'] });
  }
  if (a) {
    const p = (a.profile ?? '').toLowerCase();
    const codec = !a.codec ? '' : a.codec === 'dts' ? (p.includes('dts:x') ? 'DTS:X' : (a.profile ?? '').includes('MA') ? 'DTS-HD MA' : 'DTS') : capsuleAudio[a.codec] ?? a.codec.toUpperCase();
    const ch = !a.channels ? '' : a.channels === 1 ? '1.0' : a.channels === 2 ? '2.0' : a.channels === 6 ? '5.1' : a.channels === 8 ? '7.1' : `${a.channels}ch`;
    const parts = [codec, ch].filter(Boolean);
    if (parts.length) out.push({ parts });
    if (p.includes('atmos')) out.push({ parts: ['Atmos'] });
  }
  return out;
}

/** A title's versions to choose from: its files on disk (a multi-part file counts once). */
export function versionsOf(it: Item): MediaFile[] {
  return (it.files ?? []).filter((f) => !f.missing && (f.part ?? 0) <= 1);
}

/** A version's name (its edition, else its resolution) and what sets it apart, as the player's Version list. */
export function versionLabel(f: MediaFile): { name: string; detail: string } {
  const v = (f.streams ?? []).find((s) => s.kind === 'video');
  const res = resolutionName(v?.width, v?.height);
  const rest = [hdrName(v), videoCodecName(v?.codec), f.size ? bytes(f.size) : ''].filter(Boolean);
  return f.edition ? { name: f.edition, detail: [res, ...rest].filter(Boolean).join(' · ') } : { name: res || f.container?.toUpperCase() || '?', detail: rest.join(' · ') };
}

/** How long a title runs: its file's length, or the listed runtime. */
export function durationMs(it: Item): number {
  const f = (it.files ?? []).find((x) => !x.missing && (x.duration_ms ?? 0) > 0);
  return f?.duration_ms ?? (it.runtime_min ?? 0) * 60000;
}

export function resumeMs(it: Item): number {
  return it.user_data && !it.user_data.played ? it.user_data.position_ms ?? 0 : 0;
}

/**
 * The episode to carry on with: one part-way through, else the first not watched, specials last
 * (a show's Play, and the episode a show's Watch Together room starts on).
 */
export function nextEpisode(seasons: Season[]): Item | undefined {
  const ordered = seasons.filter((s) => s.season_number > 0).concat(seasons.filter((s) => s.season_number <= 0));
  const eps = ordered.reduce<Item[]>((all, s) => all.concat(s.episodes), []).filter((e) => e.available !== false);
  return eps.find((e) => resumeMs(e) > 0) ?? eps.find((e) => !e.user_data?.played) ?? eps[0];
}

export function watched(it: Item): boolean {
  return it.kind === 'series' ? it.unwatched_count === 0 : !!it.user_data?.played;
}

/**
 * An episode's number as every Arc app writes it: "S1 · E2", "Special 3" for season 0, "Season 1" (or
 * "Specials") without an episode number, or '' when the item doesn't say (GET /items/{id}).
 */
export function episodeCode(it: Item): string {
  if (it.season_number === undefined) return '';
  // An episode outside the show's episode order has no place in it (Arc sends 0 and 0): no code.
  if (it.season_number === 0 && it.episode_number === 0) return '';
  if (it.episode_number === undefined) return it.season_number === 0 ? t('details.specials') : t('details.season', { n: it.season_number });
  if (it.season_number === 0) return t('details.special', { n: it.episode_number });
  return t('details.episode', { season: it.season_number, episode: it.episode_number });
}

/**
 * An episode where it's the subject (the player, its page, episode lists, Up Next): its number, then
 * its title, "S1 · E4 · Pilot". Just the title when it has no number.
 */
export function episodeHeading(it: Item): string {
  return [it.episode_number !== undefined ? episodeCode(it) : '', it.title].filter(Boolean).join(' · ');
}
