import { useEffect, useState } from 'react';
import type { Item } from '../api';
import { t } from '../i18n';
import { acceptRoom, invitePeople, inviteMore, inviteRoom, startRoom, together } from '../lib/together';
import { toast } from '../lib/toast';
import { offerable, personDetail, toggleChosen, type ListedRoom, type WatchPerson } from '../lib/watch-together';
import { Popover, PopoverItem } from './Menu';
import { Scroller } from './Scroller';
import { focusElement } from './spot';

// Invite People… (Android's ui/together/InvitePicker.kt, the web's invite picker): the people this
// profile may watch with, each with whether they're a friend or a profile on this server. People
// who can't watch the title are shown dimmed and can't be chosen (everyone invited must be able
// to). OK on a person ticks or unticks them; Done makes the room (from a title) or invites them
// (from inside the room). From a title, Use a Code Instead starts a room with a code as before.

const details = { cantWatch: 'together.cantWatch', friend: 'together.friend', household: 'together.household' } as const;

/** From a title (`item` from `startMs`), or, with neither, the room this TV hosts. */
export function InvitePicker({ item, startMs = 0, from, onClose }: { item?: Item; startMs?: number; from?: ClientRect; onClose: () => void }) {
  const room = together.room.use();
  const inRoom = !item;
  const itemId = item ? item.id : room?.item_id;
  const [people, setPeople] = useState<WatchPerson[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [made, setMade] = useState<ListedRoom | null>(null);
  const load = () => {
    setFailed(false);
    setPeople(null);
    void invitePeople(itemId).then((p) => { if (p) setPeople(p); else setFailed(true); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);
  // The list arrives after the panel opens, so the focus moves onto it then.
  useEffect(() => {
    if (!people && !failed) return;
    const timer = window.setTimeout(() => {
      const el = document.querySelector('.popover .popover-item');
      if (el) focusElement(el);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [people, failed]);

  if (made) return <RoomMade room={made} onClose={onClose} />;

  const shown = people ? offerable(people, inRoom ? room : null) : null;
  const done = async () => {
    if (!chosen.length || sending) return;
    setSending(true);
    if (item) {
      const { result, room: r } = await inviteRoom(item, startMs, chosen);
      setSending(false);
      if (result === 'done' && r) setMade(r);
      else if (result === 'tooMany') { toast(t('together.tooManyRooms')); onClose(); }
      else toast(t('together.inviteFailed'));
    } else {
      const result = await inviteMore(chosen);
      setSending(false);
      if (result === 'done') onClose();
      else toast(t('together.inviteFailed'));
    }
  };
  const useCode = () => {
    onClose();
    if (item) void startRoom(item, startMs).then((ok) => { if (!ok) toast(t('together.startFailed')); });
  };

  const body = failed ? t('together.peopleFailed')
    : !shown ? t('together.loadingPeople')
    : !shown.length ? t(inRoom ? 'together.nobodyMore' : 'together.nobodyToInvite')
    : inRoom ? t('together.inviteMoreBody') : t('together.inviteBody', { title: item!.title });
  return (
    <Popover title={t('together.invitePeople')} body={body} from={from} onClose={onClose}>
      {failed && <PopoverItem first icon="" label={t('common.retry')} onClick={load} />}
      {shown && shown.length > 0 && (
        <Scroller className="popover-list" pad={24}>
          {shown.map((p, i) => {
            const on = chosen.indexOf(p.id) >= 0;
            return (
              <PopoverItem
                key={p.id}
                first={i === 0}
                dim={!p.can_watch}
                icon={on ? 'check' : ''}
                label={p.name}
                detail={t(details[personDetail(p)])}
                onClick={() => setChosen((c) => toggleChosen(c, p))}
              />
            );
          })}
        </Scroller>
      )}
      {chosen.length > 0 && <PopoverItem icon="" label={t(sending ? 'together.inviting' : 'together.done')} onClick={() => void done()} />}
      {!inRoom && (failed || shown) && <PopoverItem first={!!shown && !shown.length} icon="" label={t('together.useCode')} onClick={useCode} />}
      {inRoom && shown && !shown.length && <PopoverItem first icon="" label={t('common.close')} onClick={onClose} />}
    </Popover>
  );
}

/** The room's made and waits on Home: Join Now (focused) goes in as host; Not Now leaves it there. */
function RoomMade({ room, onClose }: { room: ListedRoom; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const el = document.querySelector('.popover .popover-item');
      if (el) focusElement(el);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const join = () => {
    onClose();
    void acceptRoom(room.id).then((ok) => { if (!ok) toast(t('together.joinRoomFailed')); });
  };
  return (
    <Popover title={t('together.title')} body={t('together.roomMade', { title: room.item.title })} onClose={onClose}>
      <PopoverItem first icon="play" label={t('together.joinNow')} onClick={join} />
      <PopoverItem icon="" label={t('together.notNow')} onClick={onClose} />
    </Popover>
  );
}
