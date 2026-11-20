import { Spotlight } from '@enact/spotlight';
import { SpotlightRootDecorator } from '@enact/spotlight/SpotlightRootDecorator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import platform from '@platform';
import { api, ApiError, enc, type AuthStatus, type Extra, type Item, type Profile } from './api';
import { Splash } from './components/ArcLogo';
import { CardMenuHost } from './components/TitleMenu';
import { Container, focusElement } from './components/spot';
import type { FoundServer } from './discovery';
import { t } from './i18n';
import { handleBack } from './lib/back';
import { ActiveContext, NavContext, type Nav, type PlayOptions } from './lib/nav';
import { resetProfile } from './lib/store';
import { recoverRoom, resetTogether, together } from './lib/together';
import { useToast } from './lib/toast';
import { forgetServer, loadSession, saveServer, saveToken, type SavedServer } from './session';
import { Browse } from './screens/Browse';
import { CollectionPage } from './screens/Collection';
import { PlaylistPage } from './screens/Playlists';
import { Details } from './screens/Details';
import { ExtraPlayer, Player } from './screens/Player';
import { PersonPage } from './screens/Person';
import { Profiles } from './screens/Profiles';
import { ServerPick } from './screens/ServerPick';
import { SignIn } from './screens/SignIn';

// Live updates
import { useLiveUpdates } from './lib/live-updates';

type Screen =
  | { name: 'starting' }
  | { name: 'servers' }
  | { name: 'signin' }
  | { name: 'profiles' }
  | { name: 'browse' }
  | { name: 'details'; id: string; episodeId?: string }
  | { name: 'collection'; id: string }
  | { name: 'playlist'; id: string }
  | { name: 'person'; id: number }
  | { name: 'player'; item: Item; startMs: number; preroll?: boolean; entryId?: string; carryOn?: boolean; fileId?: number; together?: boolean }
  | { name: 'extra'; extra: Extra };

type Entry = { key: number; screen: Screen; focus?: HTMLElement | null };

let keys = 0;

// The app is a stack of screens. Screens under the top one stay mounted (hidden), so coming back
// to Home or a library finds it as it was, focus included. Back closes whatever is open on the
// screen first (lib/back.ts), then pops the screen; Back on the first screen leaves the app.
function App() {
  const [server, setServer] = useState<SavedServer | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [stack, setStack] = useState<Entry[]>([{ key: ++keys, screen: { name: 'starting' } }]);
  const [fatal, setFatal] = useState('');
  const note = useToast();
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const reset = useCallback((s: Screen) => setStack([{ key: ++keys, screen: s }]), []);
  const push = useCallback((s: Screen) => {
    const focus = Spotlight.getCurrent() as HTMLElement | null;
    setStack((st) => [...st.slice(0, -1), { ...st[st.length - 1], focus }, { key: ++keys, screen: s }]);
  }, []);
  const replace = useCallback((s: Screen) => setStack((st) => [...st.slice(0, -1), { key: ++keys, screen: s }]), []);
  const back = useCallback(() => {
    const st = stackRef.current;
    if (st.length <= 1) {
      platform.exit();
      return;
    }
    setStack(st.slice(0, -1));
  }, []);

  // Where to start: no server -> pick one; no token -> sign in; no profile -> pick one.
  const resume = useCallback(async () => {
    try {
      const s = await api<AuthStatus>('/auth/status');
      setStatus(s);
      if (!s.signed_in) return reset({ name: 'signin' });
      if (!s.profile) return reset({ name: 'profiles' });
      reset({ name: 'browse' });
      // Back in a Watch Together room this TV and profile were in (a relaunch within 30 s).
      void recoverRoom();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) reset({ name: 'signin' });
      else setFatal((e as Error).message);
    }
  }, [reset]);

  useEffect(() => {
    void platform.init().then(() => {
      const saved = loadSession();
      setServer(saved.server);
      if (!saved.server) reset({ name: 'servers' });
      else void resume();
    });
  }, [resume, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (platform.remoteKey(e.keyCode) !== 'back') return;
      // Let a text field use Backspace in the browser build.
      if (e.keyCode === 8 && (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      if (!handleBack()) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  // When a screen shows (again), put the focus back where it was, or somewhere sensible.
  const top = stack[stack.length - 1];
  // Live updates: player stays mounted; profile selection/sign-out closes its old stream.
  useLiveUpdates(status?.profile?.id, !!status?.profile && !['starting', 'servers', 'signin', 'profiles'].includes(top.screen.name));
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cur = Spotlight.getCurrent() as HTMLElement | null;
      if (cur && document.body.contains(cur) && cur.offsetParent) return;
      if (top.focus && document.body.contains(top.focus)) focusElement(top.focus);
      else Spotlight.focus(`screen-${top.key}`);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [top]);

  const pickServer = (s: FoundServer) => {
    const saved = { url: s.url, name: s.name, id: s.id };
    saveServer(saved);
    setServer(saved);
    saveToken('');
    reset({ name: 'signin' });
  };

  const onToken = useCallback((token: string) => {
    saveToken(token);
    reset({ name: 'profiles' });
  }, [reset]);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    saveToken('');
    resetProfile();
    resetTogether();
    reset({ name: 'signin' });
  }, [reset]);

  // Watch Together: joining or starting a room opens the player on the room's title, where the
  // room is; a new title in the room (the host's Up Next) replaces the player showing the last
  // one. A title this profile can't play opens nothing (the player says so). Signed out: sign in.
  // The session and title last opened: room updates come every couple of seconds, often before
  // the pushed player is on the stack, and must not open it twice.
  const opening = useRef<{ s: unknown; id: string } | null>(null);
  useEffect(() => together.room.subscribe((room) => {
    const s = together.session.get();
    if (!s || !room || !room.available || !room.item_id) return;
    const top = stackRef.current[stackRef.current.length - 1].screen;
    if (top.name === 'player' && top.together && top.item.id === room.item_id) return;
    if (opening.current && opening.current.s === s && opening.current.id === room.item_id) return;
    const id = room.item_id;
    opening.current = { s, id };
    api<Item>(`/items/${enc(id)}`).then((item) => {
      if (together.session.get() !== s || s.room.item_id !== id) return;
      const screen: Screen = { name: 'player', item, startMs: s.expected(), together: true, preroll: false };
      if (stackRef.current[stackRef.current.length - 1].screen.name === 'player') replace(screen);
      else push(screen);
    }, () => { opening.current = null; });
  }), [push, replace]);
  useEffect(() => together.ended.subscribe((why) => { if (why === 'signedOut') void resume(); }), [resume]);

  const nav = useMemo<Nav>(() => ({
    open: (it) => push(it.kind === 'episode' && it.parent_id ? { name: 'details', id: it.parent_id, episodeId: it.id } : { name: 'details', id: it.id }),
    play: (item, startMs, opts: PlayOptions = {}) => {
      const s: Screen = { name: 'player', item, startMs, preroll: !opts.replace, entryId: opts.entryId, carryOn: opts.carryOn, fileId: opts.fileId };
      if (opts.replace) replace(s);
      else push(s);
    },
    playExtra: (extra) => push({ name: 'extra', extra }),
    person: (id) => push({ name: 'person', id }),
    collection: (id) => push({ name: 'collection', id }),
    playlist: (id) => push({ name: 'playlist', id }),
    back,
  }), [push, replace, back]);

  if (fatal) {
    return (
      <div className="screen centered">
        <p className="error">{fatal}</p>
        <Container className="inline">
          <button className="btn" onClick={() => { setFatal(''); void resume(); }}>{t('common.retry')}</button>
          <button className="btn" onClick={() => { setFatal(''); forgetServer(); reset({ name: 'servers' }); }}>{t('link.otherServer')}</button>
        </Container>
      </div>
    );
  }

  const render = (s: Screen) => {
    switch (s.name) {
      case 'starting':
        return <Splash line={t('common.loading')} />;
      case 'servers':
        return <ServerPick onPick={pickServer} />;
      case 'signin':
        return (
          <SignIn
            serverName={server?.name ?? ''}
            serverURL={server?.url ?? ''}
            onToken={onToken}
            onOtherServer={() => { forgetServer(); reset({ name: 'servers' }); }}
          />
        );
      case 'profiles':
        return (
          <Profiles
            onChosen={(p: Profile) => {
              resetProfile();
              resetTogether();
              void recoverRoom();
              setStatus((st) => ({ signed_in: true, profiles: [], ...st, profile: p }));
              api<AuthStatus>('/auth/status').then(setStatus, () => {});
              reset({ name: 'browse' });
            }}
            onSignOut={() => void signOut()}
          />
        );
      case 'browse':
        return (
          <Browse
            profile={status?.profile ?? null}
            canSwitchProfile={!status?.friend}
            serverName={server?.name ?? ''}
            onSwitchProfile={() => push({ name: 'profiles' })}
            onSwitchServer={() => { void signOut().then(() => { forgetServer(); reset({ name: 'servers' }); }); }}
            onSignOut={() => void signOut()}
          />
        );
      case 'details':
        return <Details id={s.id} episodeId={s.episodeId} />;
      case 'collection':
        return <CollectionPage id={s.id} />;
      case 'playlist':
        return <PlaylistPage id={s.id} />;
      case 'person':
        return <PersonPage id={s.id} />;
      case 'player':
        return <Player preroll={s.preroll} item={s.item} startMs={s.startMs} entryId={s.entryId} carryOn={s.carryOn} fileId={s.fileId} together={s.together} />;
      case 'extra':
        return <ExtraPlayer extra={s.extra} />;
    }
  };

  return (
    <NavContext.Provider value={nav}>
      <CardMenuHost>
        {stack.map((e, i) => {
          const active = i === stack.length - 1;
          return (
            <ActiveContext.Provider key={e.key} value={active}>
              <Container spotlightId={`screen-${e.key}`} spotlightDisabled={!active} className="screen-slot" style={active ? undefined : { display: 'none' }}>
                {render(e.screen)}
              </Container>
            </ActiveContext.Provider>
          );
        })}
      </CardMenuHost>
      {note && <div className="toast">{note}</div>}
    </NavContext.Provider>
  );
}

export default SpotlightRootDecorator(App);
