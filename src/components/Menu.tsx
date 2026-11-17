import { Spotlight } from '@enact/spotlight';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useBack } from '../lib/back';
import { focusElement, Focusable, Trap } from './spot';

// Panels over a page (a title's ⋯ menu, Media Info, a library's Sort and Filters, the player's
// menus): the focus stays inside until Back or a choice closes it, then goes back to what opened it.

let nextId = 0;
// Where the focus goes back to as each open panel closes. A panel opened from another (Media
// Info from the ⋯ menu) goes back to what opened the first.
const returns: (HTMLElement | null)[] = [];

function inPanel(el: HTMLElement | null) {
  return !!el && (!document.body.contains(el) || !!(el.closest && el.closest('.overlay, .side-panel, .popover')));
}

/** Moves the focus into a panel when it opens and back to where it was when it closes. */
export function useFocusTrap(): string {
  const id = useRef(`trap-${++nextId}`).current;
  useEffect(() => {
    const current = Spotlight.getCurrent() as HTMLElement | null;
    const prev = inPanel(current) && returns.length ? returns[returns.length - 1] : current;
    returns.push(prev);
    const timer = window.setTimeout(() => Spotlight.focus(id), 0);
    return () => {
      window.clearTimeout(timer);
      // After the panel's gone, so its own items can't take the focus back (and a panel opening
      // in its place still knows where to return).
      window.setTimeout(() => {
        returns.splice(returns.lastIndexOf(prev), 1);
        if (prev && document.body.contains(prev)) focusElement(prev);
        else if (!Spotlight.getCurrent()) Spotlight.focus();
      }, 0);
    };
  }, [id]);
  return id;
}

export function Overlay({ width = 840, onClose, children, className = '' }: { width?: number; onClose: () => void; children: ReactNode; className?: string }) {
  const id = useFocusTrap();
  useBack(() => { onClose(); });
  return (
    <div className="overlay">
      <Trap spotlightId={id} className={`overlay-panel ${className}`} style={{ width }}>
        {children}
      </Trap>
    </div>
  );
}

/** A panel down the right of the screen (the player's menus). */
export function SidePanel({ title, body, onClose, children }: { title: string; body?: string; onClose: () => void; children: ReactNode }) {
  const id = useFocusTrap();
  useBack(() => { onClose(); });
  return (
    <Trap spotlightId={id} className="side-panel">
      <h2>{title}</h2>
      {body && <p className="muted">{body}</p>}
      {children}
    </Trap>
  );
}

export function MenuItem({ icon, label, detail, checked, onClick, first }: {
  icon?: ReactNode;
  label: string;
  detail?: string;
  checked?: boolean;
  onClick: () => void;
  first?: boolean;
}) {
  return (
    <Focusable className="menu-item" onClick={onClick} data-default={first || undefined}>
      <span className="menu-icon">{checked ? '✓' : icon ?? ''}</span>
      <span className="menu-text">
        <span className="menu-label">{label}</span>
        {detail && <span className="menu-detail">{detail}</span>}
      </span>
    </Focusable>
  );
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className="menu-heading">{children}</div>;
}

/**
 * A title's menu as the Apple TV app draws its context menus: a floating rounded list beside what
 * opened it (the focused card or button), each choice's name on the left and its icon on the right.
 */
export function Popover({ title, body, place = 'side', shade = true, from, onClose, children }: {
  title?: string;
  body?: string;
  /** 'side': beside the opener, tops level (a card's menu). 'above': over it, right edges level (the player's menus). 'below': under it, right edges level (a library's Sort and Filters). */
  place?: 'side' | 'above' | 'below';
  shade?: boolean;
  /** The opener's box, when it isn't the focused element (a list that changes page keeps its place). */
  from?: ClientRect;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useFocusTrap();
  useBack(() => { onClose(); });
  // Where the opener is, read once as the menu opens (the focus is still on it then).
  const [at] = useState(() => {
    const el = from ? null : (Spotlight.getCurrent() as HTMLElement | null);
    const r = from ?? (el ? el.getBoundingClientRect() : null);
    const scale = window.innerWidth / 1920 || 1;
    if (!r) return { left: 680, top: 300, above: 0 };
    if (place === 'above') {
      const left = Math.max(40, Math.min(1880 - POPOVER_WIDTH, r.right / scale - POPOVER_WIDTH));
      return { left, top: 40, above: r.top / scale - 24 };
    }
    if (place === 'below') {
      const left = Math.max(40, Math.min(1880 - POPOVER_WIDTH, r.right / scale - POPOVER_WIDTH));
      return { left, top: r.bottom / scale + 20, above: 0 };
    }
    const right = r.right / scale + 28;
    const left = right + POPOVER_WIDTH <= 1880 ? right : Math.max(40, r.left / scale - 28 - POPOVER_WIDTH);
    // The focused card is drawn enlarged: line up with its resting top, not the grown one.
    const restingTop = (r.top + r.height / 2) / scale - (el ? el.offsetHeight : 0) / 2;
    return { left, top: Math.max(40, restingTop), above: 0 };
  });
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(at.top);
  // Measured after every render: what's in it can arrive later (playlists loading, Play Next once
  // the server says it keeps queues), and a taller list has to move up to stay on screen.
  useLayoutEffect(() => {
    const h = box.current ? box.current.offsetHeight : 0;
    // Level with the opener (or ending just above it), moved only as far as it takes to fit.
    setTop(Math.max(40, Math.min(at.above ? at.above - h : at.top, 1040 - h)));
  });
  return (
    <div className={shade ? 'popover-shade' : 'popover-layer'}>
      <div ref={box} className="popover-place" style={{ left: at.left, top, width: POPOVER_WIDTH }}>
        <Trap spotlightId={id} className="popover">
          {title && <div className="popover-title">{title}</div>}
          {body && <div className="popover-body">{body}</div>}
          {children}
        </Trap>
      </div>
    </div>
  );
}

const POPOVER_WIDTH = 560;

export function PopoverItem({ icon, label, detail, onClick, first }: { icon: string; label: string; detail?: string; onClick: () => void; first?: boolean }) {
  return (
    <Focusable className={`popover-item${detail ? ' with-detail' : ''}`} onClick={onClick} data-default={first || undefined}>
      <span className="popover-text">
        <span className="popover-label">{label}</span>
        {detail && <span className="popover-detail">{detail}</span>}
      </span>
      {icon ? <Icon name={icon} size={30} /> : <span className="popover-noicon" />}
    </Focusable>
  );
}
