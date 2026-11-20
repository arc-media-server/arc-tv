import { Spotlight } from '@enact/spotlight';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type Library, type Prefs, type Profile } from '../api';
import { Icon } from '../components/Icon';
import { Container, EntryContainer, Focusable } from '../components/spot';
import { t } from '../i18n';
import { useBack } from '../lib/back';
import { orderLibraries } from '../lib/home';
import { useActive } from '../lib/nav';
import { prefs as loadPrefs } from '../lib/store';
import { HomeContent } from './Home';
import { LibraryContent, WatchlistContent } from './Library';
import { PlaylistsContent } from './Playlists';
import { SearchContent } from './Search';
import { SettingsContent } from './Settings';
import { TogetherContent } from './Together';
import { useCanTogether } from '../lib/together';

// Live updates
import { useLiveRefresh } from '../lib/live-updates';
import { liveTopics } from '../lib/live-hints';

// The main screen, as the Android app's BrowseScreen: a rail down the left (Search, Home, the
// libraries with the Watchlist where the profile put it, Playlists and Watch Together after them, and the profile at the bottom) that opens
// into labels when it has the focus, and the chosen section beside it.

export type Section = { kind: 'home' } | { kind: 'search' } | { kind: 'watchlist' } | { kind: 'playlists' } | { kind: 'together' } | { kind: 'settings' } | { kind: 'library'; id: number; genre?: string; fromSearch?: boolean };

const same = (a: Section, b: Section) => a.kind === b.kind && (a.kind !== 'library' || a.id === (b as { id: number }).id);

export function ArcLogo({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="arc-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fdccd" />
          <stop offset="1" stopColor="#0b7d72" />
        </linearGradient>
      </defs>
      <path d="M5 24a11 11 0 0 1 22 0" fill="none" stroke="url(#arc-logo)" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="16" cy="24" r="2.6" fill="url(#arc-logo)" />
    </svg>
  );
}

export function Avatar({ profile, size = 44 }: { profile: Profile; size?: number }) {
  return (
    <div className={`avatar color-${profile.color}`} style={{ width: size, height: size, fontSize: size * 0.5, marginBottom: 0 }}>
      {profile.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export const libraryIcon = (lib: Library) => (lib.kind === 'shows' ? 'tv' : lib.kind === 'videos' ? 'clapper' : 'film');

function SidebarItem({ icon, label, extra, selected, onClick }: { icon: ReactNode; label: string; extra?: ReactNode; selected: boolean; onClick: () => void }) {
  return (
    <Focusable className={`side-item${selected ? ' selected' : ''}`} data-default={selected || undefined} onClick={onClick}>
      <span className="side-icon">{icon}</span>
      <span className="side-label">{label}</span>
      {extra && <span className="side-extra">{extra}</span>}
    </Focusable>
  );
}

/** The time, in the TV's own format, as the Apple TV app shows it by the profile. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 20000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>;
}

interface Frame { libraries: Library[]; watchlistAt: number }

export function Browse({ profile, canSwitchProfile, serverName, onSwitchProfile, onSwitchServer, onSignOut }: {
  profile: Profile | null;
  canSwitchProfile: boolean;
  serverName: string;
  onSwitchProfile: () => void;
  onSwitchServer: () => void;
  onSignOut: () => void;
}) {
  const active = useActive();
  const [section, setSection] = useState<Section>({ kind: 'home' });
  const [frame, setFrame] = useState<Frame | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  // Coming back from a title or the player: what's shown is loaded again, quietly.
  const [visits, setVisits] = useState(0);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const canTogether = useCanTogether();

  const load = useCallback(() => {
    setError('');
    Promise.all([api<Library[]>('/libraries'), loadPrefs()]).then(([libs, p]) => {
      const libraries = orderLibraries(libs, p.library_order);
      setPrefs(p);
      setFrame({ libraries, watchlistAt: Math.max(0, Math.min(p.watchlist_position ?? 0, libraries.length)) });
    }, (e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);
  // Live updates: defer library grids/search until the user leaves them.
  useLiveRefresh(liveTopics.home, active && section.kind !== 'library' && section.kind !== 'search', () => {
    // One result commit per batch keeps Home from starting duplicate row requests.
    Promise.all([api<Library[]>('/libraries'), loadPrefs()]).then(([libs, p]) => {
      const libraries = orderLibraries(libs, p.library_order);
      setPrefs(p);
      setFrame({ libraries, watchlistAt: Math.max(0, Math.min(p.watchlist_position ?? 0, libraries.length)) });
      setVisits((v) => v + 1);
    }, () => {});
  });

  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setVisits((v) => v + 1);
  }

  // Back goes Home, or from a genre opened in Search, back to Search's results.
  useBack(() => { setSection(section.kind === 'library' && section.fromSearch ? { kind: 'search' } : { kind: 'home' }); }, active && section.kind !== 'home');

  const show = (s: Section) => {
    if (same(s, section)) {
      Spotlight.focus('browse-content');
      return;
    }
    setSection(s);
  };

  /** A section's first things to focus have arrived: the focus moves into it (once per visit). */
  const ready = useCallback(() => {
    window.setTimeout(() => {
      const cur = Spotlight.getCurrent() as HTMLElement | null;
      const content = document.querySelector('[data-spotlight-id="browse-content"]');
      if (cur && content && content.contains(cur)) return;
      Spotlight.focus('browse-content');
    }, 0);
  }, []);

  if (error) {
    return (
      <div className="screen centered">
        <p className="error">{error}</p>
        <Focusable className="btn" data-default onClick={load}>{t('common.retry')}</Focusable>
      </div>
    );
  }
  if (!frame || !prefs) return <div className="screen centered"><p className="muted">{t('common.loading')}</p></div>;

  const watchlist = <SidebarItem key="watchlist" icon={<Icon name="bookmark" />} label={t('nav.watchlist')} selected={section.kind === 'watchlist'} onClick={() => show({ kind: 'watchlist' })} />;
  const items: ReactNode[] = [];
  frame.libraries.forEach((lib, i) => {
    if (i === frame.watchlistAt) items.push(watchlist);
    items.push(<SidebarItem key={lib.id} icon={<Icon name={libraryIcon(lib)} />} label={lib.name} selected={section.kind === 'library' && section.id === lib.id} onClick={() => show({ kind: 'library', id: lib.id })} />);
  });
  if (frame.watchlistAt >= frame.libraries.length) items.push(watchlist);

  const lib = section.kind === 'library' ? frame.libraries.find((l) => l.id === section.id) : undefined;
  return (
    <div className="screen browse">
      <Container spotlightId="browse-content" className="browse-content">
        {section.kind === 'home' && <HomeContent prefs={prefs} libraries={frame.libraries} visits={visits} onReady={ready} />}
        {section.kind === 'search' && <SearchContent onReady={ready} onGenre={(g) => setSection({ kind: 'library', id: g.library_id, genre: g.name, fromSearch: true })} />}
        {section.kind === 'watchlist' && <WatchlistContent visits={visits} onReady={ready} />}
        {section.kind === 'playlists' && <PlaylistsContent visits={visits} onReady={ready} />}
        {section.kind === 'together' && <TogetherContent onReady={ready} />}
        {section.kind === 'settings' && <SettingsContent serverName={serverName} onSwitchServer={onSwitchServer} onSignOut={onSignOut} onReady={ready} />}
        {lib && <LibraryContent key={`${lib.id}:${section.kind === 'library' ? section.genre ?? '' : ''}`} library={lib} genre={section.kind === 'library' ? section.genre : undefined} visits={visits} onReady={ready} />}
      </Container>
      <EntryContainer
        className={`sidebar${open ? ' open' : ''}`}
        onFocus={() => setOpen(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}
      >
        {/* As the Apple TV app: who's watching (and the time) at the top, then the sections. */}
        {profile && canSwitchProfile && (
          <SidebarItem icon={<Avatar profile={profile} size={36} />} label={profile.name} extra={<Clock />} selected={false} onClick={onSwitchProfile} />
        )}
        {!canSwitchProfile && <SidebarItem icon={<Icon name="out" />} label={t('nav.signOut')} extra={<Clock />} selected={false} onClick={onSignOut} />}
        <div className="side-gap" />
        <SidebarItem icon={<Icon name="search" />} label={t('nav.search')} selected={section.kind === 'search'} onClick={() => show({ kind: 'search' })} />
        <SidebarItem icon={<Icon name="home" />} label={t('nav.home')} selected={section.kind === 'home'} onClick={() => show({ kind: 'home' })} />
        {items}
        <SidebarItem icon={<Icon name="playlist" />} label={t('nav.playlists')} selected={section.kind === 'playlists'} onClick={() => show({ kind: 'playlists' })} />
        {canTogether && <SidebarItem icon={<Icon name="users" />} label={t('together.title')} selected={section.kind === 'together'} onClick={() => show({ kind: 'together' })} />}
        <div className="side-spacer" />
        <SidebarItem icon={<Icon name="gear" />} label={t('nav.settings')} selected={section.kind === 'settings'} onClick={() => show({ kind: 'settings' })} />
      </EntryContainer>
    </div>
  );
}
