import { Spotlight } from '@enact/spotlight';
import { SpotlightRootDecorator } from '@enact/spotlight/SpotlightRootDecorator';
import { useCallback, useEffect, useState } from 'react';
import platform from '@platform';
import { api, ApiError, type AuthStatus, type Item, type Profile } from './api';
import type { FoundServer } from './discovery';
import { t } from './i18n';
import { forgetServer, loadSession, saveServer, saveToken, type SavedServer } from './session';
import { Details } from './screens/Details';
import { Home } from './screens/Home';
import { Player } from './screens/Player';
import { Profiles } from './screens/Profiles';
import { ServerPick } from './screens/ServerPick';
import { SignIn } from './screens/SignIn';

type Screen =
  | { name: 'starting' }
  | { name: 'servers' }
  | { name: 'signin' }
  | { name: 'profiles' }
  | { name: 'home' }
  | { name: 'details'; id: string }
  | { name: 'player'; item: Item; startMs: number };

// The app is a stack of screens; Back pops it, and Back on the first screen leaves the app.
function App() {
  const [server, setServer] = useState<SavedServer | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stack, setStack] = useState<Screen[]>([{ name: 'starting' }]);
  const [fatal, setFatal] = useState('');
  const screen = stack[stack.length - 1];

  const reset = (s: Screen) => setStack([s]);
  const push = (s: Screen) => setStack((st) => [...st, s]);
  const replace = (s: Screen) => setStack((st) => [...st.slice(0, -1), s]);
  const back = useCallback(() => {
    setStack((st) => {
      if (st.length > 1) return st.slice(0, -1);
      platform.exit();
      return st;
    });
  }, []);

  // Where to start: no server -> pick one; no token -> sign in; no profile -> pick one.
  const resume = useCallback(async () => {
    try {
      const status = await api<AuthStatus>('/auth/status');
      if (!status.signed_in) return reset({ name: 'signin' });
      if (!status.profile) return reset({ name: 'profiles' });
      setProfile(status.profile);
      reset({ name: 'home' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) reset({ name: 'signin' });
      else setFatal((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void platform.init().then(() => {
      const saved = loadSession();
      setServer(saved.server);
      if (!saved.server) reset({ name: 'servers' });
      else void resume();
    });
  }, [resume]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (platform.remoteKey(e.keyCode) !== 'back') return;
      // Let a text field use Backspace in the browser build.
      if (e.keyCode === 8 && (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  // Put focus somewhere sensible whenever the screen changes.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!Spotlight.getCurrent()) Spotlight.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [screen]);

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
  }, []);

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    saveToken('');
    reset({ name: 'signin' });
  };

  const open = (it: Item) => push({ name: 'details', id: it.id });

  if (fatal) {
    return (
      <div className="screen centered">
        <p className="error">{fatal}</p>
        <div className="inline">
          <button className="btn" onClick={() => { setFatal(''); void resume(); }}>{t('common.retry')}</button>
          <button className="btn" onClick={() => { setFatal(''); forgetServer(); reset({ name: 'servers' }); }}>{t('link.otherServer')}</button>
        </div>
      </div>
    );
  }

  switch (screen.name) {
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
      return <Profiles onChosen={(p) => { setProfile(p); reset({ name: 'home' }); }} onSignOut={() => void signOut()} />;
    case 'home':
      return <Home profileName={profile?.name ?? ''} onOpen={open} onSwitchProfile={() => push({ name: 'profiles' })} />;
    case 'details':
      return <Details key={screen.id} id={screen.id} onOpen={open} onPlay={(item, startMs) => push({ name: 'player', item, startMs })} />;
    case 'player':
      return (
        <Player
          key={screen.item.id}
          item={screen.item}
          startMs={screen.startMs}
          onExit={back}
          onPlayNext={(n) => replace({ name: 'player', item: n, startMs: n.user_data?.position_ms ?? 0 })}
        />
      );
  }
}

export default SpotlightRootDecorator(App);
