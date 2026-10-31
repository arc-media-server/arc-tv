import { useEffect, useState } from 'react';
import platform from '@platform';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { Button, Container } from '../components/spot';

// Signs the TV in with a code: Arc's POST /auth/link, approved from a phone or computer with
// "Link a Device", then polled until the token arrives. No typing passwords with a remote.
export function SignIn({ serverName, serverURL, onToken, onOtherServer }: {
  serverName: string;
  serverURL: string;
  onToken: (token: string) => void;
  onOtherServer: () => void;
}) {
  const [code, setCode] = useState('');
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState('');
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    let timer = 0;
    setExpired(false);
    setError('');
    (async () => {
      try {
        const device = await platform.deviceName();
        const link = await api<{ code: string; poll: string; expires_in: number }>('/auth/link', { method: 'POST', body: { device } });
        if (!live) return;
        setCode(link.code);
        const poll = async () => {
          try {
            const res = await api<{ token?: string; waiting?: boolean }>(`/auth/link/${encodeURIComponent(link.poll)}`);
            if (!live) return;
            if (res.token) onToken(res.token);
            else timer = window.setTimeout(poll, 3000);
          } catch (e) {
            if (!live) return;
            if (e instanceof ApiError && e.status === 404) setExpired(true);
            else timer = window.setTimeout(poll, 5000);
          }
        };
        timer = window.setTimeout(poll, 3000);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [round, onToken]);

  const linkURL = `${(serverURL || location.origin).replace(/^https?:\/\//, '')}/link`;
  return (
    <div className="screen centered">
      <h1>{t('link.title', { server: serverName })}</h1>
      <p className="lead">{t('link.steps')}</p>
      {!expired && code && <div className="link-code">{code}</div>}
      {!expired && <p className="muted">{t('link.or', { url: linkURL })}</p>}
      {expired && <p className="error">{t('link.expired')}</p>}
      {error && <p className="error">{error}</p>}
      <Container className="inline">
        {(expired || error) && <Button data-default onClick={() => setRound((r) => r + 1)}>{t('link.newCode')}</Button>}
        <Button onClick={onOtherServer}>{t('link.otherServer')}</Button>
      </Container>
    </div>
  );
}
