import { useEffect, useState } from 'react';
import platform from '@platform';
import { checkAddress, scan, type FoundServer } from '../discovery';
import { ArcLogo } from '../components/ArcLogo';
import { t } from '../i18n';
import { Button, Container, SpotInput } from '../components/spot';

// First screen on a new TV: lists Arc servers found on the network, or takes an address.
export function ServerPick({ onPick }: { onPick: (s: FoundServer) => void }) {
  const [found, setFound] = useState<FoundServer[]>([]);
  const [searching, setSearching] = useState(true);
  const [round, setRound] = useState(0);
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    setSearching(true);
    setFound([]);
    (async () => {
      const ip = await platform.localAddress();
      // The browser build has no network info; the dev server proxies Arc on the same origin.
      if (!ip && platform.id === 'browser') {
        const here = await checkAddress(location.origin);
        if (here) setFound([{ ...here, url: '' }]);
      }
      if (ip) await scan(ip, (s) => setFound((list) => [...list, s]), ctrl.signal);
      if (!ctrl.signal.aborted) setSearching(false);
    })();
    return () => ctrl.abort();
  }, [round]);

  const connect = async () => {
    setError('');
    const s = await checkAddress(address);
    if (s) onPick(s);
    else setError(t('server.unreachable', { address }));
  };

  return (
    <div className="screen centered">
      <ArcLogo kind="stacked" className="screen-logo" />
      <h1>{t('server.title')}</h1>
      <Container className="stack">
        {found.map((s) => (
          <Button key={s.id} className="server" data-default onClick={() => onPick(s)}>
            <strong>{s.name}</strong>
            <span className="muted">{s.url.replace(/^https?:\/\//, '') || location.host} · {s.version}</span>
          </Button>
        ))}
        {searching && <p className="muted">{t('server.searching')}</p>}
        {!searching && !found.length && <p className="muted">{t('server.noneFound')}</p>}
        {!searching && <Button onClick={() => setRound((r) => r + 1)}>{t('server.searchAgain')}</Button>}
      </Container>
      <h2>{t('server.manual')}</h2>
      <Container className="inline">
        <SpotInput
          className="text-input"
          value={address}
          placeholder={t('server.manualHint')}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && address) void connect(); }}
        />
        <Button onClick={() => address && void connect()}>{t('server.connect')}</Button>
      </Container>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
