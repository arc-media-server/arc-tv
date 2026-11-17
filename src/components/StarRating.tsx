// Star rating: reuse the app's existing overlay and menu rows.
import type { Item } from '../api';
import { t } from '../i18n';
import { ratingChoices, stars } from '../lib/ratings';
import { setRating } from '../lib/store';
import { toast } from '../lib/toast';
import { Overlay, PopoverItem } from './Menu';
import { Scroller } from './Scroller';

export function StarRating({ item, onClose }: { item: Item; onClose: () => void }) {
  const current = item.user_data?.rating ?? 0;
  const save = (rating: number) => {
    onClose();
    void setRating(item, rating).catch(() => toast(t('rating.failed')));
  };
  return <Overlay width={600} onClose={onClose}>
    <h2 className="overlay-title">{t('rating.your')}</h2>
    <Scroller className="popover-list" pad={24}>
      {ratingChoices.map((r) => <PopoverItem key={r} first={r === current || (!current && r === 10)} icon={r === current ? 'check' : ''} label={stars(r)} detail={t('rating.outOfFive', { n: r / 2 })} onClick={() => save(r)} />)}
      {current > 0 && <PopoverItem icon="close" label={t('rating.clear')} onClick={() => save(0)} />}
    </Scroller>
  </Overlay>;
}
