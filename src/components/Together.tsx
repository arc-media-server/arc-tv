import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { useBack } from '../lib/back';
import { renewCode, together, type RoomCode } from '../lib/together';
import { toast } from '../lib/toast';
import { Spotlight } from '@enact/spotlight';
import {
  formatCode, hostName, hosting, minutesLeft, noticeFor, statusOf, waitingFor, waitSeconds,
  type Notice, type WatchRoom,
} from '../lib/watch-together';
import { Icon } from './Icon';
import { Popover, PopoverItem, useFocusTrap } from './Menu';
import { Button, Container, Trap } from './spot';

// What the player shows for Watch Together (Android's ui/together/TogetherPlayer.kt, the web's
// TogetherLobby): the room card (the lobby until the room first plays, and the player's Watch
// Together panel after), the notes near the top of the picture, the host-ended pane and the
// host's Leave confirmation.

function noticeText(n: Notice): string {
  switch (n.kind) {
    case 'paused': return t('together.pausedBy', { name: n.name });
    case 'played': return t('together.playedBy', { name: n.name });
    case 'moved': return t('together.movedBy', { name: n.name });
    case 'host': return n.you ? t('together.youHost') : t('together.newHost', { name: n.name });
  }
}

/** A note for what someone else just did to the room ("Paused by Jo"), shown for 3 seconds. */
export function useRoomNotice(room: WatchRoom | null): string | null {
  const [state, setState] = useState<{ before: WatchRoom | null; text: string | null }>({ before: null, text: null });
  if (room !== state.before) {
    const n = room ? noticeFor(state.before, room) : null;
    setState({ before: room, text: n ? noticeText(n) : room ? state.text : null });
  }
  useEffect(() => {
    if (!state.text) return;
    const timer = window.setTimeout(() => setState((s) => ({ ...s, text: null })), 3000);
    return () => window.clearTimeout(timer);
  }, [state.text]);
  return state.text;
}

/** A capsule near the top of the picture (the Apple TV design's notices). */
export function RoomPill({ text }: { text: string }) {
  return <div className="room-pill"><Icon name="users" size={30} /><span>{text}</span></div>;
}

/** "Waiting for Sam… 8s", counting down to when the room carries on without them (at most ten seconds). */
export function WaitingPill({ room, serverNow }: { room: WatchRoom; serverNow: () => number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(timer);
  }, []);
  const slow = waitingFor(room);
  const text = slow.length ? t('together.waitingFor', { names: slow.join(', ') }) : t('together.waiting');
  const seconds = waitSeconds(room, serverNow());
  return <RoomPill text={seconds > 0 ? t('together.waitingSeconds', { text, n: seconds }) : text} />;
}

function People({ room }: { room: WatchRoom }) {
  const labels = { unavailable: t('together.status.unavailable'), loading: t('together.status.loading'), watching: t('together.status.watching'), ready: t('together.status.ready') };
  return (
    <div className="room-people">
      {room.participants.map((p) => (
        <div key={p.id} className="room-person">
          <span className="room-name">{p.id === room.self_id ? t('together.you', { name: p.name }) : p.name}</span>
          {p.id === room.host_id && <span className="label">{t('together.host')}</span>}
          <span className="muted">{labels[statusOf(p)]}</span>
        </div>
      ))}
      {(room.invited ?? []).map((p, i) => (
        <div key={`invited:${i}`} className="room-person">
          <span className="room-name muted">{p.name}</span>
          <span className="muted">{t('together.status.invited')}</span>
        </div>
      ))}
    </div>
  );
}

/** The code to share, as XXXX-XXXX, and how long it lasts (it ticks down while shown). */
function CodeBox({ code }: { code: RoomCode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);
  const left = minutesLeft(code.expiresAtMs, now);
  return (
    <div className="room-code">
      <div className="room-code-text">{formatCode(code.code)}</div>
      <div className="muted">{left <= 0 ? t('together.codeExpired') : left === 1 ? t('together.codeHintOne') : t('together.codeHint', { n: left })}</div>
    </div>
  );
}

/**
 * The room card over the player: the title, who's here (host and "(you)" marked, with each
 * person's status), the code to share (host), then the actions. `lobby`: before the room first
 * plays (Start for the host, "Waiting for Jo to start…" for the others); otherwise the player's
 * Watch Together panel (Close, a new code, Leave, End for Everyone).
 */
export function RoomCard({ room, lobby, onStart, onLeave, onEnd, onClose, extra }: {
  room: WatchRoom;
  lobby: boolean;
  onStart: () => void;
  onLeave: () => void;
  onEnd: () => void;
  onClose: () => void;
  /** More actions (PR 2's Invite People…), after the main one. */
  extra?: React.ReactNode;
}) {
  const id = useFocusTrap();
  const code = together.code.use();
  const host = hosting(room);
  const shownCode = host && code && code.roomId === room.id ? code : null;
  const n = room.participants.length;
  // Back leaves in the lobby (asking the host first, in the player); in the panel it closes the panel.
  useBack(() => { if (lobby) onLeave(); else onClose(); });
  return (
    <div className="overlay room-overlay">
      <Trap spotlightId={id} className="overlay-panel room-card">
        <div className="room-head">
          <Icon name="users" size={44} />
          <div className="room-head-text">
            <h2 className="overlay-title">{t('together.title')}</h2>
            {room.item?.title && <div className="muted room-item">{room.item.title}</div>}
          </div>
        </div>
        <div className="small-caps muted room-count">{n === 1 ? t('together.inRoomOne') : t('together.inRoom', { n })}</div>
        <People room={room} />
        {shownCode && <CodeBox code={shownCode} />}
        {lobby && !host && <p className="muted">{t('together.waitingForHost', { name: hostName(room) })}</p>}
        <Container className="inline room-actions">
          {lobby && host && <Button className="primary" data-default onClick={onStart}><Icon name="play" size={30} /> {t('together.start')}</Button>}
          {!lobby && <Button data-default onClick={onClose}>{t('common.close')}</Button>}
          {extra}
          {shownCode && <Button onClick={() => void renewWithNote()}>{t('together.newCode')}</Button>}
          <Button data-default={lobby && !host ? true : undefined} onClick={onLeave}>{t('together.leave')}</Button>
          {!lobby && host && <Button onClick={onEnd}>{t('together.endForEveryone')}</Button>}
        </Container>
      </Trap>
    </div>
  );
}

async function renewWithNote() {
  if (!(await renewCode())) toast(t('together.newCodeFailed'));
}

/** The host's Leave asks first: the others stay, and hosting passes on. */
export function LeaveConfirm({ onLeave, onStay }: { onLeave: () => void; onStay: () => void }) {
  return (
    <Popover title={t('together.leaveTitle')} body={t('together.leaveHostBody')} onClose={onStay}>
      <PopoverItem first icon="" label={t('together.stay')} onClick={onStay} />
      <PopoverItem icon="out" label={t('together.leave')} onClick={onLeave} />
    </Popover>
  );
}

/** The host ended the room: carry on alone (focused) or close the player. */
export function EndedPane({ onContinue, onClose }: { onContinue: () => void; onClose: () => void }) {
  useBack(() => { onContinue(); });
  useEffect(() => {
    const timer = window.setTimeout(() => Spotlight.focus('room-ended'), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <Trap className="player-pane" spotlightId="room-ended">
      <h2>{t('together.endedTitle')}</h2>
      <p className="muted">{t('together.endedBody')}</p>
      <Container className="inline">
        <Button className="primary" data-default onClick={onContinue}>{t('together.continueAlone')}</Button>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </Container>
    </Trap>
  );
}
