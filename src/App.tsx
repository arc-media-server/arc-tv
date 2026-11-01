import { Spotlight } from '@enact/spotlight';
import { SpotlightRootDecorator } from '@enact/spotlight/SpotlightRootDecorator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import platform from '@platform';
import { api, ApiError, type AuthStatus, type Extra, type Item, type Profile } from './api';
import { CardMenuHost } from './components/TitleMenu';
import { Container, focusElement } from './components/spot';
import type { FoundServer } from './discovery';
import { t } from './i18n';
import { handleBack } from './lib/back';
import { ActiveContext, NavContext, type Nav, type PlayOptions } from './lib/nav';
import { resetProfile } from './lib/store';
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
  | { name: 'player'; item: Item; startMs: number; entryId?: string; carryOn?: boolean; fileId?: number }
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
    reset({ name: 'signin' });
  }, [reset]);

  const nav = useMemo<Nav>(() => ({
    open: (it) => push(it.kind === 'episode' && it.parent_id ? { name: 'details', id: it.parent_id, episodeId: it.id } : { name: 'details', id: it.id }),
    play: (item, startMs, opts: PlayOptions = {}) => {
      const s: Screen = { name: 'player', item, startMs, entryId: opts.entryId, carryOn: opts.carryOn, fileId: opts.fileId };
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
        return <div className="screen centered"><p className="muted">{t('common.loading')}</p></div>;
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
        return <Player item={s.item} startMs={s.startMs} entryId={s.entryId} carryOn={s.carryOn} fileId={s.fileId} />;
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
