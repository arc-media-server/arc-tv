import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from 'react';

// Scrolling that follows the focus, moved with a transform so it can glide (old TV browsers have
// no smooth scrolling) and so the browser's own focus scrolling can't fight it (main.tsx undoes
// that). The focused card, or the block it's in (anything marked data-section), is brought just
// into view, as Google TV rows and Plex's pages move: only as far as needed.

export interface ScrollerHandle { by(px: number): void; to(px: number): void }

type Props = {
  axis?: 'x' | 'y';
  /** Room kept before and after what's revealed. */
  pad?: number;
  padEnd?: number;
  /** 'start' puts each revealed block at the start (Home's one-row band). */
  align?: 'nearest' | 'start';
  className?: string;
  innerClassName?: string;
  children: ReactNode;
  /** Changing it scrolls back to the start. */
  resetKey?: unknown;
  /** Told where it scrolled to (e.g. for a list that renders only what's near). */
  onMove?: (offset: number) => void;
};

export const Scroller = forwardRef<ScrollerHandle, Props>(function Scroller(
  { axis = 'y', pad = 60, padEnd, align = 'nearest', className = '', innerClassName = '', children, resetKey, onMove },
  ref,
) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const x = axis === 'x';

  const limit = () => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return 0;
    return Math.max(0, (x ? i.offsetWidth : i.offsetHeight) - (x ? o.clientWidth : o.clientHeight));
  };
  const apply = (v: number) => {
    const next = Math.round(Math.max(0, Math.min(v, limit())));
    if (next === offset.current) return;
    offset.current = next;
    if (inner.current) inner.current.style.transform = x ? `translate3d(${-next}px,0,0)` : `translate3d(0,${-next}px,0)`;
    onMove?.(next);
  };

  useImperativeHandle(ref, () => ({ by: (px) => apply(offset.current + px), to: (px) => apply(px) }));

  useLayoutEffect(() => {
    offset.current = 0;
    if (inner.current) inner.current.style.transform = 'translate3d(0,0,0)';
    onMove?.(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const onFocus = (e: React.FocusEvent) => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    o.scrollLeft = 0;
    o.scrollTop = 0;
    let target = e.target as HTMLElement;
    const section = target.closest ? (target.closest('[data-section]') as HTMLElement | null) : null;
    if (section && section !== i && i.contains(section)) target = section;
    const r = target.getBoundingClientRect();
    const ir = i.getBoundingClientRect();
    const start = x ? r.left - ir.left : r.top - ir.top;
    const size = x ? r.width : r.height;
    const view = x ? o.clientWidth : o.clientHeight;
    const after = padEnd ?? pad;
    const v = offset.current;
    if (align === 'start' || size + pad + after > view) apply(start - pad);
    else if (start - pad < v) apply(start - pad);
    else if (start + size + after > v + view) apply(start + size + after - view);
  };

  return (
    <div ref={outer} className={`scroller scroller-${axis} ${className}`} onFocus={onFocus}>
      <div ref={inner} className={`scroller-inner ${innerClassName}`}>{children}</div>
    </div>
  );
});
