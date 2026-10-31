import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Item } from '../api';
import { cardFor, type Card } from '../lib/home';
import { MediaCard } from './Cards';
import { Scroller, type ScrollerHandle } from './Scroller';
import { Container, focusElement } from './spot';

// Titles in a grid: six posters across (home videos four wide), as Plex and the Android app.
// Only the rows near what's on screen are drawn, so a library of thousands stays quick on a TV;
// a position whose title hasn't loaded yet shows an empty card (the same card, so the focus stays
// when its title arrives) and asks for it.

const START = 192;
const RIGHT = 150;
const GAP = 40;
const AREA = 1920 - START - RIGHT;

export function gridLayout(landscape: boolean) {
  const columns = landscape ? 4 : 6;
  const width = Math.floor((AREA - GAP * (columns - 1)) / columns);
  const art = landscape ? Math.round((width * 9) / 16) : Math.round(width * 1.5);
  return { columns, width, rowHeight: art + 100 };
}

const placeholder = (i: number): Card => ({ key: `slot:${i}`, item: { id: '', kind: 'placeholder', title: '' } });

export function TitleGrid({ count, itemAt, landscape, onOpen, onNeed, jumpTo, top = 0, children, cardOf }: {
  count: number;
  itemAt: (i: number) => Item | undefined;
  landscape: boolean;
  onOpen: (item: Item, i: number) => void;
  onNeed?: (i: number) => void;
  /** A position to move the focus to (a letter's first title); changes each time it's asked. */
  jumpTo?: { index: number; n: number };
  /** Space above the grid inside the scrolling area (a page's heading). */
  top?: number;
  children?: ReactNode;
  cardOf?: (item: Item) => Card;
}) {
  const { columns, width, rowHeight } = gridLayout(landscape);
  const rows = Math.ceil(count / columns);
  const [offset, setOffset] = useState(0);
  const scroller = useRef<ScrollerHandle>(null);
  const holder = useRef<HTMLDivElement>(null);
  const first = Math.max(0, Math.floor((offset - top) / rowHeight) - 2);
  const last = Math.min(rows - 1, Math.ceil((offset - top + 1080) / rowHeight) + 2);

  useEffect(() => {
    for (let r = first; r <= last; r++) onNeed?.(r * columns);
  }, [first, last, columns, onNeed]);

  useEffect(() => {
    if (!jumpTo) return;
    const row = Math.floor(jumpTo.index / columns);
    scroller.current?.to(top + row * rowHeight - 40);
    const timer = window.setTimeout(() => {
      const el = holder.current?.querySelector(`[data-index="${jumpTo.index}"] .card-face`);
      if (el) focusElement(el);
    }, 50);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo]);

  const drawn: ReactNode[] = [];
  for (let r = first; r <= last; r++) {
    const cells: ReactNode[] = [];
    for (let c = 0; c < columns; c++) {
      const i = r * columns + c;
      if (i >= count) break;
      const item = itemAt(i);
      const card = item ? (cardOf ? cardOf(item) : cardFor(item)) : placeholder(i);
      cells.push(
        <div key={i} className="grid-cell" data-index={i} style={{ width, marginRight: c < columns - 1 ? GAP : 0 }}>
          <MediaCard card={{ ...card, key: String(i) }} look={landscape ? 'thumb' : 'poster'} width={width} first={i === 0} onClick={() => item && onOpen(item, i)} onFocus={() => onNeed?.(i + 30)} />
        </div>,
      );
    }
    drawn.push(<div key={r} className="grid-row" data-section style={{ top: top + r * rowHeight, left: START, height: rowHeight }}>{cells}</div>);
  }

  return (
    <Scroller ref={scroller} className="grid-scroller" pad={16} padEnd={16} onMove={setOffset}>
      <div ref={holder} className="grid-holder" style={{ height: top + rows * rowHeight + 40 }}>
        {children}
        <Container className="grid-cells">{drawn}</Container>
      </div>
    </Scroller>
  );
}
