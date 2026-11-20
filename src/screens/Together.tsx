import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Scroller } from '../components/Scroller';
import { Container, Focusable } from '../components/spot';
import { t } from '../i18n';
import { joinRoom, type JoinProblem } from '../lib/together';
import { CODE_ALPHABET, CODE_LENGTH, formatCode, keyToCodeChar, typeCode } from '../lib/watch-together';
import { START } from './Home';
import { RoomCards, useRooms } from '../components/RoomsRow';

// The sidebar's Watch Together page (Android's TogetherPage, after Playlists, when Arc offers
// Watch Together): Join with a Code, then the Rooms this profile made, was invited to or is in. The code is typed with the remote's number keys, or with the
// letters and digits on screen (arrows and OK); the dash is added. App opens the room's player.

const ROWS: string[] = [];
for (let i = 0; i < CODE_ALPHABET.length; i += 8) ROWS.push(CODE_ALPHABET.slice(i, i + 8));

const problems: Record<JoinProblem, string> = {
  notFound: 'together.codeNotFound',
  tooMany: 'together.tooManyTries',
  failed: 'together.joinFailed',
};

export function TogetherContent({ onReady }: { onReady: () => void }) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<JoinProblem | null>(null);
  const [joining, setJoining] = useState(false);
  const rooms = useRooms(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onReady(); }, []);

  const type = (key: string) => {
    setProblem(null);
    setCode((c) => typeCode(c, key));
  };
  const join = () => {
    if (code.length !== CODE_LENGTH || joining) return;
    setJoining(true);
    void joinRoom(code).then((p) => {
      setJoining(false);
      setProblem(p);
      if (!p) setCode('');
    });
  };
  // The remote's number keys (and a keyboard's letters in the browser build) type at once;
  // Backspace on a keyboard deletes.
  const onKey = (e: React.KeyboardEvent) => {
    const ch = keyToCodeChar(e.keyCode);
    if (ch && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      type(ch);
    } else if (e.keyCode === 8 && code) {
      e.preventDefault();
      e.stopPropagation();
      type('backspace');
    }
  };

  const shown = formatCode(code);
  const slots: string[] = [];
  for (let i = 0; i < CODE_LENGTH; i++) slots.push(code[i] ?? '');
  return (
    <div className="settings">
      <Scroller className="settings-page" pad={80}>
        <h1 className="page-title settings-title" style={{ paddingLeft: START }}>{t('together.title')}</h1>
        <div className="join-code" style={{ marginLeft: START }} onKeyDown={onKey}>
          <h2 className="settings-heading">{t('together.joinTitle')}</h2>
          <p className="settings-note">{t('together.joinBody')}</p>
          <div className="code-slots" aria-label={shown}>
            {slots.map((c, i) => (
              <span key={i} className={`code-slot${i === code.length ? ' next' : ''}${i === 4 ? ' after-dash' : ''}`}>{c}</span>
            ))}
          </div>
          <p className={`join-status${problem ? ' error' : ' muted'}`}>{joining ? t('together.joining') : problem ? t(problems[problem] as 'together.codeNotFound') : ''}</p>
          <Container className="keypad" data-section>
            {ROWS.map((row, r) => (
              <div key={row} className="keypad-row">
                {row.split('').map((ch, i) => (
                  <Focusable key={ch} className="key" data-default={r === 0 && i === 0 ? true : undefined} onClick={() => type(ch)}>{ch}</Focusable>
                ))}
              </div>
            ))}
            <div className="keypad-row">
              <Focusable className="key wide" onClick={() => type('backspace')}><Icon name="backspace" size={32} /> {t('together.delete')}</Focusable>
              <Focusable className={`key wide primary${code.length === CODE_LENGTH ? '' : ' dim'}`} onClick={join}>{t('together.join')}</Focusable>
            </div>
          </Container>
        </div>
        {rooms.length > 0 && (
          <section className="home-row together-rooms" data-section>
            <h2 className="row-title" style={{ paddingLeft: START }}>{t('together.rooms')}</h2>
            <RoomCards rooms={rooms} start={START} width={472} />
          </section>
        )}
      </Scroller>
    </div>
  );
}
