import { useEffect, useState } from 'react';
import { api, ApiError, type AuthStatus, type Profile } from '../api';
import { ArcLogo } from '../components/ArcLogo';
import { t } from '../i18n';
import { Button, Container, Focusable } from '../components/spot';

// "Who's watching?": the household's profiles, with an on-screen number pad for a PIN.
export function Profiles({ onChosen, onSignOut }: { onChosen: (p: Profile) => void; onSignOut: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pinFor, setPinFor] = useState<Profile | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<AuthStatus>('/auth/status').then((s) => setProfiles(s.profiles), (e) => setError((e as Error).message));
  }, []);

  const choose = async (p: Profile, withPin = '') => {
    setError('');
    try {
      const chosen = await api<Profile>('/auth/profile', { method: 'POST', body: { id: p.id, pin: withPin || undefined } });
      onChosen(chosen);
    } catch (e) {
      if (e instanceof ApiError && e.needs === 'pin') {
        if (withPin) setError(t('profiles.wrongPin'));
        setPin('');
        setPinFor(p);
      } else {
        setError((e as Error).message);
      }
    }
  };

  const press = (digit: string) => {
    if (!pinFor) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) void choose(pinFor, next);
  };

  if (pinFor) {
    return (
      <div className="screen centered">
        <h1>{t('profiles.pin', { name: pinFor.name })}</h1>
        <div className="pin-dots">{[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}</div>
        <Container className="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) =>
            d === '' ? <span key={i} /> : (
              <Focusable key={i} className="btn pin-key" data-default={d === '1' || undefined} onClick={() => (d === '⌫' ? setPin(pin.slice(0, -1)) : press(d))}>
                {d}
              </Focusable>
            ),
          )}
        </Container>
        {error && <p className="error">{error}</p>}
        <Button onClick={() => { setPinFor(null); setError(''); }}>{t('common.back')}</Button>
      </div>
    );
  }

  return (
    <div className="screen centered">
      <ArcLogo className="profiles-logo" />
      <h1 className="profiles-title">{t('profiles.title')}</h1>
      {/* As Android's: the focused profile's circle gets a white ring and its name turns white. */}
      <Container className="profiles">
        {profiles.map((p, i) => (
          <div key={p.id} className="profile">
            <Focusable className="profile-ring" data-default={i === 0 || undefined} onClick={() => void choose(p)}>
              <div className={`avatar color-${p.color}`}>{p.name.slice(0, 1).toUpperCase()}</div>
            </Focusable>
            <div className="profile-name">{p.name}</div>
          </div>
        ))}
      </Container>
      {error && <p className="error">{error}</p>}
      <Button className="outline" onClick={onSignOut}>{t('profiles.signOut')}</Button>
    </div>
  );
}
