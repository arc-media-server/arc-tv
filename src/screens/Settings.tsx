import { detailedLogging, setDetailedLogging } from '../lib/device-logs';
import { sendDeviceLogs } from '../lib/send-logs';
import { toast } from '../lib/toast';
// Live updates
import { useLiveRefresh } from '../lib/live-updates';
import { liveTopics } from '../lib/live-hints';
import { useActive } from '../lib/nav';
import { useEffect, useState } from 'react';
import { api, type AuthStatus, type Prefs, type Profile } from '../api';
import { automaticProfile, saveAutomaticProfile } from '../session';
import { Popover, PopoverItem } from '../components/Menu';
import { Scroller } from '../components/Scroller';
import { Container, Focusable } from '../components/spot';
import { t } from '../i18n';
import { languageName } from '../lib/format';
import { prefs as loadPrefs, savePrefs, setHideSpoilers } from '../lib/store';
import { START } from './Home';

// The profile's playback and subtitle choices (the same ones as the web's Settings, saved to the
// profile so every app follows them) and this TV's server, as a tvOS Settings list: a row per
// choice with its value on the right; OK flips a switch or opens the choices beside the row.

type Style = NonNullable<Prefs['subtitle_style']>;

/** Languages offered for audio and subtitles (ISO 639-2, as Arc stores them). */
const LANGUAGES = ['eng', 'fra', 'deu', 'spa', 'ita', 'por', 'nld', 'swe', 'nor', 'dan', 'fin', 'pol', 'ces', 'hun', 'ell', 'tur', 'rus', 'ukr', 'ara', 'heb', 'hin', 'jpn', 'kor', 'zho', 'tha', 'vie'];

interface Choice { value: string; label: string }
interface Picking { title: string; choices: Choice[]; current: string; pick: (v: string) => void }

function Row({ label, value, onClick, first }: { label: string; value: string; onClick: () => void; first?: boolean }) {
  return (
    <Focusable className="settings-row" onClick={onClick} data-default={first || undefined}>
      <span className="settings-label">{label}</span>
      <span className="settings-value">{value}</span>
    </Focusable>
  );
}

export function SettingsContent({ profile, serverName, onSwitchServer, onSignOut, onReady }: {
  profile: Profile | null;
  serverName: string;
  onSwitchServer: () => void;
  onSignOut: () => void;
  onReady: () => void;
}) {
  const active = useActive();
  const [detailed, setDetailed] = useState(detailedLogging);
  const [sendingLogs, setSendingLogs] = useState(false);
  useEffect(() => {
    if (!active) return;
    const update = () => setDetailed(detailedLogging());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  const [automaticId, setAutomaticId] = useState(automaticProfile);
  const [deviceProfile, setDeviceProfile] = useState(profile);
  const refreshDeviceProfile = () => {
    void api<AuthStatus>('/auth/status').then((status) => setDeviceProfile(status.profile ?? null), () => {});
  };
  useEffect(refreshDeviceProfile, [profile]);
  useLiveRefresh(liveTopics.prefs, active, refreshDeviceProfile);
  const automatic = !!deviceProfile && !deviceProfile.has_pin && automaticId === deviceProfile.id;
  const toggleAutomatic = () => {
    if (!deviceProfile || deviceProfile.has_pin) return;
    const id = automatic ? null : deviceProfile.id;
    if (saveAutomaticProfile(id)) setAutomaticId(id);
    else toast(t('settings.saveFailed'));
  };
  const [p, setP] = useState<Prefs | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  useEffect(() => {
    void loadPrefs().then((v) => { setP(v); onReady(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLiveRefresh(liveTopics.prefs, active && picking === null, () => { void loadPrefs().then(setP); });
  if (!p) return <div className="centered-fill"><div className="spinner" /></div>;

  const change = (next: Partial<Prefs>) => {
    setP({ ...p, ...next });
    savePrefs(next);
  };
  const style: Style = p.subtitle_style ?? {};
  const setStyle = (k: keyof Style, v: string) => change({ subtitle_style: { ...style, [k]: v } });
  const onOff = (on: boolean) => t(on ? 'settings.on' : 'settings.off');
  const pick = (title: string, choices: Choice[], current: string, done: (v: string) => void) =>
    setPicking({ title, choices, current, pick: (v) => { setPicking(null); done(v); } });
  const nameOf = (choices: Choice[], v: string) => (choices.find((c) => c.value === v) ?? choices[0]).label;

  const languages = (none: string): Choice[] => [{ value: '', label: none }, ...LANGUAGES.map((l) => ({ value: l, label: languageName(l) }))];
  const audioChoices = languages(t('settings.fileDefault'));
  const subtitleChoices = languages(t('settings.none'));
  const modes: Choice[] = [
    { value: '', label: t('settings.mode.last') },
    { value: 'foreign', label: t('settings.mode.foreign') },
    { value: 'always', label: t('settings.mode.always') },
    { value: 'manual', label: t('settings.mode.manual') },
  ];
  const sizes: Choice[] = ['medium', 'small', 'large', 'huge'].map((v) => ({ value: v, label: t(`settings.size.${v}` as 'settings.size.medium') }));
  const colors: Choice[] = ['white', 'yellow'].map((v) => ({ value: v, label: t(`settings.color.${v}` as 'settings.color.white') }));
  const backgrounds: Choice[] = ['box', 'solid', 'none'].map((v) => ({ value: v, label: t(`settings.background.${v}` as 'settings.background.box') }));
  const positions: Choice[] = ['bottom', 'top'].map((v) => ({ value: v, label: t(`settings.position.${v}` as 'settings.position.bottom') }));

  const choiceRow = (label: string, choices: Choice[], current: string, done: (v: string) => void, first?: boolean) => (
    <Row first={first} label={label} value={nameOf(choices, current)} onClick={() => pick(label, choices, current, done)} />
  );

  return (
    // As Android's: "Settings" centred at the top, who's watching on the left, the list on the right.
    <div className="settings">
      <h1 className="page-title settings-title" style={{ paddingLeft: START }}>{t('settings.title')}</h1>
      <div className="settings-side" style={{ left: START }}>
        {profile && <div className={`avatar settings-avatar color-${profile.color}`}>{profile.name.slice(0, 1).toUpperCase()}</div>}
        {profile && <div className="settings-name">{profile.name}</div>}
        {serverName && <div className="settings-server">{serverName}</div>}
      </div>
      <Scroller className="settings-page" pad={80}>
        <Container className="settings-list">
          <section data-section>
            <h2 className="settings-heading">{t('settings.playback')}</h2>
            <Row first label={t('settings.autoPlay')} value={onOff(p.auto_play !== false)} onClick={() => change({ auto_play: p.auto_play === false })} />
            <Row label={t('settings.autoSkip')} value={onOff(!!p.auto_skip)} onClick={() => change({ auto_skip: !p.auto_skip })} />
            {/* Theme music */}
            <Row label={t('settings.themeMusic')} value={onOff(p.theme_music !== false)} onClick={() => change({ theme_music: p.theme_music === false })} />
            <Row label={t('settings.hideSpoilers')} value={onOff(!!p.hide_spoilers)} onClick={() => { void setHideSpoilers(!p.hide_spoilers).then(setP, () => { console.warn('Arc: could not save spoiler preference'); toast(t('settings.saveFailed')); }); }} />
            <Row label={t('settings.showMissing')} value={onOff(!!p.show_missing_episodes)} onClick={() => change({ show_missing_episodes: !p.show_missing_episodes })} />
            {choiceRow(t('settings.audioLanguage'), audioChoices, p.audio_language ?? '', (v) => change({ audio_language: v }))}
          </section>
          <section data-section>
            <h2 className="settings-heading">{t('settings.subtitles')}</h2>
            {choiceRow(t('settings.subtitleMode'), modes, p.subtitle_mode ?? '', (v) => change({ subtitle_mode: v }))}
            {choiceRow(t('settings.subtitleLanguage'), subtitleChoices, p.subtitle_language ?? '', (v) => change({ subtitle_language: v }))}
            {choiceRow(t('settings.subtitleSize'), sizes, style.size ?? 'medium', (v) => setStyle('size', v))}
            {choiceRow(t('settings.subtitleColor'), colors, style.color ?? 'white', (v) => setStyle('color', v))}
            {choiceRow(t('settings.subtitleBackground'), backgrounds, style.background ?? 'box', (v) => setStyle('background', v))}
            {choiceRow(t('settings.subtitlePosition'), positions, style.position ?? 'bottom', (v) => setStyle('position', v))}
            <p className="settings-note">{t('settings.profileNote')}</p>
          </section>
          <section data-section>
            <h2 className="settings-heading">{t('settings.thisTv')}</h2>
            {deviceProfile && (
              <Focusable className="settings-row settings-row-described" role="switch" aria-checked={automatic}
                aria-disabled={deviceProfile.has_pin} onClick={toggleAutomatic} aria-label={t('settings.automaticSignIn')}
                aria-describedby="automatic-sign-in-description">
                <div className="settings-label">
                  {t('settings.automaticSignIn')}
                  <div className="settings-description" id="automatic-sign-in-description">
                    {deviceProfile.has_pin ? t('settings.automaticSignInPin') : t('settings.automaticSignInHint', { name: deviceProfile.name })}
                  </div>
                </div>
                <span className="settings-value">{onOff(automatic)}</span>
              </Focusable>
            )}
            <Row label={t('settings.server')} value={serverName} onClick={onSwitchServer} />
            <Row label={t('settings.signOut')} value="" onClick={onSignOut} />
            <p className="settings-note">{t('settings.serverNote')}</p>
            <Row label={t('diagnostics.detailed')} value={onOff(detailed)} onClick={() => {
              setDetailedLogging(!detailed);
              setDetailed(!detailed);
            }} />
            <Row label={t('diagnostics.send')} value={sendingLogs ? t('diagnostics.sending') : ''} onClick={() => {
              if (sendingLogs) return;
              setSendingLogs(true);
              void sendDeviceLogs().finally(() => setSendingLogs(false));
            }} />
            <p className="settings-note">{t('diagnostics.note')}</p>
          </section>
        </Container>
      </Scroller>
      {picking && (
        <Popover title={picking.title} onClose={() => setPicking(null)}>
          <Scroller className="popover-list" pad={24}>
            {picking.choices.map((c) => (
              <PopoverItem key={c.value} first={c.value === picking.current} icon={c.value === picking.current ? 'check' : ''} label={c.label} onClick={() => picking.pick(c.value)} />
            ))}
          </Scroller>
        </Popover>
      )}
    </div>
  );
}

