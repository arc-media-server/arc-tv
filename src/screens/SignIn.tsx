import { useEffect, useState } from 'react';
import platform from '@platform';
import { api, ApiError } from '../api';
import { ArcLogo } from '../components/ArcLogo';
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
  /** The last code ran out and this is a new one, as Android's. */
  const [renewed, setRenewed] = useState(false);
  const [error, setError] = useState('');
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    let timer = 0;
    setCode('');
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
            if (e instanceof ApiError && e.status === 404) { setRenewed(true); setRound((r) => r + 1); }
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
  // As Android's: the steps and buttons on the left, the code in boxes on the right.
  return (
    <div className="screen signin">
      <div className="signin-left">
        <ArcLogo className="signin-logo" />
        <h1 className="signin-title">{t('link.title')}</h1>
        {[t('link.stepOpen'), t('link.stepLink', { url: linkURL }), t('link.stepCode')].map((text, i) => (
          <div key={i} className="signin-step"><span className="signin-num">{i + 1}</span><span>{text}</span></div>
        ))}
        <Container className="inline signin-buttons">
          <Button className="outline" data-default onClick={() => { setRenewed(false); setRound((r) => r + 1); }}>{t('link.newCode')}</Button>
          <Button className="outline" onClick={onOtherServer}>{t('link.otherServer')}</Button>
        </Container>
      </div>
      <div className="signin-right">
        {error ? <p className="error">{error}</p> : !code ? <div className="spinner" /> : (
          <>
            <div className="signin-code">{code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
            <div className="signin-wait"><div className="spinner small" /><span>{t(renewed ? 'link.renewed' : 'link.waiting')}</span></div>
          </>
        )}
        <div className="signin-server">{t('link.server', { server: serverName || linkURL.replace(/\/link$/, '') })}</div>
      </div>
    </div>
  );
}
