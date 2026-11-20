import { useEffect, useState } from 'react';
import type { Item } from '../api';
import { t } from '../i18n';
import { cardFor, type Card } from '../lib/home';
import { acceptRoom, dismissRoom, refreshRooms, together, type RoomEntry } from '../lib/together';
import { toast } from '../lib/toast';
import { roomActions, roomPeople, type ListedRoom } from '../lib/watch-together';
import { CardMenuContext, MediaCard, Strip } from './Cards';
import { Popover, PopoverItem } from './Menu';
import { Container } from './spot';

// Home's Watch Together row (Android's and the Apple TV app's: first among the rows while there are
// rooms) and the Watch Together page's Rooms: rooms this profile made, was invited to or is in.
// Each card is the room's title, "You're hosting" or "Hosted by Jo" under it, and "Watching now"
// while it plays. OK opens the room's menu: who's here and who's invited, Join (or Return) and
// Decline (or Cancel, for its maker). Arc's `watch_together` hint keeps it current.

/** The rooms list, read again when a screen showing it opens (and on Arc's hint, by App). */
export function useRooms(visits: unknown): RoomEntry[] {
  const rooms = together.rooms.use();
  useEffect(() => { void refreshRooms(); }, [visits]);
  return rooms;
}

function roomCard(e: RoomEntry): Card {
  const r = e.room;
  const item: Item = e.item ?? ({ id: r.item.id, title: r.item.title, kind: r.item.kind } as Item);
  return {
    ...cardFor(item, `room:${r.id}`),
    progress: undefined,
    sub: r.hosting ? t('together.youreHosting') : t('together.hostedBy', { name: r.host_name }),
    tag: r.state === 'playing' ? t('together.cardPlaying') : undefined,
    tagIcon: 'users',
  };
}

/** The room cards on a strip, each opening its menu. */
export function RoomCards({ rooms, start, width }: { rooms: RoomEntry[]; start: number; width: number }) {
  const [open, setOpen] = useState<{ room: ListedRoom; from?: ClientRect } | null>(null);
  return (
    // Holding OK on a room card has no title menu: the room's own menu is OK.
    <CardMenuContext.Provider value={null}>
      <Container className="row-cards">
        <Strip start={start}>
          {rooms.map((e) => (
            <MediaCard key={e.room.id} card={roomCard(e)} look="thumb" width={width} onClick={() => setOpen({ room: e.room })} />
          ))}
        </Strip>
      </Container>
      {open && <RoomMenu room={open.room} onClose={() => setOpen(null)} />}
    </CardMenuContext.Provider>
  );
}

/** A listed room's menu: who's hosting, who's here and who's invited; Join or Return; Decline or Cancel. */
export function RoomMenu({ room, onClose }: { room: ListedRoom; onClose: () => void }) {
  const acts = roomActions(room);
  const people = roomPeople(room);
  const lines = [
    room.hosting ? t('together.youreHosting') : t('together.hostedBy', { name: room.host_name }),
    people.here.length === 1 ? t('together.hereName', { name: people.here[0] }) : people.here.length ? t('together.hereNames', { names: people.here.join(', ') }) : '',
    people.invited.length ? t('together.invitedNames', { names: people.invited.join(', ') }) : '',
  ].filter(Boolean);
  const join = () => {
    onClose();
    void acceptRoom(room.id).then((ok) => { if (!ok) toast(t('together.joinRoomFailed')); });
  };
  const dismiss = () => {
    onClose();
    void dismissRoom(room.id).then((ok) => { if (!ok) toast(t('together.declineFailed')); });
  };
  return (
    <Popover title={room.item.title} body={lines.join('\n')} onClose={onClose}>
      <PopoverItem first icon="play" label={t(acts.main === 'return' ? 'together.return' : 'together.join')} onClick={join} />
      <PopoverItem icon="close" label={t(acts.other === 'cancel' ? 'together.cancelRoom' : 'together.decline')} onClick={dismiss} />
    </Popover>
  );
}
